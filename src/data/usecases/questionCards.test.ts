import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { isAiNote, type Deck, type Note } from '../schemas/decks';
import { makeQuestionWithOptions, makeUser, newId, testApi } from '../testing/fixtures';
import { AI_TAG } from './aiCards';
import { errorIds, TOPIC_TAG_PREFIX } from './errorCards';
import { createManualDeck, deleteManualNote, draftOf, type NoteDraft } from './manualDecks';
import { moveDeck, renameDeck } from './organize';
import {
  createQuestionCard,
  isLayerDeck,
  QuestionCardTargetError,
  questionCardIds,
  type QuestionCardInput,
} from './questionCards';

const apis: ReturnType<typeof testApi>[] = [];
afterEach(async () => {
  await Promise.all(apis.splice(0).map((api) => api.dispose()));
});

function setup() {
  const api = testApi('real');
  apis.push(api);
  return { api, user: makeUser() };
}

const NOW = new Date('2026-10-13T16:00:00.000Z');
const LAYER = { name: 'Mis tarjetas', description: 'Tus tarjetas en este mazo precargado' };
const DRAFT: NoteDraft = {
  kind: 'basic',
  front: 'Mujer de 54 años con disnea.\n\n¿Cuál es el diagnóstico más probable?',
  back: 'Respuesta correcta. Insuficiencia cardiaca\n\nLa disnea de esfuerzo orienta.',
};

/** Un mazo precargado, compartido y sin dueño, con una tarjeta suya */
async function preloadedDeck(api: ReturnType<typeof testApi>): Promise<Deck> {
  const deck = await api.repos.decks.put({
    id: newId(),
    name: 'Medicina interna (Paco)',
    description: '',
    ownerId: null,
    origin: 'preloaded',
    visibility: 'public',
    isDemo: true,
    parentId: null,
    createdAt: NOW.toISOString(),
  });
  const note = await api.repos.notes.put({
    id: newId(),
    deckId: deck.id,
    kind: 'basic',
    front: '<p>Frente precargado</p>',
    back: '<p>Reverso precargado</p>',
    tags: [],
    origin: 'preloaded',
    editorialStatus: 'approved',
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: true,
    createdAt: NOW.toISOString(),
  });
  await api.repos.cards.put({
    id: newId(),
    noteId: note.id,
    deckId: deck.id,
    ordinal: 0,
    createdAt: NOW.toISOString(),
  });
  return deck;
}

function input(
  question: QuestionCardInput['question'],
  target: QuestionCardInput['target'],
  overrides: Partial<QuestionCardInput> = {},
): QuestionCardInput {
  return {
    question,
    target,
    draft: DRAFT,
    source: { kind: 'bank' },
    from: 'exam_review',
    layer: LAYER,
    ...overrides,
  };
}

async function eventsOf(api: ReturnType<typeof testApi>, userId: string) {
  return (await api.repos.events.query({ userId })).filter(
    (event) => event.type === 'question_card_created',
  );
}

describe('tarjeta de una pregunta de inglés médico (B13, hallazgo 11 de la revisión)', () => {
  const ENGLISH_DRAFT: NoteDraft = {
    kind: 'basic',
    front: '[Prueba] Simulated passage, short.\n\n[Prueba] Which statement is correct?',
    back: 'Respuesta correcta. [Prueba] English option 1\n\nExplicación en español.\n\nReferencias. Fuente del texto. [Prueba] Texto simulado. Texto propio del equipo Studiare.',
  };
  const PARTS = [
    '[Prueba] Simulated passage, short.',
    '[Prueba] Which statement is correct?',
    '[Prueba] English option 1',
    '[Prueba] Texto simulado',
  ];

  it('guarda el inglés del banco con lang en y el español sin marca', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deck = await createManualDeck(api, user, { name: 'Inglés' }, NOW);
    await createQuestionCard(
      api,
      user,
      input(question, { kind: 'deck', deckId: deck.id }, { draft: ENGLISH_DRAFT, english: PARTS }),
      NOW,
    );
    const noteId = questionCardIds.note(user.id, question.questionId, question.version, deck.id);
    const note = await api.repos.notes.get(noteId);
    expect(note?.kind === 'basic' ? note.front : '').toBe(
      '<p><span lang="en">[Prueba] Simulated passage, short.</span></p><p><span lang="en">[Prueba] Which statement is correct?</span></p>',
    );
    expect(note?.kind === 'basic' ? note.back : '').toBe(
      '<p>Respuesta correcta. <span lang="en">[Prueba] English option 1</span></p><p>Explicación en español.</p><p>Referencias. Fuente del texto. <span lang="en">[Prueba] Texto simulado</span>. Texto propio del equipo Studiare.</p>',
    );
  });

  it('al editar la tarjeta guardada el editor ve el texto sin etiquetas', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deck = await createManualDeck(api, user, { name: 'Inglés' }, NOW);
    await createQuestionCard(
      api,
      user,
      input(question, { kind: 'deck', deckId: deck.id }, { draft: ENGLISH_DRAFT, english: PARTS }),
      NOW,
    );
    const noteId = questionCardIds.note(user.id, question.questionId, question.version, deck.id);
    const note = await api.repos.notes.get(noteId);
    if (!note) throw new Error('No quedó la nota');
    expect(draftOf(note)).toEqual(ENGLISH_DRAFT);
  });

  it('sin fragmentos en inglés la tarjeta queda como siempre, sin lang', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deck = await createManualDeck(api, user, { name: 'Inglés' }, NOW);
    await createQuestionCard(
      api,
      user,
      input(question, { kind: 'deck', deckId: deck.id }, { draft: ENGLISH_DRAFT }),
      NOW,
    );
    const noteId = questionCardIds.note(user.id, question.questionId, question.version, deck.id);
    const note = await api.repos.notes.get(noteId);
    expect(note?.kind === 'basic' ? `${note.front}${note.back}` : '').not.toContain('lang=');
  });
});

describe('tarjeta desde una pregunta del banco (B5, comentario 1)', () => {
  it('en un mazo propio crea la tarjeta con el texto del banco y deja el evento con la pregunta y su versión', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deck = await createManualDeck(api, user, { name: 'Cardiología' }, NOW);
    const result = await createQuestionCard(
      api,
      user,
      input(question, { kind: 'deck', deckId: deck.id }),
      NOW,
    );
    const noteId = questionCardIds.note(user.id, question.questionId, question.version, deck.id);
    expect(result).toEqual({ status: 'created', noteId, deckId: deck.id, layer: false });

    const note = await api.repos.notes.get(noteId);
    expect(note).toMatchObject({
      deckId: deck.id,
      kind: 'basic',
      front: '<p>Mujer de 54 años con disnea.</p><p>¿Cuál es el diagnóstico más probable?</p>',
      origin: 'manual',
      editorialStatus: 'draft',
      // No es una pregunta fallada que entra al repaso, como las de Mis errores
      sourceQuestionVersionId: null,
      sourceQuote: null,
      isDemo: question.isDemo,
      tags: [`${TOPIC_TAG_PREFIX}${question.topic}`],
    });
    expect(await api.repos.cards.list()).toEqual([
      expect.objectContaining({
        id: questionCardIds.card(noteId, 0),
        noteId,
        deckId: deck.id,
        ordinal: 0,
      }),
    ]);
    const [event, ...more] = await eventsOf(api, user.id);
    expect(more).toHaveLength(0);
    expect(event?.payload).toEqual({
      questionId: question.questionId,
      questionVersionId: question.id,
      version: question.version,
      deckId: deck.id,
      noteDeckId: deck.id,
      noteId,
      source: 'bank',
      artifactId: null,
      from: 'exam_review',
    });
  });

  it('pulsar dos veces, una tras otra o casi juntas, no duplica la tarjeta ni el evento', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deck = await createManualDeck(api, user, { name: 'Mi mazo' }, NOW);
    const target = { kind: 'deck', deckId: deck.id } as const;
    const [first, second] = await Promise.all([
      createQuestionCard(api, user, input(question, target), NOW),
      createQuestionCard(api, user, input(question, target), NOW),
    ]);
    expect([first.status, second.status]).toEqual(['created', 'exists']);
    const third = await createQuestionCard(
      api,
      user,
      input(question, target, { draft: { ...DRAFT, front: 'Otro frente' } }),
      new Date(NOW.getTime() + 60_000),
    );
    expect(third.status).toBe('exists');
    const [note, ...rest] = await api.repos.notes.list();
    expect(rest).toHaveLength(0);
    // La que ya estaba no se pisa con el texto del segundo toque
    expect(note?.kind === 'basic' && note.front).not.toContain('Otro frente');
    expect(await api.repos.cards.list()).toHaveLength(1);
    expect(await eventsOf(api, user.id)).toHaveLength(1);
  });

  it('otra versión de la pregunta u otro mazo son otra tarjeta', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const one = await createManualDeck(api, user, { name: 'Uno' }, NOW);
    const two = await createManualDeck(api, user, { name: 'Dos' }, NOW);
    await createQuestionCard(api, user, input(question, { kind: 'deck', deckId: one.id }), NOW);
    await createQuestionCard(api, user, input(question, { kind: 'deck', deckId: two.id }), NOW);
    await createQuestionCard(
      api,
      user,
      input({ ...question, id: newId(), version: 2 }, { kind: 'deck', deckId: one.id }),
      NOW,
    );
    expect(await api.repos.notes.list()).toHaveLength(3);
    expect(await eventsOf(api, user.id)).toHaveLength(3);
  });

  it('en un mazo precargado la tarjeta queda en la capa del alumno y el mazo compartido no cambia (4.16)', async () => {
    const { api, user } = setup();
    const preloaded = await preloadedDeck(api);
    const before = {
      deck: await api.repos.decks.get(preloaded.id),
      notes: (await api.repos.notes.list()).filter((note) => note.deckId === preloaded.id),
      cards: (await api.repos.cards.list()).filter((card) => card.deckId === preloaded.id),
    };
    const { question } = makeQuestionWithOptions();
    const result = await createQuestionCard(
      api,
      user,
      input(question, { kind: 'deck', deckId: preloaded.id }),
      NOW,
    );
    expect(result).toMatchObject({ status: 'created', layer: true });
    expect(result.deckId).not.toBe(preloaded.id);

    const layer = await api.repos.decks.get(result.deckId);
    expect(layer).toMatchObject({
      name: LAYER.name,
      ownerId: user.id,
      origin: 'manual',
      visibility: 'private',
      parentId: preloaded.id,
      isDemo: true,
    });
    const decks = new Map((await api.repos.decks.list()).map((deck) => [deck.id, deck]));
    expect(layer && isLayerDeck(layer, decks, user.id)).toBe(true);
    // El mazo compartido, sus notas y sus cartas siguen igual
    expect(await api.repos.decks.get(preloaded.id)).toEqual(before.deck);
    expect((await api.repos.notes.list()).filter((note) => note.deckId === preloaded.id)).toEqual(
      before.notes,
    );
    expect((await api.repos.cards.list()).filter((card) => card.deckId === preloaded.id)).toEqual(
      before.cards,
    );
    const [event] = await eventsOf(api, user.id);
    expect(event?.payload).toMatchObject({ deckId: preloaded.id, noteDeckId: result.deckId });

    // Otra pregunta en el mismo precargado usa la misma capa, y elegir la capa directo es lo mismo
    // que elegir el precargado, así que no duplica
    const other = makeQuestionWithOptions().question;
    const second = await createQuestionCard(
      api,
      user,
      input(other, { kind: 'deck', deckId: preloaded.id }),
      NOW,
    );
    expect(second.deckId).toBe(result.deckId);
    const viaLayer = await createQuestionCard(
      api,
      user,
      input(question, { kind: 'deck', deckId: result.deckId }),
      NOW,
    );
    expect(viaLayer).toMatchObject({ status: 'exists', noteId: result.noteId, layer: true });
    expect(
      (await api.repos.decks.list()).filter((deck) => deck.parentId === preloaded.id),
    ).toHaveLength(1);
  });

  it('respeta la capa que el alumno renombró o movió, y si la movió arma otra debajo del precargado', async () => {
    const { api, user } = setup();
    const preloaded = await preloadedDeck(api);
    const [one, two, three] = [1, 2, 3].map(() => makeQuestionWithOptions().question);
    if (!one || !two || !three) throw new Error('Faltan preguntas');
    const toPreloaded = { kind: 'deck', deckId: preloaded.id } as const;
    const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

    const first = await createQuestionCard(api, user, input(one, toPreloaded), NOW);
    const moved = questionCardIds.layer(user.id, preloaded.id);
    expect(first.deckId).toBe(moved);

    // Le cambia el nombre y la deja donde está. La siguiente tarjeta va ahí y el nombre se queda
    await renameDeck(api, user, moved, 'Urgencias que fallé', later(1));
    const second = await createQuestionCard(api, user, input(two, toPreloaded), later(2));
    expect(second.deckId).toBe(moved);
    expect((await api.repos.decks.get(moved))?.name).toBe('Urgencias que fallé');

    // La mueve a primer nivel. Ya no regresa al precargado y la siguiente tarjeta va a una capa
    // nueva, con un ID que sale del de la anterior
    expect(await moveDeck(api, user, moved, null, later(3))).toBeNull();
    const third = await createQuestionCard(api, user, input(three, toPreloaded), later(4));
    const fresh = questionCardIds.nextLayer(moved);
    expect(third).toMatchObject({ status: 'created', deckId: fresh, layer: true });
    expect(await api.repos.decks.get(fresh)).toMatchObject({
      name: LAYER.name,
      ownerId: user.id,
      origin: 'manual',
      parentId: preloaded.id,
    });
    expect(await api.repos.decks.get(moved)).toMatchObject({
      name: 'Urgencias que fallé',
      parentId: null,
    });
    // Sus tarjetas se quedan en la capa que movió y la misma pregunta no se duplica
    expect((await api.repos.notes.get(first.noteId))?.deckId).toBe(moved);
    expect((await api.repos.notes.get(second.noteId))?.deckId).toBe(moved);
    const again = await createQuestionCard(api, user, input(one, toPreloaded), later(5));
    expect(again).toMatchObject({ status: 'exists', noteId: first.noteId, deckId: moved });
    expect(
      (await api.repos.decks.list()).filter((deck) => deck.parentId === preloaded.id),
    ).toHaveLength(1);

    // Si también mueve la nueva, la que sigue sale de ella
    expect(await moveDeck(api, user, fresh, moved, later(6))).toBeNull();
    const fourth = await createQuestionCard(
      api,
      user,
      input(makeQuestionWithOptions().question, toPreloaded),
      later(7),
    );
    expect(fourth.deckId).toBe(questionCardIds.nextLayer(fresh));
    expect((await api.repos.decks.get(fresh))?.parentId).toBe(moved);
  });

  it('la capa de otro alumno no se mezcla con la suya', async () => {
    const { api, user } = setup();
    const other = makeUser();
    const preloaded = await preloadedDeck(api);
    const { question } = makeQuestionWithOptions();
    const mine = await createQuestionCard(
      api,
      user,
      input(question, { kind: 'deck', deckId: preloaded.id }),
      NOW,
    );
    const theirs = await createQuestionCard(
      api,
      other,
      input(question, { kind: 'deck', deckId: preloaded.id }),
      NOW,
    );
    expect(theirs.deckId).not.toBe(mine.deckId);
    expect(theirs.noteId).not.toBe(mine.noteId);
  });

  it('un mazo nuevo se crea una sola vez con el ID que fija el diálogo', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deckId = newId();
    const target = { kind: 'new', deckId, name: '  Repaso de cardio  ' } as const;
    const first = await createQuestionCard(api, user, input(question, target), NOW);
    const again = await createQuestionCard(api, user, input(question, target), NOW);
    expect(first).toMatchObject({ status: 'created', deckId, layer: false });
    expect(again.status).toBe('exists');
    const decks = await api.repos.decks.list();
    expect(decks).toEqual([
      expect.objectContaining({ id: deckId, name: 'Repaso de cardio', ownerId: user.id }),
    ]);
    await expect(
      createQuestionCard(api, user, input(question, { kind: 'new', deckId: newId(), name: ' ' })),
    ).rejects.toBeInstanceOf(QuestionCardTargetError);
  });

  it('Mis errores, un mazo de otro alumno o uno que no existe no reciben tarjetas', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    await api.repos.decks.put({
      id: errorIds.deck(user.id),
      name: 'Mis errores',
      description: '',
      ownerId: user.id,
      origin: 'generated',
      visibility: 'private',
      isDemo: false,
      createdAt: NOW.toISOString(),
    });
    const foreign = await createManualDeck(api, makeUser(), { name: 'Ajeno' }, NOW);
    for (const deckId of [errorIds.deck(user.id), foreign.id, newId()]) {
      await expect(
        createQuestionCard(api, user, input(question, { kind: 'deck', deckId }), NOW),
      ).rejects.toBeInstanceOf(QuestionCardTargetError);
    }
    expect(await api.repos.notes.list()).toHaveLength(0);
  });

  it('una tarjeta vacía no se guarda', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deck = await createManualDeck(api, user, { name: 'Mi mazo' }, NOW);
    await expect(
      createQuestionCard(
        api,
        user,
        input(question, { kind: 'deck', deckId: deck.id }, { draft: { ...DRAFT, back: ' ' } }),
        NOW,
      ),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it('la propuesta de la IA queda generada, en borrador, con su cita del banco y su fuente', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deck = await createManualDeck(api, user, { name: 'Mi mazo' }, NOW);
    const artifactId = newId();
    const controversy = {
      reason: 'Algunas guías recientes recomiendan otro estudio inicial en este caso.',
      sources: [{ key: 'harrison' as const, locator: null }],
      simulated: true,
      flaggedAt: NOW.toISOString(),
    };
    const result = await createQuestionCard(
      api,
      user,
      input(
        question,
        { kind: 'deck', deckId: deck.id },
        {
          draft: {
            kind: 'cloze',
            text: 'La {{c1::furosemida}} alivia la {{c2::congestión}}',
            extra: '',
          },
          source: {
            kind: 'ai',
            quote: 'Explicación de prueba',
            sourceTitle: 'Pregunta del banco de Cardiología',
            artifactId,
            controversy,
          },
          from: 'practice_review',
        },
      ),
      NOW,
    );
    const note = (await api.repos.notes.get(result.noteId)) as Note;
    expect(note).toMatchObject({
      kind: 'cloze',
      origin: 'generated',
      editorialStatus: 'draft',
      sourceQuote: 'Explicación de prueba',
      sourceTitle: 'Pregunta del banco de Cardiología',
      controversy,
      tags: [`${TOPIC_TAG_PREFIX}${question.topic}`, AI_TAG],
    });
    // Lleva la etiqueta de borrador sin validar en Repasar y en Explorar
    expect(isAiNote(note)).toBe(true);
    const cards = await api.repos.cards.list();
    expect(cards.map((card) => card.id).sort()).toEqual(
      [questionCardIds.card(note.id, 1), questionCardIds.card(note.id, 2)].sort(),
    );
    const [event] = await eventsOf(api, user.id);
    expect(event?.payload).toMatchObject({ source: 'ai', artifactId, from: 'practice_review' });
  });

  it('si borró la tarjeta, crearla otra vez la revive y deja otro evento', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deck = await createManualDeck(api, user, { name: 'Mi mazo' }, NOW);
    const target = { kind: 'deck', deckId: deck.id } as const;
    const first = await createQuestionCard(api, user, input(question, target), NOW);
    await deleteManualNote(api, user, first.noteId, new Date(NOW.getTime() + 1000));
    expect(await api.repos.notes.list()).toHaveLength(0);
    const later = new Date(NOW.getTime() + 60_000);
    const again = await createQuestionCard(api, user, input(question, target), later);
    expect(again).toMatchObject({ status: 'created', noteId: first.noteId });
    expect(await api.repos.cards.list()).toEqual([
      expect.objectContaining({ id: questionCardIds.card(first.noteId, 0), deletedAt: null }),
    ]);
    expect(await eventsOf(api, user.id)).toHaveLength(2);
  });

  it('completa un intento que se cortó después de guardar la nota', async () => {
    const { api, user } = setup();
    const { question } = makeQuestionWithOptions();
    const deck = await createManualDeck(api, user, { name: 'Mi mazo' }, NOW);
    const noteId = questionCardIds.note(user.id, question.questionId, question.version, deck.id);
    // Solo alcanzó a guardar la nota, sin carta ni evento
    await api.repos.notes.put({
      id: noteId,
      deckId: deck.id,
      kind: 'basic',
      front: '<p>Frente</p>',
      back: '<p>Reverso</p>',
      tags: [],
      origin: 'manual',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: false,
      createdAt: NOW.toISOString(),
    });
    const result = await createQuestionCard(
      api,
      user,
      input(question, { kind: 'deck', deckId: deck.id }),
      new Date(NOW.getTime() + 5000),
    );
    expect(result.status).toBe('exists');
    expect(await api.repos.cards.list()).toHaveLength(1);
    expect(await eventsOf(api, user.id)).toHaveLength(1);
  });
});
