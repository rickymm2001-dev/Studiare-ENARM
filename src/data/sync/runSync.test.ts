import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { PAGE_SIZE } from '@/engines/sync';
import { createEvent } from '../events/createEvent';
import type { Card, Deck, Note } from '../schemas/decks';
import type { Outline } from '../schemas/outlines';
import { newId, testApi } from '../testing/fixtures';
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
  sync: (overrides?: { transport?: SyncTransport; authId?: string }) => Promise<SyncResult>;
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
