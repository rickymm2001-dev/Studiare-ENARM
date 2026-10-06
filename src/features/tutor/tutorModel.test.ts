import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { ErrorContext } from '@/engines/forgetting';
import { buildHypotheses, confusedPairs, hypothesisKey, pickTop, RULE_ACTIONS } from './tutorModel';

const thresholds = DEFAULT_THRESHOLDS.forgetting;
const NOW = new Date('2026-10-06T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

let counter = 0;
function context(overrides: Partial<ErrorContext> = {}): ErrorContext {
  counter += 1;
  return {
    eventId: `e${counter}`,
    itemId: `i${counter}`,
    kind: 'question',
    at: daysAgo(1),
    subtopic: 'cardiology',
    lapses: null,
    answerListItems: null,
    confusedWithItemId: null,
    confidence: 'sure',
    probableMisread: false,
    fatigueContext: false,
    rapidGuess: false,
    baseTopicWeak: false,
    predictedRetrievability: null,
    daysSinceLastReview: null,
    reportedCause: null,
    ...overrides,
  };
}

const sure = (count: number, overrides: Partial<ErrorContext> = {}) =>
  Array.from({ length: count }, (_, index) => context({ at: daysAgo(index + 1), ...overrides }));

describe('hipótesis del tutor por reglas (8.2, 7.9)', () => {
  it('con 5 hallazgos del mismo tipo y área en 14 días el patrón se confirma', () => {
    const [hypothesis, ...rest] = buildHypotheses({
      contexts: sure(5),
      now: NOW,
      thresholds,
    });
    expect(rest).toHaveLength(0);
    expect(hypothesis).toMatchObject({
      key: hypothesisKey('high_confidence_error', 'cardiology'),
      rule: 'high_confidence_error',
      area: 'cardiology',
      status: 'confirmed',
      recentFindings: 5,
      findingsNeeded: 0,
      confidence: 'low',
      actions: ['review_explanation'],
    });
    // La evidencia va del error más reciente al más antiguo
    expect(hypothesis?.items.map((item) => item.at)).toEqual(
      [...(hypothesis?.items ?? [])]
        .map((item) => item.at)
        .sort()
        .reverse(),
    );
    expect(hypothesis?.items).toHaveLength(5);
  });

  it('antes de 5 hallazgos solo se está formando y dice cuántos faltan', () => {
    const [hypothesis] = buildHypotheses({ contexts: sure(3), now: NOW, thresholds });
    expect(hypothesis).toMatchObject({ status: 'forming', recentFindings: 3, findingsNeeded: 2 });
  });

  it('la confianza sube a media con el doble de hallazgos y nunca es alta', () => {
    const many = buildHypotheses({ contexts: sure(10), now: NOW, thresholds });
    expect(many[0]?.confidence).toBe('medium');
    const lots = buildHypotheses({
      contexts: sure(100).map((c, i) => ({ ...c, at: daysAgo(1 + (i % 10)) })),
      now: NOW,
      thresholds,
    });
    expect(['low', 'medium']).toContain(lots[0]?.confidence);
  });

  it('los errores fuera de la ventana de 14 días no cuentan', () => {
    const old = [...sure(2), ...sure(4).map((c) => ({ ...c, at: daysAgo(30) }))];
    const [hypothesis] = buildHypotheses({ contexts: old, now: NOW, thresholds });
    expect(hypothesis).toMatchObject({ status: 'forming', recentFindings: 2 });
  });

  it('cada área forma su propio patrón y el olvido esperado nunca forma uno', () => {
    const contexts = [
      ...sure(5),
      ...sure(5, { subtopic: 'nephrology' }),
      // Olvido esperado. Retención baja tras un intervalo largo, sin otra señal
      ...Array.from({ length: 6 }, () =>
        context({
          kind: 'card',
          confidence: null,
          lapses: 1,
          predictedRetrievability: 0.5,
          daysSinceLastReview: 40,
        }),
      ),
    ];
    const hypotheses = buildHypotheses({ contexts, now: NOW, thresholds });
    expect(hypotheses.map((hypothesis) => hypothesis.key).sort()).toEqual([
      'high_confidence_error|cardiology',
      'high_confidence_error|nephrology',
    ]);
    expect(RULE_ACTIONS.expected_forgetting).toEqual([]);
  });

  it('cuenta las causas reportadas que no coinciden con las señales', () => {
    // Prisa con causa que dijo olvidé, y mala lectura que sí coincide
    const contexts = [
      ...sure(3, { confidence: null, rapidGuess: true, reportedCause: 'forgot' }),
      ...sure(2, { confidence: null, rapidGuess: true, reportedCause: 'rushed_or_tired' }),
      ...sure(1, { confidence: null, rapidGuess: true, reportedCause: null }),
    ];
    const [hypothesis] = buildHypotheses({ contexts, now: NOW, thresholds });
    expect(hypothesis).toMatchObject({
      rule: 'rushing',
      recentFindings: 6,
      causesReported: 5,
      causeMismatches: 3,
    });
  });

  it('cada regla trae acciones de la lista cerrada y la de interferencia es la tarjeta de contraste', () => {
    expect(RULE_ACTIONS.interference).toEqual(['create_contrast_card']);
    const allowed = [
      'create_contrast_card',
      'split_card',
      'review_explanation',
      'subtopic_simulator',
      'enable_highlight',
      'suggest_break',
    ];
    for (const actions of Object.values(RULE_ACTIONS))
      for (const action of actions) expect(allowed).toContain(action);
  });
});

describe('pares que confunde', () => {
  it('junta los pares de interferencia sin repetir el mismo par al revés y respeta el límite', () => {
    const items = [
      { eventId: 'a', itemId: 'q1', kind: 'question', at: '3', confusedWithItemId: 'q2' },
      { eventId: 'b', itemId: 'q2', kind: 'question', at: '2', confusedWithItemId: 'q1' },
      { eventId: 'c', itemId: 'q3', kind: 'question', at: '1', confusedWithItemId: 'q4' },
      { eventId: 'd', itemId: 'q5', kind: 'question', at: '0', confusedWithItemId: null },
    ] as const;
    expect(confusedPairs({ items })).toEqual([
      { failedId: 'q1', chosenId: 'q2' },
      { failedId: 'q3', chosenId: 'q4' },
    ]);
    expect(confusedPairs({ items }, 1)).toEqual([{ failedId: 'q1', chosenId: 'q2' }]);
  });
});

describe('hipótesis que se abren de entrada', () => {
  const h = (rule: string, id: number) => ({ rule, id }) as { rule: never; id: number };

  it('prefiere reglas distintas aunque tengan menos hallazgos y conserva el orden', () => {
    const sorted = [h('a', 1), h('a', 2), h('a', 3), h('b', 4), h('c', 5), h('b', 6)];
    const { top, rest } = pickTop(sorted, 3);
    expect(top.map((item) => item.id)).toEqual([1, 4, 5]);
    expect(rest.map((item) => item.id)).toEqual([2, 3, 6]);
  });

  it('si hay pocas reglas distintas completa con las siguientes de más hallazgos', () => {
    const sorted = [h('a', 1), h('a', 2), h('b', 3), h('a', 4)];
    expect(pickTop(sorted, 3).top.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('con menos de las pedidas devuelve todas y nada en el resto', () => {
    const sorted = [h('a', 1)];
    expect(pickTop(sorted, 3)).toEqual({ top: sorted, rest: [] });
    expect(pickTop([], 3)).toEqual({ top: [], rest: [] });
    expect(pickTop(sorted, 0)).toEqual({ top: [], rest: sorted });
  });
});
