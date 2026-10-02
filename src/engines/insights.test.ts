import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import {
  buildInsights,
  chanceBaseline,
  ENARM_SECONDS_PER_ITEM,
  type AnswerFact,
  type Insight,
  type InsightInput,
  type ReviewFact,
} from './insights';

let counter = 0;
function answer(overrides: Partial<AnswerFact> = {}): AnswerFact {
  counter += 1;
  return {
    id: `a${counter}`,
    sessionId: 's1',
    at: '2026-09-01T15:00:00Z',
    msToAnswer: 60_000,
    words: 100,
    correct: true,
    confidence: 'unsure',
    expected: 0.6,
    changes: [],
    minuteInSession: 5,
    localHour: 9,
    polarity: 'affirmative',
    task: 'diagnosis',
    caseOrder: null,
    branch: 'internal_medicine',
    topic: 'cardiology',
    visibleTags: [],
    chosenTag: null,
    misread: false,
    ...overrides,
  };
}

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    answers: [],
    reviews: [],
    sessionMinutes: [],
    causes: [],
    studyDays: [],
    today: '2026-10-02',
    daysSinceStart: 0,
    desiredRetention: 0.9,
    thresholds: DEFAULT_THRESHOLDS,
    ...overrides,
  };
}

const find = (insights: Insight[], id: string) => {
  const insight = insights.find((item) => item.id === id);
  if (!insight) throw new Error(`Falta ${id}`);
  return insight;
};
const levelOf = (insights: Insight[], id: string) => {
  const state = find(insights, id).state;
  return state.kind === 'ready' ? state.level : 'calibrating';
};

describe('buildInsights', () => {
  it('sin datos todo queda calibrando y no hay fortalezas ni focos', () => {
    const report = buildInsights(input());
    expect(report.insights.every((item) => item.state.kind === 'calibrating')).toBe(true);
    expect(report.strengths).toEqual([]);
    expect(report.focus).toEqual([]);
    const pace = find(report.insights, 'pace').state;
    expect(pace).toEqual({ kind: 'calibrating', have: 0, need: 20, unit: 'answers' });
  });

  it('el ritmo compara la mediana contra los 77 segundos del ENARM', () => {
    const slow = Array.from({ length: 20 }, () => answer({ msToAnswer: 110_000 }));
    const fast = Array.from({ length: 20 }, () => answer({ msToAnswer: 50_000 }));
    expect(levelOf(buildInsights(input({ answers: slow })).insights, 'pace')).toBe('focus');
    const report = buildInsights(input({ answers: fast }));
    expect(levelOf(report.insights, 'pace')).toBe('strength');
    const state = find(report.insights, 'pace').state;
    expect(state.kind === 'ready' && state.values.target).toBe(ENARM_SECONDS_PER_ITEM);
  });

  it('marca adivinanza rápida cuando responde más rápido de lo que se puede leer y falla', () => {
    // 100 palabras a 6 por segundo son unos 16.7 segundos mínimos
    const answers = [
      ...Array.from({ length: 30 }, () => answer({ msToAnswer: 60_000 })),
      ...Array.from({ length: 5 }, () => answer({ msToAnswer: 5_000, correct: false })),
    ];
    expect(levelOf(buildInsights(input({ answers })).insights, 'rapid_guess')).toBe('focus');
    const calm = Array.from({ length: 30 }, (_, i) => answer({ msToAnswer: 40_000 + i * 1000 }));
    expect(levelOf(buildInsights(input({ answers: calm })).insights, 'rapid_guess')).toBe(
      'strength',
    );
  });

  it('el saldo de cambios distingue cambiar para bien de cambiar para mal', () => {
    const toWrong = Array.from({ length: 12 }, () =>
      answer({ correct: false, changes: [{ fromCorrect: true, toCorrect: false }] }),
    );
    expect(levelOf(buildInsights(input({ answers: toWrong })).insights, 'changes')).toBe('focus');
    const toRight = Array.from({ length: 12 }, () =>
      answer({ changes: [{ fromCorrect: false, toCorrect: true }] }),
    );
    expect(levelOf(buildInsights(input({ answers: toRight })).insights, 'changes')).toBe(
      'strength',
    );
    const few = [answer({ changes: [{ fromCorrect: false, toCorrect: true }] })];
    expect(find(buildInsights(input({ answers: few })).insights, 'changes').state).toEqual({
      kind: 'calibrating',
      have: 1,
      need: 10,
      unit: 'changes',
    });
  });

  it('detecta la tarea más débil contra el resto', () => {
    const answers = [
      ...Array.from({ length: 30 }, () => answer({ task: 'diagnosis', correct: true })),
      ...Array.from({ length: 20 }, (_, i) => answer({ task: 'treatment', correct: i < 4 })),
    ];
    const state = find(buildInsights(input({ answers })).insights, 'task').state;
    expect(state.kind).toBe('ready');
    if (state.kind === 'ready') {
      expect(state.level).toBe('focus');
      expect(state.refs.task).toBe('treatment');
    }
  });

  it('compara la segunda y tercera pregunta del caso seriado contra la primera', () => {
    const answers = [
      ...Array.from({ length: 15 }, () => answer({ caseOrder: 1, correct: true })),
      ...Array.from({ length: 15 }, (_, i) => answer({ caseOrder: 2, correct: i < 3 })),
    ];
    expect(levelOf(buildInsights(input({ answers })).insights, 'serial')).toBe('focus');
  });

  it('la sobreconfianza es foco', () => {
    const answers = Array.from({ length: 40 }, (_, i) =>
      answer({ confidence: 'sure', correct: i < 20 }),
    );
    expect(levelOf(buildInsights(input({ answers })).insights, 'confidence')).toBe('focus');
  });

  it('detecta peor rendimiento en negativas con el mínimo por polaridad', () => {
    const answers = [
      ...Array.from({ length: 25 }, () => answer({ polarity: 'affirmative', correct: true })),
      ...Array.from({ length: 25 }, (_, i) => answer({ polarity: 'negative', correct: i < 5 })),
    ];
    expect(levelOf(buildInsights(input({ answers })).insights, 'negation')).toBe('focus');
    const few = buildInsights(input({ answers: answers.slice(0, 30) })).insights;
    expect(find(few, 'negation').state).toMatchObject({ kind: 'calibrating', have: 5, need: 20 });
  });

  it('el mejor horario necesita dos franjas con datos', () => {
    const answers = [
      ...Array.from({ length: 12 }, () => answer({ localHour: 8, correct: true })),
      ...Array.from({ length: 12 }, (_, i) => answer({ localHour: 23, correct: i < 6 })),
    ];
    const state = find(buildInsights(input({ answers })).insights, 'best_hour').state;
    expect(state.kind === 'ready' && state.refs.best).toBe('manana');
  });
});

describe('trampas', () => {
  it('sigue calibrando con menos de 40 errores etiquetados', () => {
    const answers = Array.from({ length: 10 }, () =>
      answer({
        correct: false,
        visibleTags: ['anchoring', 'premature_closure'],
        chosenTag: 'anchoring',
      }),
    );
    expect(find(buildInsights(input({ answers })).insights, 'biases').state).toEqual({
      kind: 'calibrating',
      have: 10,
      need: 40,
      unit: 'tagged_errors',
    });
  });

  it('encuentra la etiqueta que atrae más que el azar y arma el perfil', () => {
    const answers = [
      ...Array.from({ length: 45 }, () =>
        answer({
          correct: false,
          visibleTags: ['anchoring', 'premature_closure', 'availability'],
          chosenTag: 'anchoring',
        }),
      ),
      ...Array.from({ length: 5 }, () =>
        answer({
          correct: false,
          visibleTags: ['anchoring', 'premature_closure', 'availability'],
          chosenTag: 'availability',
        }),
      ),
    ];
    const report = buildInsights(input({ answers }));
    const bias = find(report.insights, 'bias:anchoring').state;
    expect(bias.kind === 'ready' && bias.level).toBe('focus');
    expect(report.focus.some((item) => item.id === 'bias:anchoring')).toBe(true);
    const profile = find(report.insights, 'bias_profile').state;
    expect(profile.kind === 'ready' && profile.refs.tag0).toBe('anchoring');
    expect(report.totals.taggedErrors).toBe(50);
  });

  it('elegir parejo entre distractores no es patrón', () => {
    const tags = ['anchoring', 'premature_closure', 'availability'];
    const answers = Array.from({ length: 60 }, (_, i) =>
      answer({ correct: false, visibleTags: tags, chosenTag: tags[i % 3] ?? null }),
    );
    expect(levelOf(buildInsights(input({ answers })).insights, 'biases')).toBe('strength');
  });

  it('ignora la etiqueta elegida cuando la respuesta fue correcta', () => {
    const answers = Array.from({ length: 50 }, () =>
      answer({ correct: true, visibleTags: ['anchoring'], chosenTag: 'anchoring' }),
    );
    expect(buildInsights(input({ answers })).totals.taggedErrors).toBe(0);
  });
});

describe('chanceBaseline', () => {
  it('es la proporción media de cada etiqueta entre los distractores visibles al fallar', () => {
    const baseline = chanceBaseline([
      { visibleTags: ['a', 'b'], chosenTag: 'a' },
      { visibleTags: ['a', 'a', 'b', 'c'], chosenTag: 'b' },
      { visibleTags: ['a', 'b'], chosenTag: null },
    ]);
    expect(baseline.a).toBeCloseTo((0.5 + 0.5) / 2);
    expect(baseline.b).toBeCloseTo((0.5 + 0.25) / 2);
    expect(baseline.c).toBeCloseTo(0.25);
  });
});

describe('estudio', () => {
  const review = (overrides: Partial<ReviewFact> = {}): ReviewFact => ({
    rating: 'good',
    stateBefore: 'review',
    lapsesAfter: 0,
    cardId: 'c1',
    ...overrides,
  });

  it('la constancia cuenta días de las últimas 4 semanas', () => {
    const studyDays = Array.from(
      { length: 25 },
      (_, i) => `2026-09-${String(i + 5).padStart(2, '0')}`,
    );
    const report = buildInsights(input({ studyDays, daysSinceStart: 60 }));
    const state = find(report.insights, 'consistency').state;
    expect(state.kind === 'ready' && state.values.days).toBe(25);
    expect(levelOf(report.insights, 'consistency')).toBe('strength');
    expect(
      levelOf(buildInsights(input({ studyDays: [], daysSinceStart: 3 })).insights, 'consistency'),
    ).toBe('calibrating');
  });

  it('la retención madura por debajo de la deseada es foco', () => {
    const reviews = Array.from({ length: 60 }, (_, i) =>
      review({ cardId: `c${i}`, rating: i < 15 ? 'again' : 'good' }),
    );
    expect(levelOf(buildInsights(input({ reviews })).insights, 'retention')).toBe('focus');
  });

  it('una tarjeta con 8 lapsos es sanguijuela', () => {
    const reviews = [
      ...Array.from({ length: 55 }, (_, i) => review({ cardId: `c${i}` })),
      review({ cardId: 'leech', lapsesAfter: 8, rating: 'again' }),
    ];
    const state = find(buildInsights(input({ reviews })).insights, 'leeches').state;
    expect(state.kind === 'ready' && state.values.leeches).toBe(1);
  });

  it('las causas más reportadas guían el foco', () => {
    const causes = [
      'forgot',
      'forgot',
      'forgot',
      'forgot',
      'forgot',
      'misread',
      'misread',
      'guessed',
    ];
    const state = find(buildInsights(input({ causes })).insights, 'causes').state;
    expect(state).toMatchObject({ kind: 'ready', level: 'focus', refs: { cause: 'forgot' } });
  });

  it('ordena los focos por peso', () => {
    const answers = Array.from({ length: 40 }, (_, i) =>
      answer({ confidence: 'sure', correct: i < 20, msToAnswer: 120_000 }),
    );
    const { focus } = buildInsights(input({ answers }));
    const weights = focus.map((item) => item.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });
});
