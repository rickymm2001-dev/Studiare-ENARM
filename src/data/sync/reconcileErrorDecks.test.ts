import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import type { EnarmDb } from '../db/database';
import { isLive } from '../schemas/decks';
import { freshDb, makeUser, newId } from '../testing/fixtures';
import { errorIds, queueErrorCards, type ErrorCardInput } from '../usecases/errorCards';
import { runSync } from './runSync';
import { createMemoryServer, memoryTransport, type MemoryServer } from './testing/memoryTransport';

const AUTH = 'cuenta-de-prueba';
const BASE = Date.parse('2026-10-15T12:00:00.000Z');
const at = (seconds: number) => new Date(BASE + seconds * 1000);
const DECK = { name: 'Mis errores', description: 'Tus preguntas falladas' };

interface Device {
  db: EnarmDb;
  repos: ReturnType<typeof createDexieRepositories>;
  api: {
    repos: ReturnType<typeof createDexieRepositories>;
    recordEvent: (
      event: Parameters<ReturnType<typeof createDexieRepositories>['events']['append']>[0],
    ) => Promise<unknown>;
  };
  userId: string;
  clock: { seconds: number };
  sync: () => ReturnType<typeof runSync>;
  fail: (inputs: ErrorCardInput[], seconds?: number) => Promise<number>;
}

const dbs: EnarmDb[] = [];
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

async function device(server: MemoryServer): Promise<Device> {
  const db = freshDb('real');
  dbs.push(db);
  const repos = createDexieRepositories(db);
  const api = {
    repos,
    recordEvent: (event: Parameters<typeof repos.events.append>[0]) => repos.events.append(event),
  };
  const user = makeUser({ examDate: null, dailyMinutes: null });
  await repos.users.put(user);
  const clock = { seconds: 1000 };
  const now = () => at(clock.seconds);
  return {
    db,
    repos,
    api,
    userId: user.id,
    clock,
    sync: () =>
      runSync({ api, transport: memoryTransport(server, now), userId: user.id, authId: AUTH, now }),
    fail: (inputs, seconds = clock.seconds) =>
      queueErrorCards(api, user, inputs, DECK, at(seconds)),
  };
}

const QUESTIONS = Array.from({ length: 4 }, () => newId());
const input = (question: number, overrides: Partial<ErrorCardInput> = {}): ErrorCardInput => ({
  questionVersionId: QUESTIONS[question] as string,
  topic: 'cardiology',
  editorialStatus: 'approved',
  isDemo: false,
  front: `<p>Pregunta ${String(question)}</p>`,
  back: '<p>Respuesta</p>',
  quote: 'Cita',
  ...overrides,
});

const liveDecks = async (d: Device) =>
  (await d.repos.decks.listAll()).filter((deck) => isLive(deck) && deck.origin === 'generated');
const liveErrorNotes = async (d: Device) => {
  const decks = await liveDecks(d);
  const notes = (
    await Promise.all(decks.map((deck) => d.repos.notes.listAllByDeck(deck.id)))
  ).flat();
  return notes.filter(isLive);
};
const questionsOf = async (d: Device) =>
  (await liveErrorNotes(d)).map((note) => note.sourceQuestionVersionId).sort();

describe('un solo Mis errores entre dos dispositivos (H05)', () => {
  it('dos dispositivos que fallaron antes de sincronizar terminan con un mazo y sin tarjetas repetidas', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    await a.fail([input(0), input(1)], 1000);
    await b.fail([input(1), input(2)], 1100);
    // Cada uno armó su mazo con su propio id
    expect((await liveDecks(a))[0]?.id).toBe(errorIds.deck(a.userId));
    expect((await liveDecks(b))[0]?.id).toBe(errorIds.deck(b.userId));

    a.clock.seconds = 1200;
    await a.sync();
    b.clock.seconds = 1300;
    await b.sync();
    a.clock.seconds = 1400;
    await a.sync();

    for (const d of [a, b]) {
      const decks = await liveDecks(d);
      expect(decks).toHaveLength(1);
      expect(decks[0]).toMatchObject({ system: 'errors', name: 'Mis errores' });
      expect(await questionsOf(d)).toEqual([0, 1, 2].map((q) => QUESTIONS[q] as string).sort());
    }
    // El mismo mazo en los dos: el más antiguo, el de A
    expect((await liveDecks(a))[0]?.id).toBe((await liveDecks(b))[0]?.id);
    expect((await liveDecks(a))[0]?.id).toBe(errorIds.deck(a.userId));
  });

  it('entre dos tarjetas de la misma pregunta se queda la que tiene más repasos, con su mismo id', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    await a.fail([input(1)], 1000);
    await b.fail([input(1)], 1100);
    const cardA = errorIds.card(a.userId, QUESTIONS[1] as string);
    const cardB = errorIds.card(b.userId, QUESTIONS[1] as string);
    // B repasó más esa tarjeta
    await b.db.cardStateCache.put({
      cardId: cardB,
      userId: b.userId,
      fsrs: {
        due: at(2000).toISOString(),
        stability: 5,
        difficulty: 5,
        scheduledDays: 5,
        learningSteps: 0,
        reps: 7,
        lapses: 0,
        state: 'review',
        lastReview: at(1100).toISOString(),
      },
      isLeech: false,
      updatedAt: at(1100).toISOString(),
    });
    a.clock.seconds = 1200;
    await a.sync();
    b.clock.seconds = 1300;
    await b.sync();

    const notes = await liveErrorNotes(b);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.id).toBe(errorIds.note(b.userId, QUESTIONS[1] as string));
    // La tarjeta de A se marcó como borrada y la de B es la que se programa, ya en el mazo único
    expect(await b.repos.cards.get(cardA)).toBeUndefined();
    expect((await b.repos.cards.get(cardB))?.deckId).toBe(errorIds.deck(a.userId));
    a.clock.seconds = 1400;
    await a.sync();
    expect(await a.repos.cards.get(cardA)).toBeUndefined();
    expect(await a.repos.cards.get(cardB)).toBeDefined();
    expect(await liveDecks(a)).toHaveLength(1);
  });

  it('después de unirse, fallar otra vez la misma pregunta en cualquiera no la duplica', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    await a.fail([input(0)], 1000);
    await b.fail([input(0)], 1100);
    a.clock.seconds = 1200;
    await a.sync();
    b.clock.seconds = 1300;
    await b.sync();
    a.clock.seconds = 1400;
    await a.sync();
    expect(await a.fail([input(0)], 1500)).toBe(0);
    expect(await b.fail([input(0)], 1500)).toBe(0);
    // Y una pregunta nueva en B llega a A en el mismo mazo y sin repetirse
    expect(await b.fail([input(3)], 1600)).toBe(1);
    b.clock.seconds = 1700;
    await b.sync();
    a.clock.seconds = 1800;
    await a.sync();
    expect(await questionsOf(a)).toEqual([0, 3].map((q) => QUESTIONS[q] as string).sort());
    expect(await liveDecks(a)).toHaveLength(1);
    expect(await a.fail([input(3)], 1900)).toBe(0);
  });

  it('con la cuenta ya enlazada, los dos dispositivos arman las mismas ids y no hay nada que unir', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    // Los dos sincronizaron antes de fallar, así que ya conocen la cuenta
    a.clock.seconds = 1100;
    await a.sync();
    b.clock.seconds = 1100;
    await b.sync();
    await a.fail([input(0), input(1)], 1200);
    await b.fail([input(1), input(2)], 1300);
    expect((await liveDecks(a))[0]?.id).toBe(errorIds.deck(AUTH));
    expect((await liveDecks(b))[0]?.id).toBe(errorIds.deck(AUTH));
    expect(errorIds.deck(AUTH)).not.toBe(errorIds.deck(a.userId));

    a.clock.seconds = 1400;
    await a.sync();
    b.clock.seconds = 1500;
    await b.sync();
    a.clock.seconds = 1600;
    await a.sync();
    for (const d of [a, b]) {
      expect(await liveDecks(d)).toHaveLength(1);
      expect(await questionsOf(d)).toEqual([0, 1, 2].map((q) => QUESTIONS[q] as string).sort());
    }
    // La pregunta que fallaron los dos tiene una sola nota, con el mismo id
    const notes = (await liveErrorNotes(b)).filter(
      (note) => note.sourceQuestionVersionId === QUESTIONS[1],
    );
    expect(notes.map((note) => note.id)).toEqual([errorIds.note(AUTH, QUESTIONS[1] as string)]);
  });

  it('el mazo de antes de B14 recibe la marca la primera vez y la sube', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    await a.fail([input(0)], 1000);
    // Como lo dejaba la app de antes: sin la marca ni la clave de la nota
    const [stored] = await liveDecks(a);
    if (!stored) throw new Error('falta el mazo');
    const { system: _system, ...legacyDeck } = stored;
    await a.repos.decks.put(legacyDeck);
    const [note] = await liveErrorNotes(a);
    if (!note) throw new Error('falta la nota');
    const { errorKey: _key, ...legacyNote } = note;
    await a.repos.notes.put(legacyNote);

    a.clock.seconds = 1100;
    await a.sync();
    expect((await liveDecks(a))[0]?.system).toBe('errors');
    expect(server.records.get(`deck:${stored.id}`)?.record.data.system).toBe('errors');
    // Otro dispositivo la reconoce y fallar esa misma pregunta ahí no crea otra tarjeta
    const b = await device(server);
    b.clock.seconds = 1200;
    await b.sync();
    expect(await b.fail([input(0)], 1300)).toBe(0);
    expect(await liveDecks(b)).toHaveLength(1);
  });

  it('una tarjeta de contraste no se pierde ni se confunde con la de su pregunta', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    const contrast = input(0, {
      key: 'contraste|a|b',
      front: '<p><strong>Contraste</strong></p><p>Pregunta 0</p>',
    });
    await a.fail([input(0), contrast], 1000);
    await b.fail([input(0), contrast], 1100);
    a.clock.seconds = 1200;
    await a.sync();
    b.clock.seconds = 1300;
    await b.sync();
    const notes = await liveErrorNotes(b);
    // La tarjeta de la pregunta y la de contraste, cada una una vez
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => note.errorKey).sort()).toEqual(
      [QUESTIONS[0] as string, 'contraste|a|b'].sort(),
    );
  });

  it('un corte después de bajar los mazos y antes de bajar la bitácora igual los une en la siguiente corrida (revisión de B14, hallazgo 1)', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    // B ya sincronizó antes, así que la primera vez no lo salva
    await b.sync();
    await a.fail([input(0), input(1)], 1000);
    a.clock.seconds = 1200;
    await a.sync();
    await b.fail([input(1), input(2)], 1250);

    b.clock.seconds = 1300;
    server.failNext = { call: 'pullEvents', failure: 'network' };
    expect(await b.sync()).toMatchObject({ status: 'failed', failure: 'network' });
    // Los mazos de A ya bajaron, pero la unión no corrió
    expect(await liveDecks(b)).toHaveLength(2);

    b.clock.seconds = 1400;
    expect((await b.sync()).status).toBe('ok');
    expect(await liveDecks(b)).toHaveLength(1);
    expect(await questionsOf(b)).toEqual([0, 1, 2].map((q) => QUESTIONS[q] as string).sort());
    expect((await b.repos.syncState.get(b.userId))?.recordsPending).toBeUndefined();
  });

  it('sincronizar otra vez no mueve nada', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    await a.fail([input(0)], 1000);
    await b.fail([input(1)], 1100);
    for (const [d, seconds] of [
      [a, 1200],
      [b, 1300],
      [a, 1400],
      [b, 1500],
    ] as const) {
      d.clock.seconds = seconds;
      await d.sync();
    }
    const before = server.seq;
    a.clock.seconds = 1600;
    const result = await a.sync();
    b.clock.seconds = 1700;
    await b.sync();
    expect(result).toMatchObject({ status: 'ok', recordsPushed: 0, eventsPushed: 0 });
    expect(server.seq).toBe(before);
  });
});
