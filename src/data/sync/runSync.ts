// Una sincronización completa entre este navegador y el servidor (D-085 fila 12, D-095). Va en este
// orden. Se comprueba el reloj, se bajan los registros y la bitácora, y después se suben los cambios
// propios. Bajar primero hace que lo que se edita encima de lo recién bajado gane por su fecha. Cada
// página que se baja o se sube deja guardado su avance, así un corte a la mitad continúa donde
// quedó. Las decisiones de qué gana viven en el motor src/engines/sync.ts.
import {
  PAGE_SIZE,
  SETTLE_MS,
  clockIsTrustworthy,
  clockSkewMs,
  collectSyncable,
  eventFromWire,
  eventToWire,
  fromWire,
  keyOf,
  nextEventWatermark,
  planPush,
  remoteWins,
  stampOf,
  watermarkAfter,
  type SyncItem,
} from '@/engines/sync';
import type { DataApi } from '../context';
import type { AppEvent } from '../schemas/events';
import { emptySyncState, type SyncState } from '../schemas/sync';
import { recordEventOnce } from '../usecases/recordEvent';
import { SyncTransportError, type SyncFailure, type SyncTransport } from './transport';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;

export interface SyncDeps {
  api: Api;
  transport: SyncTransport;
  /** El perfil de este navegador */
  userId: string;
  /** La cuenta de la nube. Si cambia, el avance guardado ya no sirve */
  authId: string;
  now?: () => Date;
}

export interface SyncCounts {
  recordsPulled: number;
  recordsPushed: number;
  eventsPulled: number;
  eventsPushed: number;
  /** Lo que bajó y no se guardó por no cumplir el esquema, traer otro dueño o ser de una versión nueva */
  rejected: number;
}

export type SyncResult =
  | ({ status: 'ok'; at: string } & SyncCounts)
  | { status: 'clock_skew'; skewMs: number }
  | { status: 'failed'; failure: SyncFailure; detail: string };

const KIND_ORDER = ['deck', 'note', 'card', 'outline', 'widget_layout'] as const;

async function loadState(api: Api, userId: string, authId: string): Promise<SyncState> {
  const saved = await api.repos.syncState.get(userId);
  if (saved?.authId === authId) return saved;
  const fresh = emptySyncState(userId, authId);
  await api.repos.syncState.put(fresh);
  return fresh;
}

/** Lo que este navegador tiene hoy de un registro, con las marcas de borrado incluidas */
async function localItem(
  api: Api,
  userId: string,
  incoming: SyncItem,
): Promise<SyncItem | undefined> {
  const { repos } = api;
  switch (incoming.kind) {
    case 'deck': {
      const value = await repos.decks.getRaw(incoming.value.id);
      return value && { kind: 'deck', value };
    }
    case 'note': {
      const value = await repos.notes.getRaw(incoming.value.id);
      return value && { kind: 'note', value };
    }
    case 'card': {
      const value = await repos.cards.getRaw(incoming.value.id);
      return value && { kind: 'card', value };
    }
    case 'outline': {
      const value = await repos.outlines.getRaw(incoming.value.id);
      return value && { kind: 'outline', value };
    }
    case 'widget_layout': {
      const value = await repos.widgetLayouts.get(userId);
      return value && { kind: 'widget_layout', value };
    }
  }
}

/**
 * Guarda lo que bajó y le gana a lo local. Se vuelve a leer cada registro justo antes de guardar,
 * porque el alumno pudo editarlo mientras la página viajaba. Devuelve cuántos guardó
 */
async function applyIncoming(
  api: Api,
  userId: string,
  items: readonly SyncItem[],
): Promise<number> {
  const winners: SyncItem[] = [];
  for (const incoming of items) {
    if (remoteWins(await localItem(api, userId, incoming), incoming)) winners.push(incoming);
  }
  const { repos } = api;
  for (const kind of KIND_ORDER) {
    const group = winners.filter((item) => item.kind === kind);
    if (group.length === 0) continue;
    switch (kind) {
      case 'deck':
        await repos.decks.putMany(
          group.flatMap((item) => (item.kind === 'deck' ? [item.value] : [])),
        );
        break;
      case 'note':
        await repos.notes.putMany(
          group.flatMap((item) => (item.kind === 'note' ? [item.value] : [])),
        );
        break;
      case 'card':
        await repos.cards.putMany(
          group.flatMap((item) => (item.kind === 'card' ? [item.value] : [])),
        );
        break;
      case 'outline':
        await repos.outlines.putMany(
          group.flatMap((item) => (item.kind === 'outline' ? [item.value] : [])),
        );
        break;
      case 'widget_layout':
        for (const item of group) {
          if (item.kind === 'widget_layout') await repos.widgetLayouts.put(item.value);
        }
        break;
    }
  }
  return winners.length;
}

async function pullRecords(
  deps: SyncDeps,
  state: SyncState,
  counts: SyncCounts,
  fromServer: Map<string, string>,
): Promise<SyncState> {
  let current = state;
  for (;;) {
    const page = await deps.transport.pullRecords(current.recordsCursor, PAGE_SIZE);
    const items: SyncItem[] = [];
    for (const row of page.rows) {
      const parsed = fromWire(row.record, deps.userId);
      if (parsed.ok) {
        items.push(parsed.item);
        fromServer.set(keyOf(parsed.item), stampOf(parsed.item));
      } else {
        counts.rejected += 1;
      }
    }
    counts.recordsPulled += await applyIncoming(deps.api, deps.userId, items);
    // Un servidor que no hace avanzar el cursor no puede dejar esto girando
    const moved = page.next > current.recordsCursor;
    if (moved) {
      current = { ...current, recordsCursor: page.next };
      await deps.api.repos.syncState.put(current);
    }
    if (!page.more || !moved) return current;
  }
}

async function pullEvents(
  deps: SyncDeps,
  state: SyncState,
  counts: SyncCounts,
  onServer: Set<string>,
): Promise<SyncState> {
  let current = state;
  for (;;) {
    const page = await deps.transport.pullEvents(current.eventsCursor, PAGE_SIZE);
    const events: AppEvent[] = [];
    for (const row of page.rows) {
      const event = eventFromWire(row.event, deps.userId);
      if (event) events.push(event);
      else counts.rejected += 1;
    }
    if (events.length > 0) {
      // Los eventos propios que subió este navegador vuelven en la bajada. Se ven por su ID en el rango
      // de tiempo de la página y solo se guardan los que faltan
      const times = events.map((event) => event.at).sort();
      const known = new Set(
        (
          await deps.api.repos.events.query({
            userId: deps.userId,
            from: times[0],
            to: times.at(-1),
          })
        ).map((event) => event.id),
      );
      for (const event of events) {
        onServer.add(event.id);
        if (known.has(event.id)) continue;
        await recordEventOnce(deps.api, event);
        counts.eventsPulled += 1;
      }
    }
    const moved = page.next > current.eventsCursor;
    if (moved) {
      current = { ...current, eventsCursor: page.next };
      await deps.api.repos.syncState.put(current);
    }
    if (!page.more || !moved) return current;
  }
}

async function pushRecords(
  deps: SyncDeps,
  state: SyncState,
  counts: SyncCounts,
  fromServer: ReadonlyMap<string, string>,
  now: () => Date,
): Promise<SyncState> {
  const { repos } = deps.api;
  const items = collectSyncable({
    userId: deps.userId,
    decks: await repos.decks.listAll(),
    notes: await repos.notes.listAll(),
    cards: await repos.cards.listAll(),
    outlines: await repos.outlines.listAll(),
    layout: (await repos.widgetLayouts.get(deps.userId)) ?? null,
  });
  // Lo que se acaba de bajar tal cual ya está en el servidor y no se devuelve
  const own = items.filter((item) => fromServer.get(keyOf(item)) !== stampOf(item));
  const plan = planPush(own, state.recordsWatermark, deps.userId);
  let current = state;
  for (let sent = 0; sent < plan.length; sent += PAGE_SIZE) {
    const chunk = plan.slice(sent, sent + PAGE_SIZE);
    await deps.transport.pushRecords(chunk);
    counts.recordsPushed += chunk.length;
    current = {
      ...current,
      recordsWatermark: watermarkAfter(plan, sent + chunk.length, current.recordsWatermark, now()),
    };
    await repos.syncState.put(current);
  }
  // Con todo enviado, la marca de agua avanza hasta el registro más nuevo que ya está en el servidor,
  // sea porque se subió o porque vino de ahí, sin pasar de hace 30 segundos. Así lo que bajó de
  // otro dispositivo no se devuelve en la siguiente sincronización
  if (items.length > 0) {
    const newest = items.reduce((max, item) => (stampOf(item) > max ? stampOf(item) : max), '');
    const settled = new Date(now().getTime() - SETTLE_MS).toISOString();
    const reached = newest < settled ? newest : settled;
    if (current.recordsWatermark === null || reached > current.recordsWatermark) {
      current = { ...current, recordsWatermark: reached };
      await repos.syncState.put(current);
    }
  }
  return current;
}

async function pushEvents(
  deps: SyncDeps,
  state: SyncState,
  counts: SyncCounts,
  onServer: ReadonlySet<string>,
  now: () => Date,
): Promise<SyncState> {
  const { repos } = deps.api;
  let current = state;
  const from = current.eventsWatermark;
  const page: AppEvent[] = [];
  let newest = '';
  const advance = async (reached: string) => {
    const next = nextEventWatermark(current.eventsWatermark, reached, now());
    if (next === current.eventsWatermark) return;
    current = { ...current, eventsWatermark: next };
    await repos.syncState.put(current);
  };
  const flush = async (complete: boolean) => {
    const last = page.at(-1);
    if (!last) return;
    await deps.transport.pushEvents(page.map(eventToWire));
    counts.eventsPushed += page.length;
    // Un lote cortado a la mitad de un grupo con la misma hora no da por enviado ese grupo. Solo
    // cuenta como enviada una hora anterior a la del último. Al final del recorrido ya no queda más
    let reached: string | undefined = last.at;
    if (!complete) {
      reached = undefined;
      for (let index = page.length - 1; index >= 0; index -= 1) {
        const at = page[index]?.at;
        if (at !== undefined && at < last.at) {
          reached = at;
          break;
        }
      }
    }
    if (reached !== undefined) await advance(reached);
    page.length = 0;
  };
  // La marca de agua es la hora hasta la que ya está todo, sin incluirla. stream incluye la hora
  // de inicio, así que el primer grupo se salta aquí
  for await (const event of repos.events.stream({
    userId: deps.userId,
    ...(from === null ? {} : { from }),
  })) {
    if (from !== null && event.at <= from) continue;
    newest = event.at;
    if (onServer.has(event.id)) continue;
    page.push(event);
    if (page.length >= PAGE_SIZE) await flush(false);
  }
  await flush(true);
  // Todo lo recorrido ya está en el servidor, sea porque se subió o porque vino de ahí. La marca de
  // agua llega hasta el último, así lo que bajó de otro dispositivo no se vuelve a recorrer
  if (newest !== '') await advance(newest);
  return current;
}

/**
 * Sincroniza. No lanza nunca. Un fallo de red, de sesión o de dispositivo vuelve como resultado, y
 * lo que ya se alcanzó a guardar queda guardado para el siguiente intento
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const now = deps.now ?? (() => new Date());
  try {
    const skew = clockSkewMs(now(), await deps.transport.serverTime());
    // Con el reloj desfasado la fecha más reciente no es de fiar. Se avisa y no se mueve nada
    if (!clockIsTrustworthy(skew)) return { status: 'clock_skew', skewMs: skew };

    const counts: SyncCounts = {
      recordsPulled: 0,
      recordsPushed: 0,
      eventsPulled: 0,
      eventsPushed: 0,
      rejected: 0,
    };
    const fromServer = new Map<string, string>();
    const eventsOnServer = new Set<string>();

    let state = await loadState(deps.api, deps.userId, deps.authId);
    state = await pullRecords(deps, state, counts, fromServer);
    state = await pullEvents(deps, state, counts, eventsOnServer);
    state = await pushRecords(deps, state, counts, fromServer, now);
    state = await pushEvents(deps, state, counts, eventsOnServer, now);

    const at = now().toISOString();
    await deps.api.repos.syncState.put({ ...state, lastSyncAt: at });
    return { status: 'ok', at, ...counts };
  } catch (error) {
    if (error instanceof SyncTransportError) {
      return { status: 'failed', failure: error.failure, detail: error.message };
    }
    return {
      status: 'failed',
      failure: 'local',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
