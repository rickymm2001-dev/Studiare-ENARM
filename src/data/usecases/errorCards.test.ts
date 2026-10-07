import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnarmDb } from '../db/database';
import { createDexieRepositories } from '../repos/dexie/createRepositories';
import { freshDb, makeUser, newId } from '../testing/fixtures';
import { errorIds, queueErrorCards, TOPIC_TAG_PREFIX, type ErrorCardInput } from './errorCards';

const openDbs: EnarmDb[] = [];
afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()));
});

function setup() {
  const db = freshDb('real');
  openDbs.push(db);
  return { api: { repos: createDexieRepositories(db) } };
}

const deck = { name: 'Mis errores', description: 'Tus preguntas falladas' };
const NOW = new Date('2026-10-05T16:00:00.000Z');

const input = (overrides: Partial<ErrorCardInput> = {}): ErrorCardInput => ({
  questionVersionId: newId(),
  topic: 'cardiology',
  editorialStatus: 'approved',
  isDemo: false,
  front: '<p>¿Cuál es el diagnóstico?</p>',
  back: '<p>Infarto</p>',
  quote: 'El infarto es la causa más probable',
  ...overrides,
});

describe('errores al repaso (7.1)', () => {
  it('crea el mazo privado del alumno con una tarjeta de pregunta por cada fallo', async () => {
    const { api } = setup();
    const user = makeUser();
    const [first, second] = [input(), input({ topic: 'nephrology' })];
    const created = await queueErrorCards(api, user, [first, second], deck, NOW);
    expect(created).toBe(2);

    const stored = await api.repos.decks.get(errorIds.deck(user.id));
    expect(stored).toMatchObject({
      name: 'Mis errores',
      ownerId: user.id,
      origin: 'generated',
      visibility: 'private',
      isDemo: false,
    });
    const notes = await api.repos.notes.list();
    expect(notes).toHaveLength(2);
    const note = notes.find((entry) => entry.sourceQuestionVersionId === first.questionVersionId);
    expect(note).toMatchObject({
      kind: 'basic',
      origin: 'generated',
      editorialStatus: 'approved',
      sourceQuote: first.quote,
      tags: [`${TOPIC_TAG_PREFIX}cardiology`],
    });
    const cards = await api.repos.cards.list();
    expect(cards).toHaveLength(2);
    expect(
      cards.every((card) => card.deckId === errorIds.deck(user.id) && card.ordinal === 0),
    ).toBe(true);
  });

  it('fallar de nuevo la misma pregunta no duplica ni reinicia la tarjeta', async () => {
    const { api } = setup();
    const user = makeUser();
    const failed = input();
    expect(await queueErrorCards(api, user, [failed], deck, NOW)).toBe(1);
    const before = await api.repos.notes.list();
    const again = await queueErrorCards(
      api,
      user,
      [failed, input({ questionVersionId: failed.questionVersionId, back: '<p>Otra</p>' })],
      deck,
      new Date('2026-10-06T16:00:00.000Z'),
    );
    expect(again).toBe(0);
    expect(await api.repos.notes.list()).toEqual(before);
    expect(await api.repos.cards.list()).toHaveLength(1);
  });

  it('repetidas en la misma tanda se cuentan una sola vez', async () => {
    const { api } = setup();
    const failed = input();
    expect(await queueErrorCards(api, makeUser(), [failed, failed], deck, NOW)).toBe(1);
  });

  it('un fallo de demostración marca el mazo con la etiqueta y no se la quita después', async () => {
    const { api } = setup();
    const user = makeUser();
    await queueErrorCards(api, user, [input()], deck, NOW);
    expect((await api.repos.decks.get(errorIds.deck(user.id)))?.isDemo).toBe(false);
    await queueErrorCards(api, user, [input({ isDemo: true })], deck, NOW);
    const marked = await api.repos.decks.get(errorIds.deck(user.id));
    expect(marked?.isDemo).toBe(true);
    // El mazo conserva su fecha de creación y su nombre
    expect(marked?.createdAt).toBe(NOW.toISOString());
    await queueErrorCards(api, user, [input({ isDemo: false })], deck, NOW);
    expect((await api.repos.decks.get(errorIds.deck(user.id)))?.isDemo).toBe(true);
  });

  it('cada alumno tiene su mazo y sus tarjetas aunque falle la misma pregunta', async () => {
    const { api } = setup();
    const [ana, beto] = [makeUser(), makeUser()];
    const shared = input();
    await queueErrorCards(api, ana, [shared], deck, NOW);
    await queueErrorCards(api, beto, [shared], deck, NOW);
    expect(await api.repos.decks.list()).toHaveLength(2);
    expect(errorIds.card(ana.id, shared.questionVersionId)).not.toBe(
      errorIds.card(beto.id, shared.questionVersionId),
    );
    expect(await api.repos.cards.list()).toHaveLength(2);
  });

  it('conserva el orden en que se fallaron y no crea nada sin fallos', async () => {
    const { api } = setup();
    const user = makeUser();
    expect(await queueErrorCards(api, user, [], deck, NOW)).toBe(0);
    expect(await api.repos.decks.list()).toHaveLength(0);

    const [first, second, third] = [input(), input(), input()];
    await queueErrorCards(api, user, [first, second, third], deck, NOW);
    const byDate = (await api.repos.notes.list())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((note) => note.sourceQuestionVersionId);
    expect(byDate).toEqual([first, second, third].map((entry) => entry.questionVersionId));
  });

  it('una tarjeta con su propia clave no choca con la de la pregunta y tampoco se duplica', async () => {
    const { api } = setup();
    const user = makeUser();
    const failed = input();
    const contrast = input({ questionVersionId: failed.questionVersionId, key: 'contraste|a|b' });
    expect(await queueErrorCards(api, user, [failed, contrast], deck, NOW)).toBe(2);
    expect(await queueErrorCards(api, user, [contrast], deck, NOW)).toBe(0);
    const notes = await api.repos.notes.list();
    expect(notes).toHaveLength(2);
    // Las dos citan la misma pregunta como fuente
    expect(new Set(notes.map((note) => note.sourceQuestionVersionId))).toEqual(
      new Set([failed.questionVersionId]),
    );
  });

  it('si se cortó entre la nota y la tarjeta, reintentar completa la tarjeta y no duplica la nota', async () => {
    const { api } = setup();
    const user = makeUser();
    const failed = input();
    // Un intento que alcanzó a guardar la nota y se cortó antes de la tarjeta
    const { repos } = api;
    const flaky = {
      repos: {
        ...repos,
        cards: { ...repos.cards, putMany: () => Promise.reject(new Error('red')) },
      },
    };
    await expect(queueErrorCards(flaky, user, [failed], deck, NOW)).rejects.toThrow('red');
    expect(await repos.notes.list()).toHaveLength(1);
    expect(await repos.cards.list()).toHaveLength(0);

    expect(await queueErrorCards(api, user, [failed], deck, NOW)).toBe(1);
    expect(await repos.notes.list()).toHaveLength(1);
    expect(await repos.cards.list()).toHaveLength(1);
    expect(await queueErrorCards(api, user, [failed], deck, NOW)).toBe(0);
  });

  it('los IDs son los mismos entre corridas', () => {
    const user = '01JAA6S0000000000000000000';
    expect(errorIds.deck(user)).toBe(errorIds.deck(user));
    expect(errorIds.note(user, 'a')).not.toBe(errorIds.note(user, 'b'));
    expect(errorIds.note(user, 'a')).not.toBe(errorIds.card(user, 'a'));
  });
});
