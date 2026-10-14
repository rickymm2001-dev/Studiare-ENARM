import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeUser, newId, testApi } from '../testing/fixtures';
import type { Deck } from '../schemas/decks';
import {
  createCardFromQuestion,
  defaultQuestionBack,
  defaultQuestionFront,
} from './questionCard';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  return { api, user: makeUser() };
}

describe('createCardFromQuestion (D-124)', () => {
  it('genera frente y reverso por omisión a partir de datos de la pregunta', () => {
    const front = defaultQuestionFront('¿Cuál es el tratamiento?', 'Varón de 45 años con fiebre.');
    expect(front).toBe('Varón de 45 años con fiebre.\n\n¿Cuál es el tratamiento?');

    const frontNoVignette = defaultQuestionFront('¿Cuál es la dosis?');
    expect(frontNoVignette).toBe('¿Cuál es la dosis?');

    const back = defaultQuestionBack(
      [
        { text: 'Amoxicilina', isCorrect: true },
        { text: 'Ciprofloxacino', isCorrect: false },
      ],
      'Tratamiento de elección según GPC.',
      [{ title: 'GPC Neumonía 2024' }],
    );
    expect(back).toContain('Respuesta correcta:\nAmoxicilina');
    expect(back).toContain('Explicación:\nTratamiento de elección según GPC.');
    expect(back).toContain('Referencias:\nGPC Neumonía 2024');
  });

  it('crea una tarjeta en un mazo propio con IDs deterministas y registra question_card_created', async () => {
    const { api, user } = setup();
    const ownDeck: Deck = {
      id: newId(),
      name: 'Mi mazo de estudio',
      description: '',
      ownerId: user.id,
      origin: 'manual',
      visibility: 'private',
      isDemo: false,
      createdAt: new Date().toISOString(),
    };
    await api.repos.decks.put(ownDeck);

    const question = {
      id: newId(),
      prompt: '¿Fármaco de elección?',
      explanation: 'Primera línea.',
      topic: 'infectologia',
      gpcRefs: [{ title: 'GPC Sepsis', status: 'verified' as const }],
    };
    const questionVersionId = newId();

    const res1 = await createCardFromQuestion(api, user, {
      question,
      questionVersionId,
      vignette: 'Caso clínico.',
      options: [
        { id: 'o1', text: 'Penicilina', isCorrect: true, rationale: '' },
        { id: 'o2', text: 'Eritromicina', isCorrect: false, rationale: '' },
      ],
      destinationDeckId: ownDeck.id,
    });

    expect(res1.created).toBe(true);
    expect(res1.effectiveDeckId).toBe(ownDeck.id);

    // Verificamos que la nota y tarjeta existan en la base
    const note = await api.repos.notes.get(res1.note.id);
    const card = await api.repos.cards.get(res1.card.id);
    expect(note).toBeDefined();
    expect(card).toBeDefined();
    expect(note?.deckId).toBe(ownDeck.id);
    expect(note?.tags).toEqual(['topic:infectologia']);
    // No debe ligarse como tarjeta de error para no tratarse como tal en Repasar
    expect(note?.sourceQuestionVersionId).toBeNull();

    // Verificamos el evento registrado
    const events = await api.repos.events.query({ userId: user.id });
    const createdEvent = events.find((e) => e.type === 'question_card_created');
    expect(createdEvent).toBeDefined();
    expect(createdEvent?.payload).toMatchObject({
      questionId: question.id,
      questionVersionId,
      cardId: res1.card.id,
      deckId: ownDeck.id,
    });

    // Idempotencia: una segunda llamada con los mismos datos devuelve created: false y mismos IDs
    const res2 = await createCardFromQuestion(api, user, {
      question,
      questionVersionId,
      vignette: 'Caso clínico.',
      options: [
        { id: 'o1', text: 'Penicilina', isCorrect: true, rationale: '' },
        { id: 'o2', text: 'Eritromicina', isCorrect: false, rationale: '' },
      ],
      destinationDeckId: ownDeck.id,
    });
    expect(res2.created).toBe(false);
    expect(res2.card.id).toBe(res1.card.id);
    expect(res2.note.id).toBe(res1.note.id);
  });

  it('en un mazo precargado la tarjeta va a la capa del alumno (submazo Mis tarjetas) sin mutar el mazo compartido', async () => {
    const { api, user } = setup();
    const preloadedDeck: Deck = {
      id: newId(),
      name: 'Medicina interna (Paco)',
      description: '',
      ownerId: null, // compartido / precargado
      origin: 'preloaded',
      visibility: 'public',
      isDemo: false,
      createdAt: new Date().toISOString(),
    };
    await api.repos.decks.put(preloadedDeck);

    const question = {
      id: newId(),
      prompt: '¿Diagnóstico más probable?',
      explanation: 'Cuadro típico.',
      topic: 'cardiologia',
      gpcRefs: [],
    };
    const questionVersionId = newId();

    const res = await createCardFromQuestion(api, user, {
      question,
      questionVersionId,
      options: [{ id: 'o1', text: 'Insuficiencia cardíaca', isCorrect: true, rationale: '' }],
      destinationDeckId: preloadedDeck.id,
    });

    expect(res.created).toBe(true);
    // El mazo efectivo NO es el mazo precargado directamente, sino un submazo hijo privado
    expect(res.effectiveDeckId).not.toBe(preloadedDeck.id);

    const subdeck = await api.repos.decks.get(res.effectiveDeckId);
    expect(subdeck).toBeDefined();
    expect(subdeck?.name).toBe('Mis tarjetas');
    expect(subdeck?.parentId).toBe(preloadedDeck.id);
    expect(subdeck?.ownerId).toBe(user.id);
    expect(subdeck?.origin).toBe('manual');
    expect(subdeck?.visibility).toBe('private');

    // El mazo precargado original NO cambió
    const preloadedAfter = await api.repos.decks.get(preloadedDeck.id);
    expect(preloadedAfter).toEqual(preloadedDeck);
  });
});
