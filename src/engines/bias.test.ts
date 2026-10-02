import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import {
  analyzeBehaviorBiases,
  analyzeBias,
  countBehaviorIndicators,
  evaluateIndicator,
  populationBaseline,
  populationIndicatorRates,
  type BiasExposure,
  type ResponseFacts,
} from './bias';
import { createRng } from './random';

const TAGS = [
  'anchoring',
  'premature_closure',
  'availability',
  'base_rate_fallacy',
  'framing_effect',
];
const thresholds = DEFAULT_THRESHOLDS.bias;

/** Alumno simulado que responde preguntas con 3 distractores de etiquetas al azar */
function simulateStudent(
  seed: string,
  questions: number,
  propensity: Record<string, number> = {},
): BiasExposure[] {
  const rng = createRng(seed);
  const result: BiasExposure[] = [];
  for (let index = 0; index < questions; index += 1) {
    const visible = [rng.pick(TAGS), rng.pick(TAGS), rng.pick(TAGS)];
    if (rng.chance(0.6)) {
      result.push({ visibleTags: visible, chosenTag: null });
      continue;
    }
    // Falla. Elige un distractor con peso extra hacia su sesgo
    const weights = visible.map((tag) => 1 + (propensity[tag] ?? 0));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = rng.next() * total;
    let chosen = visible[0] as string;
    for (const [position, tag] of visible.entries()) {
      roll -= weights[position] as number;
      if (roll <= 0) {
        chosen = tag;
        break;
      }
    }
    result.push({ visibleTags: visible, chosenTag: chosen });
  }
  return result;
}

describe('análisis por sesgo (7.4)', () => {
  const population = Array.from({ length: 100 }, (_, index) =>
    simulateStudent(`pob-${index}`, 200),
  );
  const baseline = populationBaseline(population, 'simulated');

  it('la línea base viene de la población y dice su fuente', () => {
    expect(baseline.source).toBe('simulated');
    for (const tag of TAGS) expect(baseline.attraction[tag]).toBeGreaterThan(0.1);
  });

  it('calibra hasta tener 40 errores con etiqueta', () => {
    const analysis = analyzeBias({ exposures: simulateStudent('pocos', 30), baseline, thresholds });
    expect(analysis.taggedErrors).toBeLessThan(40);
    expect(analysis.tags.every((tag) => tag.status.kind === 'calibrating')).toBe(true);
    expect(analysis.patterns).toEqual([]);
  });

  it('detecta un sesgo sembrado y no inventa patrones donde no hay', () => {
    const biased = analyzeBias({
      exposures: simulateStudent('anclado', 300, { anchoring: 4 }),
      baseline,
      thresholds,
    });
    expect(biased.patterns).toEqual(['anchoring']);
    const anchoring = biased.tags.find((tag) => tag.tag === 'anchoring');
    expect(anchoring?.lower).toBeGreaterThan(anchoring?.baseline ?? 1);
    const neutral = analyzeBias({
      exposures: simulateStudent('neutral', 300),
      baseline,
      thresholds,
    });
    expect(neutral.patterns).toEqual([]);
  });

  it('una etiqueta sin línea base no se marca como patrón', () => {
    const analysis = analyzeBias({
      exposures: Array.from({ length: 60 }, () => ({ visibleTags: ['nueva'], chosenTag: 'nueva' })),
      baseline: { attraction: {}, source: 'real' },
      thresholds,
    });
    expect(analysis.tags[0]).toMatchObject({
      tag: 'nueva',
      baseline: null,
      status: { kind: 'no_pattern' },
    });
  });
});

function facts(overrides: Partial<ResponseFacts>[], sessionId = 's'): ResponseFacts[] {
  return overrides.map((override, order) => ({
    sessionId,
    order,
    correct: true,
    confidence: 'unsure',
    chosenPosition: 1,
    correctPosition: 1,
    shownCount: 4,
    firstChoiceCorrect: true,
    changed: false,
    timeZ: 0,
    ...override,
  }));
}

describe('indicadores de conducta (D-042)', () => {
  it('cuenta cada indicador con su definición', () => {
    const counts = countBehaviorIndicators(
      facts([
        { confidence: 'sure', correct: false, chosenPosition: 0, correctPosition: 2 },
        { confidence: 'sure', correct: true, correctPosition: 2, chosenPosition: 2, timeZ: 2.5 },
        {
          correct: false,
          firstChoiceCorrect: false,
          changed: false,
          chosenPosition: 2,
          correctPosition: 2,
          timeZ: null,
        },
        {
          correct: false,
          firstChoiceCorrect: false,
          changed: true,
          chosenPosition: 3,
          correctPosition: 1,
        },
      ]),
    );
    expect(counts.overconfidence_effect).toEqual({ k: 1, n: 2 });
    expect(counts.serial_position_effect).toEqual({ k: 2, n: 3 });
    expect(counts.status_quo_bias).toEqual({ k: 1, n: 2 });
    expect(counts.sunk_cost_fallacy).toEqual({ k: 1, n: 3 });
    expect(counts.gamblers_fallacy).toEqual({ k: 1, n: 2 });
    expect(counts.clustering_illusion).toEqual({ k: 1, n: 3 });
    expect(counts.zeigarnik_effect).toEqual({ k: 1, n: 1 });
  });

  it('calibra con pocos casos y marca patrón solo si el intervalo supera la línea base', () => {
    expect(evaluateIndicator('overconfidence_effect', { k: 5, n: 10 }, 0.1).status).toEqual({
      kind: 'calibrating',
      needed: 20,
      unit: 'responses',
    });
    expect(evaluateIndicator('overconfidence_effect', { k: 25, n: 50 }, 0.1).status).toEqual({
      kind: 'pattern',
    });
    expect(evaluateIndicator('overconfidence_effect', { k: 6, n: 50 }, 0.1).status).toEqual({
      kind: 'no_pattern',
    });
  });

  it('usa la población o la tasa propia según el indicador', () => {
    const rng = createRng('indicadores');
    const student = facts(
      Array.from({ length: 120 }, () => ({
        correct: rng.chance(0.7),
        confidence: rng.pick(['guessed', 'unsure', 'sure'] as const),
        chosenPosition: rng.int(0, 3),
        correctPosition: rng.int(0, 3),
        timeZ: rng.normal(0, 1),
      })),
    );
    const rates = populationIndicatorRates([student, student]);
    const report = analyzeBehaviorBiases({ facts: student, populationRates: rates });
    expect(report).toHaveLength(7);
    expect(
      report.find((indicator) => indicator.key === 'overconfidence_effect')?.baseline,
    ).toBeCloseTo(rates.overconfidence_effect, 12);
    const ownRate = student.filter((fact) => !fact.correct).length / student.length;
    expect(report.find((indicator) => indicator.key === 'gamblers_fallacy')?.baseline).toBeCloseTo(
      ownRate,
      12,
    );
    expect(populationIndicatorRates([]).overconfidence_effect).toBe(0);
    expect(
      analyzeBehaviorBiases({ facts: [], populationRates: rates }).every(
        (indicator) => indicator.status.kind === 'calibrating',
      ),
    ).toBe(true);
  });
});
