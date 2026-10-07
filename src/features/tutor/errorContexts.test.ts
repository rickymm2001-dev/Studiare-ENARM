import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import { buildErrorContexts, type CardFact, type ErrorContextInput } from './errorContexts';
import { answered, event, minute, option, question, state } from './testing/fixtures';

function input(overrides: Partial<ErrorContextInput>): ErrorContextInput {
  return {
    events: [],
    bank: { questions: new Map(), options: new Map(), cases: new Map() },
    correctAnswers: [],
    cards: new Map<string, CardFact>(),
    mastery: new Map(),
    baseTopics: new Map(),
    timeZone: 'America/Merida',
    today: '2026-10-05',
    desiredRetention: 0.9,
    thresholds: DEFAULT_THRESHOLDS,
    ...overrides,
  };
}

describe('causa reportada de cada error', () => {
  it('una causa reportada días después de otro intento no explica el primer error', () => {
    const failed = question({ id: newId() });
    const trap = option(newId(), false, 'Furosemida');
    const day = 86_400_000;
    const events = [
      // Primer error, sin causa
      answered(failed, trap.id, false, minute(0)),
      // Cuatro días después se vuelve a fallar y ahí sí dice por qué
      answered(failed, trap.id, false, minute(0) + 4 * day),
      event(
        'cause_reported',
        { targetKind: 'question', targetId: failed.id, cause: 'misread' },
        minute(1) + 4 * day,
      ),
    ];
    const contexts = buildErrorContexts(
      input({
        events,
        bank: {
          questions: new Map([[failed.id, failed]]),
          options: new Map([[trap.id, trap]]),
          cases: new Map(),
        },
      }),
    );
    expect(contexts.map((context) => context.reportedCause)).toEqual([null, 'misread']);
  });

  it('la causa de un error que el alumno acaba de reportar sigue contando para ese error', () => {
    const failed = question({ id: newId() });
    const trap = option(newId(), false, 'Furosemida');
    const events = [
      answered(failed, trap.id, false, minute(0)),
      event(
        'cause_reported',
        { targetKind: 'question', targetId: failed.id, cause: 'rushed_or_tired' },
        minute(1),
      ),
      // Un intento posterior sin causa no la cambia
      answered(failed, trap.id, false, minute(100)),
    ];
    const contexts = buildErrorContexts(
      input({
        events,
        bank: {
          questions: new Map([[failed.id, failed]]),
          options: new Map([[trap.id, trap]]),
          cases: new Map(),
        },
      }),
    );
    expect(contexts.map((context) => context.reportedCause)).toEqual(['rushed_or_tired', null]);
  });
});

describe('contexto de cada error para las reglas de olvido', () => {
  it('un error de pregunta trae su confianza, su causa y la pregunta con la que se confundió', () => {
    const failed = question({ id: newId() });
    const other = question({ id: newId() });
    const right = option(newId(), true, 'Carvedilol');
    const trap = option(newId(), false, 'Furosemida');
    const events = [
      event('session_started', { kind: 'practice', config: {} }, minute(0)),
      answered(failed, trap.id, false, minute(5), { confidence: 'sure' }),
      event(
        'cause_reported',
        { targetKind: 'question', targetId: failed.id, cause: 'confused' },
        minute(6),
      ),
      // Un acierto no genera contexto
      answered(other, right.id, true, minute(8)),
    ];
    const [context, ...rest] = buildErrorContexts(
      input({
        events,
        bank: {
          questions: new Map([
            [failed.id, failed],
            [other.id, other],
          ]),
          options: new Map([
            [right.id, right],
            [trap.id, trap],
          ]),
          cases: new Map(),
        },
        correctAnswers: [
          { questionId: other.id, subtopic: 'heart_failure', text: ' furosemida. ' },
          { questionId: failed.id, subtopic: 'heart_failure', text: 'Carvedilol' },
          { questionId: newId(), subtopic: 'otro_subtema', text: 'Furosemida' },
        ],
      }),
    );
    expect(rest).toHaveLength(0);
    expect(context).toMatchObject({
      kind: 'question',
      itemId: failed.id,
      subtopic: 'cardiology',
      confidence: 'sure',
      confusedWithItemId: other.id,
      reportedCause: 'confused',
      lapses: null,
      probableMisread: false,
      baseTopicWeak: false,
    });
  });

  it('marca la mala lectura y el tema base débil', () => {
    const negative = question({
      id: newId(),
      topic: 'nephrology',
      structure: { polarity: 'negative', task: 'diagnosis', format: 'direct', source: 'auto' },
    });
    const right = option(newId(), true, 'A');
    const wrong = option(newId(), false, 'B');
    const events = [
      event('session_started', { kind: 'practice', config: {} }, minute(0)),
      answered(negative, wrong.id, false, minute(2), { msToAnswer: 500 }),
      event(
        'cause_reported',
        { targetKind: 'question', targetId: negative.id, cause: 'misread' },
        minute(3),
      ),
    ];
    const bank = {
      questions: new Map([[negative.id, negative]]),
      options: new Map([
        [right.id, right],
        [wrong.id, wrong],
      ]),
      cases: new Map(),
    };
    const [weak] = buildErrorContexts(
      input({
        events,
        bank,
        baseTopics: new Map([['nephrology', 'endocrinology']]),
        mastery: new Map([['endocrinology', 0.4]]),
      }),
    );
    expect(weak).toMatchObject({
      probableMisread: true,
      baseTopicWeak: true,
      reportedCause: 'misread',
    });
    // Con el tema base bien o sin dominio calculado no hay brecha de base
    const [fine] = buildErrorContexts(
      input({
        events,
        bank,
        baseTopics: new Map([['nephrology', 'endocrinology']]),
        mastery: new Map([['endocrinology', 0.8]]),
      }),
    );
    expect(fine?.baseTopicWeak).toBe(false);
    const [calibrating] = buildErrorContexts(
      input({ events, bank, baseTopics: new Map([['nephrology', 'endocrinology']]) }),
    );
    expect(calibrating?.baseTopicWeak).toBe(false);
  });

  it('un error de tarjeta trae sus lapsos, su lista, su retención y su causa', () => {
    const cardId = newId();
    const review = event(
      'card_reviewed',
      {
        cardId,
        deckId: newId(),
        source: 'card',
        rating: 'again',
        confidence: 'sure',
        msToReveal: 3000,
        msToRate: 2000,
        stateBefore: state(),
        stateAfter: state({ lapses: 3 }),
      },
      minute(10),
    );
    const events = [
      review,
      event(
        'cause_reported',
        { targetKind: 'card', targetId: cardId, cause: 'forgot' },
        minute(11),
      ),
      // Una tarjeta que se califica bien no es un error
      event(
        'card_reviewed',
        {
          cardId,
          deckId: newId(),
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 1,
          msToRate: 1,
          stateBefore: state(),
          stateAfter: state(),
        },
        minute(20),
      ),
    ];
    const cards = new Map<string, CardFact>([
      [
        cardId,
        { topic: 'cardiology', back: 'Fiebre<br>Tos<br>Disnea<br>Dolor torácico<br>Fatiga' },
      ],
    ]);
    const [context, ...rest] = buildErrorContexts(input({ events, cards }));
    expect(rest).toHaveLength(0);
    expect(context).toMatchObject({
      kind: 'card',
      itemId: cardId,
      subtopic: 'cardiology',
      lapses: 3,
      answerListItems: 5,
      confidence: 'sure',
      reportedCause: 'forgot',
    });
    expect(context?.daysSinceLastReview).toBeCloseTo(30, 1);
    expect(context?.predictedRetrievability).toBeGreaterThan(0);
    expect(context?.predictedRetrievability).toBeLessThan(1);
  });

  it('una tarjeta sin subespecialidad o que era nueva no inventa datos', () => {
    const withoutTopic = newId();
    const fresh = newId();
    const events = [
      event(
        'card_reviewed',
        {
          cardId: withoutTopic,
          deckId: newId(),
          source: 'card',
          rating: 'again',
          confidence: null,
          msToReveal: 1,
          msToRate: 1,
          stateBefore: null,
          stateAfter: state({ lapses: 1 }),
        },
        minute(1),
      ),
      event(
        'card_reviewed',
        {
          cardId: fresh,
          deckId: newId(),
          source: 'card',
          rating: 'again',
          confidence: 'dont_know',
          msToReveal: 1,
          msToRate: 1,
          stateBefore: null,
          stateAfter: state({ lapses: 0, state: 'learning' }),
        },
        minute(2),
      ),
    ];
    const cards = new Map<string, CardFact>([
      [withoutTopic, { topic: null, back: 'x' }],
      [fresh, { topic: 'cardiology', back: null }],
    ]);
    const contexts = buildErrorContexts(input({ events, cards }));
    // La de sin tema no cuenta. La nueva cuenta, sin retención ni días desde el último repaso
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      itemId: fresh,
      confidence: 'dont_know',
      predictedRetrievability: null,
      daysSinceLastReview: null,
      answerListItems: null,
    });
  });

  it('marca la fatiga en el último tercio de una sesión larga donde la exactitud cae', () => {
    const q = question({ id: newId(), physicianDifficulty: 1 });
    const right = option(newId(), true, 'A');
    const wrong = option(newId(), false, 'B');
    const events: AppEvent[] = [
      event('session_started', { kind: 'practice', config: {} }, minute(0)),
    ];
    // 12 respuestas en 44 minutos. Las primeras 4 bien, las últimas 4 mal
    for (let index = 0; index < 12; index += 1) {
      const good = index < 8;
      events.push(answered(q, good ? right.id : wrong.id, good, minute(index * 4)));
    }
    const contexts = buildErrorContexts(
      input({
        events,
        bank: {
          questions: new Map([[q.id, q]]),
          options: new Map([
            [right.id, right],
            [wrong.id, wrong],
          ]),
          cases: new Map(),
        },
      }),
    );
    // Los 4 errores caen en las últimas 4 respuestas, que son el último tercio
    expect(contexts).toHaveLength(4);
    expect(contexts.every((context) => context.fatigueContext)).toBe(true);
  });

  it('sin errores no hay contextos y salen en orden de tiempo', () => {
    expect(buildErrorContexts(input({}))).toEqual([]);
    const a = newId();
    const b = newId();
    const mk = (cardId: string, at: number) =>
      event(
        'card_reviewed',
        {
          cardId,
          deckId: newId(),
          source: 'card',
          rating: 'again',
          confidence: null,
          msToReveal: 1,
          msToRate: 1,
          stateBefore: null,
          stateAfter: state(),
        },
        at,
      );
    const cards = new Map<string, CardFact>([
      [a, { topic: 'cardiology', back: null }],
      [b, { topic: 'cardiology', back: null }],
    ]);
    const contexts = buildErrorContexts(
      input({ events: [mk(b, minute(5)), mk(a, minute(1))], cards }),
    );
    expect(contexts.map((context) => context.itemId)).toEqual([a, b]);
  });
});
