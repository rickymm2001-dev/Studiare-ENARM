/**
 * Sincronización entre dispositivos (D-085 fila 12, D-095).
 *
 * Qué hace. Decide qué se sube al servidor, qué se baja y quién gana cuando dos dispositivos
 * editaron lo mismo. No sabe de red ni de bases de datos. Recibe registros y devuelve decisiones.
 * Entradas. Los mazos, notas, tarjetas y apuntes propios, la distribución del Inicio, la bitácora y
 * lo que el servidor devolvió.
 * Salidas. Lotes para subir con el formato del servidor, registros ya validados para guardar
 * aquí, y los tiempos de espera entre reintentos.
 * Método. Cada registro lleva su fecha de modificación. Gana la más reciente. Un borrado es un
 * registro con marca de borrado, así el otro dispositivo se entera. Con la misma fecha el servidor
 * deja lo que ya tenía y cada navegador adopta lo del servidor, así todos convergen a lo mismo sin
 * importar en qué orden sincronicen. La bitácora solo se agrega y se identifica por su ID, así
 * subir o bajar dos veces el mismo evento no lo duplica. El ID del alumno cambia de un dispositivo a
 * otro porque cada navegador crea el suyo, así que no viaja. El servidor sabe de quién es cada fila
 * por su sesión, y aquí el dueño se escribe como $self y se vuelve a poner al bajar.
 * Umbrales. Lotes de 500, reloj del dispositivo a menos de 5 minutos del servidor para poder
 * subir y marcas de agua, de los registros y de los eventos, que nunca pasan de hace 30 segundos.
 */
import type { z } from 'zod';
import { WidgetLayoutSchema, type WidgetLayout } from '@/data/schemas/activity';
import {
  CardSchema,
  DeckSchema,
  NoteSchema,
  modifiedAt,
  type Card,
  type Deck,
  type Note,
} from '@/data/schemas/decks';
import { AppEventSchema, type AppEvent } from '@/data/schemas/events';
import { OutlineSchema, type Outline } from '@/data/schemas/outlines';

export const SYNC_KINDS = ['deck', 'note', 'card', 'outline', 'widget_layout'] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

/** El dueño de un registro en el servidor. El ID real del alumno es de cada navegador */
export const SELF = '$self';
/** Cada alumno tiene una sola distribución del Inicio, así que su ID en el servidor es fijo */
export const WIDGET_LAYOUT_ID = 'layout';
export const PAGE_SIZE = 500;
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;
/** Cuánto atrás de ahora no se avanza la marca de agua de los registros */
export const SETTLE_MS = 30_000;
export const RETRY_BASE_MS = 5_000;
export const RETRY_MAX_MS = 5 * 60_000;

export type SyncItem =
  | { kind: 'deck'; value: Deck }
  | { kind: 'note'; value: Note }
  | { kind: 'card'; value: Card }
  | { kind: 'outline'; value: Outline }
  | { kind: 'widget_layout'; value: WidgetLayout };

/** Un registro con la forma que tiene en el servidor */
export interface WireRecord {
  kind: SyncKind;
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  data: Record<string, unknown>;
}

/** Un evento con la forma que tiene en el servidor. No lleva el ID del alumno */
export interface WireEvent {
  id: string;
  type: string;
  at: string;
  tz: string;
  sessionId: string | null;
  schemaVersion: number;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Identidad y fecha de un registro

export function idOf(item: SyncItem): string {
  return item.kind === 'widget_layout' ? WIDGET_LAYOUT_ID : item.value.id;
}

export function keyOf(item: SyncItem): string {
  return `${item.kind}:${idOf(item)}`;
}

/** Cuándo cambió por última vez. Es lo que decide quién gana */
export function stampOf(item: SyncItem): string {
  return item.kind === 'widget_layout' ? item.value.updatedAt : modifiedAt(item.value);
}

export function deletedAtOf(item: SyncItem): string | null {
  return item.kind === 'widget_layout' ? null : (item.value.deletedAt ?? null);
}

/** Texto con las llaves en orden, para comparar dos registros sin que importe el orden de sus campos */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------------------------
// Qué se sincroniza

/**
 * Los mazos que se sincronizan son los propios del alumno. Lo precargado y lo de demostración
 * viene con la app y cada dispositivo ya lo tiene
 */
export function isSyncableDeck(deck: Deck, userId: string): boolean {
  return deck.ownerId === userId && deck.origin !== 'preloaded' && !deck.isDemo;
}

export interface LocalData {
  userId: string;
  /** Todos los mazos, también los marcados como borrados */
  decks: readonly Deck[];
  notes: readonly Note[];
  cards: readonly Card[];
  outlines: readonly Outline[];
  layout: WidgetLayout | null;
}

/** Lo que este dispositivo tiene y debe estar en el servidor */
export function collectSyncable(data: LocalData): SyncItem[] {
  const decks = data.decks.filter((deck) => isSyncableDeck(deck, data.userId));
  const deckIds = new Set(decks.map((deck) => deck.id));
  const items: SyncItem[] = [];
  for (const value of decks) items.push({ kind: 'deck', value });
  for (const value of data.notes) {
    if (deckIds.has(value.deckId) && !value.isDemo) items.push({ kind: 'note', value });
  }
  for (const value of data.cards) {
    if (deckIds.has(value.deckId)) items.push({ kind: 'card', value });
  }
  for (const value of data.outlines) {
    if (value.ownerId === data.userId) items.push({ kind: 'outline', value });
  }
  if (data.layout?.userId === data.userId)
    items.push({ kind: 'widget_layout', value: data.layout });
  return items;
}

// ---------------------------------------------------------------------------------------------
// Del navegador al servidor y de vuelta

const OWNER_FIELD = {
  deck: 'ownerId',
  note: null,
  card: null,
  outline: 'ownerId',
  widget_layout: 'userId',
} as const satisfies Record<SyncKind, string | null>;

const SCHEMAS = {
  deck: DeckSchema,
  note: NoteSchema,
  card: CardSchema,
  outline: OutlineSchema,
  widget_layout: WidgetLayoutSchema,
} as const satisfies Record<SyncKind, z.ZodType>;

export function toWire(item: SyncItem, userId: string): WireRecord {
  const data: Record<string, unknown> = { ...item.value };
  const owner = OWNER_FIELD[item.kind];
  if (owner && data[owner] === userId) data[owner] = SELF;
  return {
    kind: item.kind,
    id: idOf(item),
    updatedAt: stampOf(item),
    deletedAt: deletedAtOf(item),
    data,
  };
}

export type FromWireResult =
  | { ok: true; item: SyncItem }
  | { ok: false; reason: 'unknown_kind' | 'invalid' | 'not_own' | 'forbidden' | 'id_mismatch' };

/**
 * Valida lo que llegó del servidor antes de guardarlo. El servidor es un tercero, así que un
 * registro que no cumple el esquema, que trae otro dueño o que intenta pasar como contenido
 * precargado o de demostración se descarta
 */
export function fromWire(wire: WireRecord, userId: string): FromWireResult {
  if (!(SYNC_KINDS as readonly string[]).includes(wire.kind)) {
    return { ok: false, reason: 'unknown_kind' };
  }
  const data: Record<string, unknown> = { ...wire.data };
  const owner = OWNER_FIELD[wire.kind];
  if (owner) {
    if (data[owner] !== SELF) return { ok: false, reason: 'not_own' };
    data[owner] = userId;
  }
  const parsed = SCHEMAS[wire.kind].safeParse(data);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const item = { kind: wire.kind, value: parsed.data } as SyncItem;
  if (idOf(item) !== wire.id) return { ok: false, reason: 'id_mismatch' };
  if (item.kind === 'deck' && (item.value.origin === 'preloaded' || item.value.isDemo)) {
    return { ok: false, reason: 'forbidden' };
  }
  if (item.kind === 'note' && (item.value.origin === 'preloaded' || item.value.isDemo)) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, item };
}

// ---------------------------------------------------------------------------------------------
// Quién gana

/**
 * Si lo que llegó del servidor reemplaza a lo local. Gana la fecha más reciente y, con la misma
 * fecha, gana el servidor, porque él ya decidió entre las dos
 */
export function remoteWins(local: SyncItem | undefined, remote: SyncItem): boolean {
  if (!local) return true;
  const remoteStamp = stampOf(remote);
  const localStamp = stampOf(local);
  if (remoteStamp !== localStamp) return remoteStamp > localStamp;
  // Misma fecha. Si son idénticos no hay nada que guardar
  return canonical(local.value) !== canonical(remote.value);
}

/** De lo que bajó, lo que hay que guardar aquí. Lo local más nuevo se queda como está */
export function planPull(
  local: ReadonlyMap<string, SyncItem>,
  incoming: readonly SyncItem[],
): SyncItem[] {
  return incoming.filter((remote) => remoteWins(local.get(keyOf(remote)), remote));
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Los registros por subir, en orden de fecha y con la llave como desempate. La marca de agua es la
 * fecha desde la que todo ya está en el servidor. Se sube lo que tiene una fecha posterior. El
 * orden es el mismo en cada llamada, así el envío por lotes avanza sin repetirse
 */
export function planPush(
  items: readonly SyncItem[],
  watermark: string | null,
  userId: string,
): WireRecord[] {
  return items
    .filter((item) => watermark === null || stampOf(item) > watermark)
    .sort((a, b) => compareText(stampOf(a), stampOf(b)) || compareText(keyOf(a), keyOf(b)))
    .map((item) => toWire(item, userId));
}

/**
 * La marca de agua después de haber enviado los primeros `sent` registros del plan. Hay dos cuidados
 * que evitan perder un cambio.
 * - Un lote cortado a la mitad de un grupo con la misma fecha, como las tarjetas de una importación,
 *   no cuenta ese grupo como enviado, y la marca se queda en la fecha anterior más alta
 * - La marca nunca pasa de hace 30 segundos. Un registro que se guarda mientras corre la
 *   sincronización, aunque lleve la misma milésima que otro que ya se subió, queda por delante y se
 *   sube en la siguiente. Los repetidos no cambian nada en el servidor
 */
export function watermarkAfter(
  plan: readonly WireRecord[],
  sent: number,
  previous: string | null,
  deviceNow: Date,
): string | null {
  if (sent <= 0 || plan.length === 0) return previous;
  const taken = Math.min(sent, plan.length);
  const last = plan[taken - 1];
  const next = plan[taken];
  if (!last) return previous;
  let reached: string | null = last.updatedAt;
  if (next?.updatedAt === last.updatedAt) {
    reached = null;
    for (let index = taken - 1; index >= 0; index -= 1) {
      const stamp = plan[index]?.updatedAt;
      if (stamp !== undefined && stamp < last.updatedAt) {
        reached = stamp;
        break;
      }
    }
  }
  if (reached === null) return previous;
  const settled = new Date(deviceNow.getTime() - SETTLE_MS).toISOString();
  const capped = reached < settled ? reached : settled;
  return previous !== null && previous > capped ? previous : capped;
}

// ---------------------------------------------------------------------------------------------
// Bitácora

export function eventToWire(event: AppEvent): WireEvent {
  return {
    id: event.id,
    type: event.type,
    at: event.at,
    tz: event.tz,
    sessionId: event.sessionId,
    schemaVersion: event.schemaVersion,
    payload: event.payload,
  };
}

/** El evento que bajó, con el ID del alumno de este navegador. null si no cumple el esquema */
export function eventFromWire(wire: WireEvent, userId: string): AppEvent | null {
  const parsed = AppEventSchema.safeParse({
    id: wire.id,
    type: wire.type,
    userId,
    at: wire.at,
    tz: wire.tz,
    schemaVersion: wire.schemaVersion,
    sessionId: wire.sessionId,
    payload: wire.payload,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * La marca de agua de la bitácora después de enviar hasta el evento de la fecha dada, en orden de
 * tiempo. No retrocede y, como la de los registros, no pasa de hace 30 segundos. Los eventos se
 * vuelven a mirar desde esa fecha, incluida, así un empate cortado entre dos páginas no pierde
 * ninguno, y el servidor ignora el que ya tiene por su ID
 */
export function nextEventWatermark(
  previous: string | null,
  lastSentAt: string,
  deviceNow: Date,
): string {
  const settled = new Date(deviceNow.getTime() - SETTLE_MS).toISOString();
  const reached = lastSentAt < settled ? lastSentAt : settled;
  return previous !== null && previous > reached ? previous : reached;
}

// ---------------------------------------------------------------------------------------------
// Reloj y reintentos

/** Cuánto se adelanta (positivo) o se atrasa (negativo) el reloj del dispositivo frente al servidor */
export function clockSkewMs(deviceNow: Date, serverNow: Date): number {
  return deviceNow.getTime() - serverNow.getTime();
}

/** La regla de la fecha más reciente solo vale si los relojes se parecen */
export function clockIsTrustworthy(skewMs: number): boolean {
  return Number.isFinite(skewMs) && Math.abs(skewMs) <= MAX_CLOCK_SKEW_MS;
}

/** Espera antes del siguiente intento tras fallar. 5 s, 10 s, 20 s y así hasta 5 minutos */
export function retryDelayMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures - 1));
}
