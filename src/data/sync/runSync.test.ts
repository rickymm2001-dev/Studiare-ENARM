import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlanKey } from '@/config/billing';
import { PAGE_SIZE, eventToWire } from '@/engines/sync';
import { createEvent } from '../events/createEvent';
import type { Card, Deck, Note } from '../schemas/decks';
import type { Outline } from '../schemas/outlines';
import { UserSettingsSchema } from '../schemas/people';
import { makeUser, newId, testApi } from '../testing/fixtures';
import { runSync, type SyncResult } from './runSync';
import { createMemoryServer, memoryTransport, type MemoryServer } from './testing/memoryTransport';
import { SyncTransportError, type Page, type PulledRecord, type SyncTransport } from './transport';

const AUTH = 'cuenta-de-prueba';
const BASE = Date.parse('2026-10-08T10:00:00.000Z');
const at = (seconds: number) => new Date(BASE + seconds * 1000);

interface Device {
  api: ReturnType<typeof testApi>;
  userId: string;
  clock: { seconds: number };
  sync: (overrides?: {
    transport?: SyncTransport;
    authId?: string;
    plan?: PlanKey;
    supportedEventVersion?: number;
  }) => Promise<SyncResult>;
}

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function device(server: MemoryServer): Device {
  const api = testApi('real');
  disposers.push(() => api.dispose());
  const userId = newId();
  const clock = { seconds: 100 };
  const now = () => at(clock.seconds);
  return {
    api,
    userId,
    clock,
    sync: (overrides) =>
      runSync({
        api,
        transport: overrides?.transport ?? memoryTransport(server, now),
        userId,
        authId: overrides?.authId ?? AUTH,
        ...(overrides?.plan ? { plan: overrides.plan } : {}),
        ...(overrides?.supportedEventVersion
          ? { supportedEventVersion: overrides.supportedEventVersion }
          : {}),
        now,
      }),
  };
}

function deckOf(d: Device, overrides: Partial<Deck> = {}): Deck {
  const stamp = at(d.clock.seconds).toISOString();
  return {
    id: newId(),
    name: 'Mi mazo',
    description: '',
    ownerId: d.userId,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    parentId: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

function noteOf(d: Device, deckId: string, overrides: Partial<Note> = {}): Note {
  const stamp = at(d.clock.seconds).toISOString();
  return {
    id: newId(),
    deckId,
    tags: [],
    origin: 'manual',
    editorialStatus: 'draft',
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: false,
    createdAt: stamp,
    updatedAt: stamp,
    kind: 'basic',
    front: '<p>Frente</p>',
    back: '<p>Reverso</p>',
    ...overrides,
  } as Note;
}

function cardOf(d: Device, note: Note): Card {
  const stamp = at(d.clock.seconds).toISOString();
  return {
    id: newId(),
    noteId: note.id,
    deckId: note.deckId,
    ordinal: 0,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function outlineOf(d: Device, deckId: string): Outline {
  const stamp = at(d.clock.seconds).toISOString();
  return {
    id: newId(),
    ownerId: d.userId,
    title: 'Apunte',
    deckId,
    nodes: [{ id: newId(), text: 'Pregunta >> Respuesta', children: [] }],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function xpEvent(d: Device, seconds: number) {
  return createEvent(
    'xp_awarded',
    { amount: 10, reason: 'card_review', sourceEventId: null },
    { userId: d.userId, tz: 'America/Merida', clock: { now: () => at(seconds) } },
  );
}

/** Un mazo con una nota, su tarjeta, un apunte y un par de eventos */
async function fill(d: Device) {
  const deck = deckOf(d);
  const note = noteOf(d, deck.id);
  const card = cardOf(d, note);
  const outline = outlineOf(d, deck.id);
  await d.api.repos.decks.put(deck);
  await d.api.repos.notes.put(note);
  await d.api.repos.cards.put(card);
  await d.api.repos.outlines.put(outline);
  const first = xpEvent(d, d.clock.seconds);
  const second = xpEvent(d, d.clock.seconds + 1);
  await d.api.repos.events.append(first);
  await d.api.repos.events.append(second);
  return { deck, note, card, outline, events: [first, second] };
}

const ok = (result: SyncResult) => {
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error(`No terminó bien: ${JSON.stringify(result)}`);
  return result;
};

describe('sincronizar un dispositivo con el servidor', () => {
  it('sube mazos, notas, tarjetas, apuntes y eventos sin el ID del alumno', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    const result = ok(await a.sync());
    expect(result).toMatchObject({ recordsPushed: 4, eventsPushed: 2, recordsPulled: 0 });
    expect(server.records.size).toBe(4);
    expect(server.events.size).toBe(2);
    expect(JSON.stringify([...server.records.values(), ...server.events.values()])).not.toContain(
      a.userId,
    );
  });

  it('otro dispositivo de la misma cuenta recibe todo como suyo, con otro ID de alumno', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    ok(await a.sync());

    const b = device(server);
    b.clock.seconds = 200;
    const result = ok(await b.sync());
    expect(result).toMatchObject({ recordsPulled: 4, eventsPulled: 2 });
    expect(await b.api.repos.decks.get(made.deck.id)).toMatchObject({ ownerId: b.userId });
    expect(await b.api.repos.notes.get(made.note.id)).toMatchObject({ front: '<p>Frente</p>' });
    expect(await b.api.repos.cards.get(made.card.id)).toBeDefined();
    expect(await b.api.repos.outlines.get(made.outline.id)).toMatchObject({ ownerId: b.userId });
    const events = await b.api.repos.events.query({ userId: b.userId });
    expect(events.map((event) => event.id).sort()).toEqual(made.events.map((e) => e.id).sort());
    // Lo que bajó no se devuelve al servidor
    expect(server.pushedRecords.flat()).toHaveLength(4);
    expect(server.pushedEvents.flat()).toHaveLength(2);
  });

  it('lo que baja de otros dispositivos se guarda sin pasar por la analítica, que ya lo midió donde pasó (B15, 1.6)', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    ok(await a.sync());

    const b = device(server);
    b.clock.seconds = 200;
    const loud: string[] = [];
    const quiet: string[] = [];
    const now = () => at(b.clock.seconds);
    const api = {
      repos: b.api.repos,
      recordEvent: (event: Parameters<typeof b.api.recordEvent>[0]) => {
        loud.push(event.id);
        return b.api.recordEvent(event);
      },
      recordEventQuiet: (event: Parameters<typeof b.api.recordEvent>[0]) => {
        quiet.push(event.id);
        return b.api.recordEvent(event);
      },
    };
    const result = ok(
      await runSync({
        api,
        transport: memoryTransport(server, now),
        userId: b.userId,
        authId: AUTH,
        now,
      }),
    );
    expect(result.eventsPulled).toBe(2);
    expect(quiet.sort()).toEqual(made.events.map((event) => event.id).sort());
    // Ninguno de los que bajaron entró por el camino que mide
    expect(loud.filter((id) => quiet.includes(id))).toEqual([]);
  });

  it('sincronizar otra vez no mueve nada', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    ok(await a.sync());
    a.clock.seconds += 600;
    const again = ok(await a.sync());
    expect(again).toMatchObject({
      recordsPushed: 0,
      recordsPulled: 0,
      eventsPushed: 0,
      eventsPulled: 0,
    });
    expect(server.seq).toBe(6);
  });

  it('el dispositivo que subió no vuelve a guardar sus propios eventos al bajar', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    ok(await a.sync());
    // Otro dispositivo agrega un evento. A baja ese y los suyos, que ya tenía
    const b = device(server);
    b.clock.seconds = 300;
    ok(await b.sync());
    await b.api.repos.events.append(xpEvent(b, 300));
    ok(await b.sync());
    a.clock.seconds = 400;
    const result = ok(await a.sync());
    expect(result.eventsPulled).toBe(1);
    const events = await a.api.repos.events.query({ userId: a.userId });
    expect(events).toHaveLength(made.events.length + 1);
  });

  it('un borrado en un dispositivo se propaga y el mazo desaparece del otro', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    ok(await a.sync());
    const b = device(server);
    b.clock.seconds = 200;
    ok(await b.sync());
    expect(await b.api.repos.decks.get(made.deck.id)).toBeDefined();

    // A borra el mazo con su marca de borrado
    a.clock.seconds = 300;
    const stamp = at(300).toISOString();
    await a.api.repos.decks.put({ ...made.deck, updatedAt: stamp, deletedAt: stamp });
    ok(await a.sync());

    b.clock.seconds = 400;
    ok(await b.sync());
    expect(await b.api.repos.decks.get(made.deck.id)).toBeUndefined();
    expect(await b.api.repos.decks.getRaw(made.deck.id)).toMatchObject({ deletedAt: stamp });
    expect((await b.api.repos.decks.list()).map((deck) => deck.id)).not.toContain(made.deck.id);
  });
});

describe('dos dispositivos que editan lo mismo', () => {
  it('conserva la edición más reciente en los dos, sin importar quién sincroniza primero', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    ok(await a.sync());
    const b = device(server);
    b.clock.seconds = 150;
    ok(await b.sync());

    // Los dos editan la misma nota sin conexión. B edita después
    a.clock.seconds = 200;
    await a.api.repos.notes.put({
      ...made.note,
      front: '<p>Editada en A</p>',
      updatedAt: at(200).toISOString(),
    } as Note);
    b.clock.seconds = 260;
    await b.api.repos.notes.put({
      ...made.note,
      front: '<p>Editada en B</p>',
      updatedAt: at(260).toISOString(),
    } as Note);

    // B sube primero y después A, que tenía la edición más vieja
    ok(await b.sync());
    a.clock.seconds = 400;
    ok(await a.sync());
    b.clock.seconds = 410;
    ok(await b.sync());

    expect(await a.api.repos.notes.get(made.note.id)).toMatchObject({
      front: '<p>Editada en B</p>',
    });
    expect(await b.api.repos.notes.get(made.note.id)).toMatchObject({
      front: '<p>Editada en B</p>',
    });
    const stored = server.records.get(`note:${made.note.id}`);
    expect(stored?.record.data.front).toBe('<p>Editada en B</p>');
  });

  it('una edición posterior a un borrado en el otro dispositivo revive el registro', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    ok(await a.sync());
    const b = device(server);
    b.clock.seconds = 150;
    ok(await b.sync());

    const deletedAt = at(200).toISOString();
    await a.api.repos.cards.put({ ...made.card, updatedAt: deletedAt, deletedAt });
    a.clock.seconds = 210;
    ok(await a.sync());
    // B edita la nota después del borrado, sin saberlo
    b.clock.seconds = 300;
    await b.api.repos.cards.put({ ...made.card, ordinal: 1, updatedAt: at(300).toISOString() });
    ok(await b.sync());
    a.clock.seconds = 400;
    ok(await a.sync());
    expect(await a.api.repos.cards.get(made.card.id)).toMatchObject({ ordinal: 1 });
  });
});

describe('cuando algo falla', () => {
  it('sin conexión no se pierde nada y la siguiente vez termina', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    server.failWith = 'network';
    expect(await a.sync()).toMatchObject({ status: 'failed', failure: 'network' });
    expect(server.records.size).toBe(0);
    server.failWith = null;
    expect(ok(await a.sync())).toMatchObject({ recordsPushed: 4, eventsPushed: 2 });
  });

  it('un corte entre los registros y la bitácora continúa donde quedó', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    server.failNext = { call: 'pushEvents', failure: 'network' };
    expect(await a.sync()).toMatchObject({ status: 'failed', failure: 'network' });
    expect(server.records.size).toBe(4);
    expect(server.events.size).toBe(0);
    const state = await a.api.repos.syncState.get(a.userId);
    expect(state?.recordsWatermark).not.toBeNull();
    expect(state?.eventsWatermark).toBeNull();
    a.clock.seconds += 120;
    const result = ok(await a.sync());
    expect(result.recordsPushed).toBe(0);
    expect(result.eventsPushed).toBe(2);
    expect(server.events.size).toBe(2);
  });

  it('un dispositivo desplazado recibe el aviso y no cambia nada', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    server.failWith = 'device';
    expect(await a.sync()).toMatchObject({ status: 'failed', failure: 'device' });
  });

  it('con el reloj desfasado no sube ni baja nada', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    server.clockOffsetMs = 10 * 60_000;
    const result = await a.sync();
    expect(result).toMatchObject({ status: 'clock_skew' });
    expect(server.calls.pushRecords).toBe(0);
    expect(server.calls.pullRecords).toBe(0);
    expect(server.calls.pushEvents).toBe(0);
    server.clockOffsetMs = 60_000;
    ok(await a.sync());
  });

  it('un error local se devuelve como resultado y no como excepción', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const broken: SyncTransport = {
      ...memoryTransport(server, () => at(a.clock.seconds)),
      pullRecords: () => Promise.reject(new TypeError('boom')),
    };
    expect(await a.sync({ transport: broken })).toMatchObject({
      status: 'failed',
      failure: 'local',
      detail: 'boom',
    });
  });

  it('cambiar de cuenta de la nube reinicia el avance', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    ok(await a.sync());
    // La segunda vez baja lo que subió, que es lo que mueve el cursor
    a.clock.seconds += 60;
    ok(await a.sync());
    const before = await a.api.repos.syncState.get(a.userId);
    expect(before?.recordsCursor).toBeGreaterThan(0);
    const other = createMemoryServer();
    ok(
      await a.sync({
        transport: memoryTransport(other, () => at(a.clock.seconds)),
        authId: 'otra',
      }),
    );
    expect(other.records.size).toBe(4);
    expect((await a.api.repos.syncState.get(a.userId))?.authId).toBe('otra');
  });
});

describe('desconfiar del servidor', () => {
  it('descarta registros de otro dueño o con esquema roto y cuenta cuántos', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    ok(await a.sync());
    const wire = server.records.get(`deck:${made.deck.id}`);
    expect(wire).toBeDefined();
    // Un mazo que dice ser de otra persona, uno con el esquema roto y uno que finge ser precargado
    const hostile = [
      {
        ...wire?.record,
        id: newId(),
        data: { ...wire?.record.data, id: undefined, ownerId: newId() },
      },
      { ...wire?.record, id: newId(), data: { name: 'sin campos' } },
      {
        ...wire?.record,
        id: newId(),
        data: { ...wire?.record.data, origin: 'preloaded' },
      },
    ];
    for (const record of hostile) {
      const id = record.id;
      server.seq += 1;
      server.records.set(`deck:${id}`, {
        record: { ...(record as NonNullable<typeof wire>['record']), data: { ...record.data, id } },
        seq: server.seq,
      });
    }
    const b = device(server);
    b.clock.seconds = 300;
    const result = ok(await b.sync());
    expect(result.rejected).toBe(3);
    expect((await b.api.repos.decks.listAll()).map((deck) => deck.id)).toEqual([made.deck.id]);
  });

  it('un servidor que no hace avanzar el cursor no deja la sincronización girando', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    ok(await a.sync());
    const stuck: SyncTransport = {
      ...memoryTransport(server, () => at(a.clock.seconds)),
      pullRecords: (after): Promise<Page<PulledRecord>> =>
        Promise.resolve({ rows: [], next: after, more: true }),
    };
    a.clock.seconds += 60;
    expect(ok(await a.sync({ transport: stuck }))).toMatchObject({ recordsPulled: 0 });
  });
});

describe('volumen', () => {
  it('parte en páginas lo que sube y lo que baja, y no duplica nada', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const deck = deckOf(a);
    await a.api.repos.decks.put(deck);
    const notes = Array.from({ length: PAGE_SIZE * 2 + 30 }, () => noteOf(a, deck.id));
    await a.api.repos.notes.putMany(notes);
    for (let index = 0; index < PAGE_SIZE + 40; index += 1) {
      await a.api.repos.events.append(xpEvent(a, 100 + Math.floor(index / 5)));
    }
    const pushed = ok(await a.sync());
    expect(pushed.recordsPushed).toBe(notes.length + 1);
    expect(pushed.eventsPushed).toBe(PAGE_SIZE + 40);
    expect(server.pushedRecords.length).toBeGreaterThanOrEqual(3);
    expect(server.pushedEvents.length).toBe(2);

    const b = device(server);
    b.clock.seconds = 500;
    const pulled = ok(await b.sync());
    expect(pulled.recordsPulled).toBe(notes.length + 1);
    expect(pulled.eventsPulled).toBe(PAGE_SIZE + 40);
    expect(await b.api.repos.notes.list()).toHaveLength(notes.length);
    expect(await b.api.repos.events.query({ userId: b.userId })).toHaveLength(PAGE_SIZE + 40);

    // Y volver a sincronizar los dos no mueve nada
    b.clock.seconds = 900;
    expect(ok(await b.sync())).toMatchObject({
      recordsPushed: 0,
      eventsPushed: 0,
      eventsPulled: 0,
    });
    a.clock.seconds = 900;
    expect(ok(await a.sync())).toMatchObject({
      recordsPushed: 0,
      recordsPulled: 0,
      eventsPulled: 0,
    });
  }, 30_000);

  it('muchos registros con la misma fecha, como una importación, suben completos', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const stamp = at(100).toISOString();
    const deck = deckOf(a, { updatedAt: stamp });
    await a.api.repos.decks.put(deck);
    const notes = Array.from({ length: PAGE_SIZE + 200 }, () =>
      noteOf(a, deck.id, { updatedAt: stamp }),
    );
    await a.api.repos.notes.putMany(notes);
    ok(await a.sync());
    expect(server.records.size).toBe(notes.length + 1);
  });

  it('eventos con la misma hora cortados entre dos páginas no se pierden si el envío se interrumpe', async () => {
    const server = createMemoryServer();
    const a = device(server);
    // Más eventos con exactamente la misma hora que lo que cabe en una página
    for (let index = 0; index < PAGE_SIZE + 100; index += 1) {
      await a.api.repos.events.append(xpEvent(a, 100));
    }
    let calls = 0;
    const transport = memoryTransport(server, () => at(a.clock.seconds));
    const flaky: SyncTransport = {
      ...transport,
      pushEvents: (events) => {
        calls += 1;
        // La primera página llega y la segunda se corta
        return calls === 2
          ? Promise.reject(new SyncTransportError('network', 'corte'))
          : transport.pushEvents(events);
      },
    };
    a.clock.seconds = 400;
    expect(await a.sync({ transport: flaky })).toMatchObject({
      status: 'failed',
      failure: 'network',
    });
    expect(server.events.size).toBe(PAGE_SIZE);
    // La hora de ese grupo no se dio por enviada
    expect((await a.api.repos.syncState.get(a.userId))?.eventsWatermark).toBeNull();

    // La segunda vez baja las 500 que ya llegaron, no las devuelve, y sube las 100 que faltaban
    a.clock.seconds = 500;
    expect(ok(await a.sync())).toMatchObject({ eventsPushed: 100, eventsPulled: 0 });
    expect(server.events.size).toBe(PAGE_SIZE + 100);
    a.clock.seconds = 600;
    expect(ok(await a.sync())).toMatchObject({ eventsPushed: 0 });
  }, 30_000);
});

// En el plan Gratis el servidor ignora sin error los apuntes nuevos o cambiados (B8,
// 20261021000001_free_plan_locks.sql). El servidor en memoria aplica la misma regla
describe('apuntes con el plan Gratis', () => {
  it('lo que el servidor ignoró en Gratis sube completo con el primer plan de pago', async () => {
    const server = createMemoryServer();
    server.plan = 'free';
    const a = device(server);
    const made = await fill(a);
    // Escribió sin conexión y el plan venció antes de sincronizar. Lo demás sube, el apunte no
    const free = ok(await a.sync({ plan: 'free' }));
    expect(free.recordsPushed).toBe(4);
    expect(server.records.has(`outline:${made.outline.id}`)).toBe(false);
    expect(server.records.has(`deck:${made.deck.id}`)).toBe(true);
    expect((await a.api.repos.syncState.get(a.userId))?.outlinesPending).toBe(true);

    // La marca de agua ya pasó el apunte. Sin la marca de pendiente no se volvería a mandar
    a.clock.seconds += 120;
    ok(await a.sync({ plan: 'free' }));
    expect(server.records.has(`outline:${made.outline.id}`)).toBe(false);

    // Vuelve a pagar. El apunte sube sin haber cambiado y la marca se quita
    server.plan = 'monthly';
    a.clock.seconds += 120;
    const paid = ok(await a.sync({ plan: 'monthly' }));
    expect(paid.recordsPushed).toBe(1);
    expect(server.records.get(`outline:${made.outline.id}`)?.record.data.title).toBe('Apunte');
    expect((await a.api.repos.syncState.get(a.userId))?.outlinesPending).toBe(false);

    // Otro dispositivo lo recibe, y volver a sincronizar ya no manda nada
    const b = device(server);
    b.clock.seconds = a.clock.seconds + 60;
    ok(await b.sync({ plan: 'monthly' }));
    expect(await b.api.repos.outlines.get(made.outline.id)).toMatchObject({ title: 'Apunte' });
    a.clock.seconds += 120;
    expect(ok(await a.sync({ plan: 'monthly' })).recordsPushed).toBe(0);
  });

  it('sin el plan del servidor usa el guardado en este navegador', async () => {
    const server = createMemoryServer();
    server.plan = 'free';
    const a = device(server);
    await fill(a);
    ok(await a.sync());
    expect((await a.api.repos.syncState.get(a.userId))?.outlinesPending).toBe(true);

    server.plan = 'monthly';
    await a.api.repos.subscriptions.put({
      userId: a.userId,
      plan: 'monthly',
      status: 'active',
      isSimulated: false,
      source: 'payment',
      updatedAt: at(a.clock.seconds).toISOString(),
    });
    a.clock.seconds += 120;
    expect(ok(await a.sync()).recordsPushed).toBe(1);
    expect([...server.records.keys()].filter((key) => key.startsWith('outline:'))).toHaveLength(1);
  });

  it('en Gratis borrar un apunte llega a la nube, sin el contenido que traiga la marca', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    ok(await a.sync({ plan: 'monthly' }));
    const b = device(server);
    b.clock.seconds = 200;
    ok(await b.sync({ plan: 'monthly' }));
    expect(await b.api.repos.outlines.get(made.outline.id)).toBeDefined();

    // El plan vence. A cambia el apunte, que no sube, y después lo borra, que sí
    server.plan = 'free';
    a.clock.seconds = 300;
    await a.api.repos.outlines.put({
      ...made.outline,
      title: 'Cambio en Gratis',
      updatedAt: at(300).toISOString(),
    });
    ok(await a.sync({ plan: 'free' }));
    expect(server.records.get(`outline:${made.outline.id}`)?.record.data.title).toBe('Apunte');
    a.clock.seconds = 400;
    const stamp = at(400).toISOString();
    await a.api.repos.outlines.put({
      ...made.outline,
      title: 'Cambio en Gratis',
      updatedAt: stamp,
      deletedAt: stamp,
    });
    ok(await a.sync({ plan: 'free' }));
    const stored = server.records.get(`outline:${made.outline.id}`)?.record;
    expect(stored).toMatchObject({ deletedAt: stamp, updatedAt: stamp });
    expect(stored?.data).toMatchObject({ title: 'Apunte', deletedAt: stamp, updatedAt: stamp });

    b.clock.seconds = 500;
    ok(await b.sync({ plan: 'free' }));
    expect(await b.api.repos.outlines.get(made.outline.id)).toBeUndefined();
    expect(await b.api.repos.outlines.getRaw(made.outline.id)).toMatchObject({ deletedAt: stamp });
  });
});

describe('el perfil dentro de la sincronización (B14, 2.7)', () => {
  it('se reconcilia después de bajar registros y bitácora y antes de subir, y lo que crea sube en la misma corrida', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    ok(await a.sync());

    // B es un perfil de antes de B14, con un ajuste distinto de fábrica y sin evento
    const b = device(server);
    b.clock.seconds = 200;
    await b.api.repos.users.put(
      makeUser({
        id: b.userId,
        examDate: null,
        dailyMinutes: null,
        settings: UserSettingsSchema.parse({ dailyGoal: { metric: 'questions', value: 30 } }),
      }),
    );
    const order: string[] = [];
    const inner = memoryTransport(server, () => at(b.clock.seconds));
    const transport: SyncTransport = {
      serverTime: () => inner.serverTime(),
      pullRecords: async (after, limit) => {
        order.push('pullRecords');
        return inner.pullRecords(after, limit);
      },
      pullEvents: async (after, limit) => {
        order.push('pullEvents');
        return inner.pullEvents(after, limit);
      },
      pushRecords: async (records) => {
        order.push('pushRecords');
        return inner.pushRecords(records);
      },
      pushEvents: async (events) => {
        order.push(`pushEvents:${events.map((event) => event.type).join(',')}`);
        return inner.pushEvents(events);
      },
    };
    const recording = {
      ...b.api,
      recordEvent: async (event: Parameters<typeof b.api.recordEvent>[0]) => {
        if (event.type === 'settings_changed') order.push('reconcile');
        return b.api.recordEvent(event);
      },
    };
    const result = ok(
      await runSync({
        api: recording,
        transport,
        userId: b.userId,
        authId: AUTH,
        now: () => at(b.clock.seconds),
      }),
    );
    expect(result.eventsPulled).toBe(2);
    expect(order.indexOf('reconcile')).toBeGreaterThan(order.lastIndexOf('pullEvents'));
    expect(order.indexOf('reconcile')).toBeLessThan(
      order.findIndex((step) => step.startsWith('pushEvents')),
    );
    // El evento que creó la reconciliación subió en esta misma corrida
    expect(order.at(-1)).toBe('pushEvents:settings_changed');
    expect(
      [...server.events.values()].filter((row) => row.event.type === 'settings_changed'),
    ).toHaveLength(1);
  });
});

describe('versiones mezcladas de la app (D-146)', () => {
  /**
   * Un evento que subió otro dispositivo con una app más nueva. Se mete directo al servidor con su
   * contador, como lo dejaría esa app
   */
  function futureEvent(server: MemoryServer, d: Device, seconds: number) {
    const id = newId();
    server.seq += 1;
    server.events.set(id, {
      event: {
        ...eventToWire(xpEvent(d, seconds)),
        id,
        type: 'evento_de_la_version_2',
        schemaVersion: 2,
        payload: { campo: 'nuevo' },
      },
      seq: server.seq,
    });
    return { id, seq: server.seq };
  }

  /** Un evento bueno de la versión actual que subió otro dispositivo después */
  function laterEvent(server: MemoryServer, d: Device, seconds: number) {
    const event = xpEvent(d, seconds);
    server.seq += 1;
    server.events.set(event.id, { event: eventToWire(event), seq: server.seq });
    return event;
  }

  async function localIds(d: Device) {
    return new Set((await d.api.repos.events.query({ userId: d.userId })).map((event) => event.id));
  }

  it('pausa la bajada de la bitácora en el evento nuevo, guarda lo anterior y no pierde nada', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    ok(await a.sync());
    const future = futureEvent(server, a, 200);
    const after = laterEvent(server, a, 201);

    const b = device(server);
    b.clock.seconds = 300;
    const own = xpEvent(b, 299);
    await b.api.repos.events.append(own);
    const result = ok(await b.sync());

    expect(result.blockedByNewerVersion).toBe(true);
    // Lo anterior al evento nuevo se guardó, y lo que viene después espera
    const ids = await localIds(b);
    expect(ids.has(made.events[0]?.id ?? '')).toBe(true);
    expect(ids.has(made.events[1]?.id ?? '')).toBe(true);
    expect(ids.has(after.id)).toBe(false);
    expect(ids.has(future.id)).toBe(false);
    expect(result.rejected).toBe(0);
    // El cursor queda justo antes del evento nuevo, no más allá
    const state = await b.api.repos.syncState.get(b.userId);
    expect(state?.eventsCursor).toBe(future.seq - 1);
    // El resto de la sincronización siguió. Lo propio subió, y los registros bajaron
    expect(server.events.has(own.id)).toBe(true);
    expect((await b.api.repos.decks.listAll()).map((deck) => deck.id)).toEqual([made.deck.id]);
  });

  it('con la app actualizada la bajada retoma justo donde se pausó y aplica lo pendiente', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    ok(await a.sync());
    const future = futureEvent(server, a, 200);
    const after = laterEvent(server, a, 201);

    const b = device(server);
    b.clock.seconds = 300;
    expect(ok(await b.sync()).blockedByNewerVersion).toBe(true);
    const paused = await b.api.repos.syncState.get(b.userId);

    // Una segunda sincronización sin actualizar sigue en pausa y no mueve nada
    b.clock.seconds = 400;
    expect(ok(await b.sync()).blockedByNewerVersion).toBe(true);
    expect((await b.api.repos.syncState.get(b.userId))?.eventsCursor).toBe(paused?.eventsCursor);

    // La app se actualiza. Aquí se simula dándole a esa fila la forma y la versión que la app nueva entiende
    const row = server.events.get(future.id);
    if (!row) throw new Error('Falta el evento nuevo en el servidor');
    row.event = { ...eventToWire(xpEvent(a, 200)), id: future.id };

    b.clock.seconds = 500;
    const resumed = ok(await b.sync());
    expect(resumed.blockedByNewerVersion).toBeUndefined();
    expect(resumed.eventsPulled).toBe(2);
    const ids = await localIds(b);
    expect(ids.has(future.id)).toBe(true);
    expect(ids.has(after.id)).toBe(true);
    const state = await b.api.repos.syncState.get(b.userId);
    expect(state?.eventsCursor).toBe(server.events.get(after.id)?.seq);
  });

  it('con una bajada de varias páginas pausa en la página donde está el evento nuevo', async () => {
    const server = createMemoryServer();
    const a = device(server);
    // Más eventos buenos que una página, y después el nuevo
    const goods = Array.from({ length: PAGE_SIZE + 5 }, (_, index) =>
      laterEvent(server, a, 10 + index),
    );
    const future = futureEvent(server, a, 9000);
    const after = laterEvent(server, a, 9001);

    const b = device(server);
    b.clock.seconds = 20_000;
    const result = ok(await b.sync());
    expect(result.blockedByNewerVersion).toBe(true);
    expect(result.eventsPulled).toBe(goods.length);
    const ids = await localIds(b);
    expect(goods.every((event) => ids.has(event.id))).toBe(true);
    expect(ids.has(after.id)).toBe(false);
    expect((await b.api.repos.syncState.get(b.userId))?.eventsCursor).toBe(future.seq - 1);
  });

  it('un evento dañado de la versión que sí se entiende se rechaza y no atora la bajada', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const broken = { ...eventToWire(xpEvent(a, 50)), id: newId(), payload: { amount: -5 } };
    server.seq += 1;
    server.events.set(broken.id, { event: broken, seq: server.seq });
    const after = laterEvent(server, a, 51);

    const b = device(server);
    b.clock.seconds = 300;
    const result = ok(await b.sync());
    expect(result.blockedByNewerVersion).toBeUndefined();
    expect(result.rejected).toBe(1);
    expect((await localIds(b)).has(after.id)).toBe(true);
  });

  it('una app que declara entender la versión 2 ya no se frena con esa versión', async () => {
    const server = createMemoryServer();
    const a = device(server);
    futureEvent(server, a, 200);
    const after = laterEvent(server, a, 201);

    const b = device(server);
    b.clock.seconds = 300;
    // El payload de esta fila no cumple el esquema de la versión 1, así que cuenta como rechazada
    const result = ok(await b.sync({ supportedEventVersion: 2 }));
    expect(result.blockedByNewerVersion).toBeUndefined();
    expect(result.rejected).toBe(1);
    expect((await localIds(b)).has(after.id)).toBe(true);
  });

  it('mientras la bajada está en pausa pide solo el primer evento pendiente y al actualizar vuelve a la página completa', async () => {
    const server = createMemoryServer();
    const a = device(server);
    futureEvent(server, a, 200);
    const after = laterEvent(server, a, 201);

    const b = device(server);
    b.clock.seconds = 300;
    const limits: number[] = [];
    const base = memoryTransport(server, () => at(b.clock.seconds));
    const spy: SyncTransport = {
      ...base,
      pullEvents: (afterSeq, limit) => {
        limits.push(limit);
        return base.pullEvents(afterSeq, limit);
      },
    };
    expect(ok(await b.sync({ transport: spy })).blockedByNewerVersion).toBe(true);
    expect(limits).toEqual([PAGE_SIZE]);
    // Con la pausa ya conocida, la siguiente bajada pide una sola fila
    b.clock.seconds = 400;
    expect(ok(await b.sync({ transport: spy })).blockedByNewerVersion).toBe(true);
    expect(limits).toEqual([PAGE_SIZE, 1]);
    // Una app que ya entiende esa versión baja el resto con páginas completas
    const row = [...server.events.values()].find((entry) => entry.event.schemaVersion === 2);
    if (!row) throw new Error('Falta el evento nuevo');
    row.event = { ...eventToWire(xpEvent(a, 200)), id: row.event.id };
    b.clock.seconds = 500;
    const resumed = ok(await b.sync({ transport: spy }));
    expect(resumed.blockedByNewerVersion).toBeUndefined();
    expect(limits).toEqual([PAGE_SIZE, 1, 1, PAGE_SIZE]);
    expect((await localIds(b)).has(after.id)).toBe(true);
  });

  it('un evento con una versión absurda es un dato dañado y no deja la bajada en pausa', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const junk = { ...eventToWire(xpEvent(a, 50)), id: newId(), schemaVersion: 2147483647 };
    server.seq += 1;
    server.events.set(junk.id, { event: junk, seq: server.seq });
    const after = laterEvent(server, a, 51);

    const b = device(server);
    b.clock.seconds = 300;
    const result = ok(await b.sync());
    expect(result.blockedByNewerVersion).toBeUndefined();
    expect(result.rejected).toBe(1);
    expect((await localIds(b)).has(after.id)).toBe(true);
  });
});

describe('el tope de registros de la cuenta (SY003)', () => {
  const quota = () => new SyncTransportError('quota', 'Se llenó el espacio de la cuenta');

  it('con el tope lleno los eventos igual suben y el resultado dice quota', async () => {
    const server = createMemoryServer();
    const a = device(server);
    const made = await fill(a);
    const base = memoryTransport(server, () => at(a.clock.seconds));
    const full: SyncTransport = { ...base, pushRecords: () => Promise.reject(quota()) };

    const result = await a.sync({ transport: full });
    expect(result).toMatchObject({ status: 'failed', failure: 'quota' });
    // Los registros no subieron, pero los eventos sí
    expect(server.records.size).toBe(0);
    expect([...server.events.keys()].sort()).toEqual(made.events.map((event) => event.id).sort());
    // No cuenta como sincronización buena y el avance de la bitácora quedó guardado
    const state = await a.api.repos.syncState.get(a.userId);
    expect(state?.lastSyncAt).toBeNull();
    expect(state?.eventsWatermark).not.toBeNull();
    // Cuando hay lugar otra vez, todo termina sin duplicar nada
    ok(await a.sync());
    expect(server.records.size).toBeGreaterThan(0);
    expect(server.events.size).toBe(made.events.length);
  });

  it('si también la bitácora llega al tope, el resultado sigue diciendo quota', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    const base = memoryTransport(server, () => at(a.clock.seconds));
    const full: SyncTransport = {
      ...base,
      pushRecords: () => Promise.reject(quota()),
      pushEvents: () => Promise.reject(quota()),
    };
    expect(await a.sync({ transport: full })).toMatchObject({ status: 'failed', failure: 'quota' });
  });

  it('un fallo de red al subir registros no se confunde con el tope y corta como siempre', async () => {
    const server = createMemoryServer();
    const a = device(server);
    await fill(a);
    const base = memoryTransport(server, () => at(a.clock.seconds));
    const down: SyncTransport = {
      ...base,
      pushRecords: () => Promise.reject(new SyncTransportError('network', 'Sin red')),
    };
    expect(await a.sync({ transport: down })).toMatchObject({
      status: 'failed',
      failure: 'network',
    });
    expect(server.events.size).toBe(0);
  });
});
