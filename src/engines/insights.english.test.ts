// Conócete y el inglés médico (B13, hallazgo 5 de la revisión independiente). El texto de un caso de lectura
// se lee una vez y sus preguntas se contestan sobre él. La segunda y la tercera salen en unos 35 segundos,
// y contando todas las palabras del texto en cada una parecían adivinanza rápida. Las respuestas de inglés
// quedan fuera del ritmo, de la adivinanza rápida, del tiempo atascado y de las viñetas largas. No hay otra
// medida. Sí cuentan en lo demás, como las trampas (anexo C del plan de B13).
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { buildInsights, type AnswerFact, type Insight, type InsightInput } from './insights';

let counter = 0;
function answer(overrides: Partial<AnswerFact> = {}): AnswerFact {
  counter += 1;
  return {
    id: `a${String(counter)}`,
    sessionId: 's1',
    at: '2026-10-10T15:00:00.000Z',
    msToAnswer: 70_000,
    words: 150,
    correct: true,
    confidence: null,
    expected: 0.6,
    changes: [],
    minuteInSession: 5,
    localHour: 10,
    polarity: 'affirmative',
    task: 'diagnosis',
    caseOrder: null,
    branch: 'pediatrics',
    topic: 'x',
    visibleTags: [],
    chosenTag: null,
    misread: false,
    ...overrides,
  };
}

function input(answers: AnswerFact[]): InsightInput {
  return {
    answers,
    reviews: [],
    sessionMinutes: [30],
    causes: [],
    studyDays: [],
    today: '2026-10-16',
    daysSinceStart: 20,
    desiredRetention: 0.9,
    thresholds: DEFAULT_THRESHOLDS,
  };
}

const find = (insights: Insight[], id: string) => insights.find((item) => item.id === id);

/** 150 respuestas en español, de unos 60 segundos con 150 palabras y 70% de aciertos */
const spanish = () =>
  Array.from({ length: 150 }, (_, index) =>
    answer({ msToAnswer: 55_000 + (index % 7) * 4_000, correct: index % 10 < 7 }),
  );

/**
 * El escenario de la revisión. 10 textos de tres preguntas, 120 segundos la primera y 35 las otras dos, con
 * 50% de aciertos. Cada pregunta cuenta las 400 palabras del texto, porque son las de su caso
 */
const english = (marked = true) =>
  Array.from({ length: 10 }, (_, text) =>
    Array.from({ length: 3 }, (_, order) =>
      answer({
        msToAnswer: order === 0 ? 120_000 : 35_000,
        words: 400,
        correct: (text + order) % 2 === 0,
        caseOrder: order + 1,
        branch: 'medical_english',
        task: 'data_interpretation',
        ...(marked ? { language: 'en' as const } : {}),
      }),
    ),
  ).flat();

const TIMED = ['pace', 'rapid_guess', 'stuck', 'long_vignettes'] as const;

describe('Conócete y las respuestas de inglés médico', () => {
  it('sin el idioma marcado el escenario de la revisión da el foco falso de adivinanza rápida', () => {
    // Es el defecto que se corrige. Sirve de control para que la prueba de abajo detecte algo
    const report = buildInsights(input([...spanish(), ...english(false)]));
    const rapid = find(report.insights, 'rapid_guess')?.state;
    expect(rapid).toMatchObject({ kind: 'ready', level: 'focus' });
    expect(rapid?.kind === 'ready' ? rapid.values.count : 0).toBeGreaterThan(0);
  });

  it('el escenario de la revisión no produce el foco falso, y el informe es el mismo que sin inglés', () => {
    const only = buildInsights(input(spanish()));
    const mixed = buildInsights(input([...spanish(), ...english()]));
    for (const id of TIMED) {
      expect(find(mixed.insights, id)?.state, id).toEqual(find(only.insights, id)?.state);
    }
    const rapid = find(mixed.insights, 'rapid_guess')?.state;
    expect(rapid).toMatchObject({ kind: 'ready', level: 'strength', values: { count: 0 } });
    expect(mixed.focus.map((item) => item.id)).not.toContain('rapid_guess');
    expect(mixed.focus.map((item) => item.id)).not.toContain('pace');
    // El inglés sí cuenta como respuesta del alumno
    expect(mixed.totals.answers).toBe(180);
    expect(only.totals.answers).toBe(150);
  });

  it('sin respuestas en español, el ritmo y la adivinanza rápida quedan calibrando con 0', () => {
    const report = buildInsights(input(english()));
    for (const id of TIMED) {
      const state = find(report.insights, id)?.state;
      expect(state?.kind, id).toBe('calibrating');
    }
    expect(find(report.insights, 'pace')?.state).toEqual({
      kind: 'calibrating',
      have: 0,
      need: 20,
      unit: 'answers',
    });
    expect(find(report.insights, 'long_vignettes')?.state).toMatchObject({
      kind: 'calibrating',
      have: 0,
    });
  });

  it('el calibrando cuenta solo las respuestas que sí entran al tiempo', () => {
    const report = buildInsights(input([...spanish().slice(0, 12), ...english()]));
    expect(find(report.insights, 'pace')?.state).toEqual({
      kind: 'calibrating',
      have: 12,
      need: 20,
      unit: 'answers',
    });
    expect(find(report.insights, 'rapid_guess')?.state).toMatchObject({
      kind: 'calibrating',
      have: 12,
    });
  });

  it('un texto de inglés no es una viñeta larga', () => {
    // 12 largas y 12 cortas en español, y 30 de inglés con 400 palabras que sumarían 30 a las largas. Con
    // las de inglés la exactitud de las largas bajaría de 100% a 64%
    const es = [
      ...Array.from({ length: 12 }, () => answer({ words: 200 })),
      ...Array.from({ length: 12 }, () => answer({ words: 50 })),
    ];
    const withEnglish = buildInsights(input([...es, ...english()]));
    const without = buildInsights(input(es));
    expect(find(withEnglish.insights, 'long_vignettes')?.state).toEqual(
      find(without.insights, 'long_vignettes')?.state,
    );
    const state = find(withEnglish.insights, 'long_vignettes')?.state;
    expect(state?.kind === 'ready' ? state.values.long : null).toBe(1);
  });

  it('el inglés sigue contando en las trampas, como dice el anexo C del plan', () => {
    const wrong = Array.from({ length: 45 }, () =>
      answer({
        language: 'en',
        correct: false,
        words: 400,
        visibleTags: ['anchoring', 'belief_bias', 'framing_effect'],
        chosenTag: 'anchoring',
        branch: 'medical_english',
      }),
    );
    const report = buildInsights(input(wrong));
    expect(report.totals.taggedErrors).toBe(45);
    expect(find(report.insights, 'biases')?.state.kind).not.toBe('calibrating');
  });

  it('una respuesta en español marcada es:es no cambia nada', () => {
    const marked = spanish().map((item) => ({ ...item, language: 'es' as const }));
    expect(buildInsights(input(marked))).toEqual(buildInsights(input(spanish())));
  });
});
