// Propiedades del motor de comparación (B14, 5 del plan), con fast-check
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CUT_PERCENTILES,
  distributionCuts,
  percentileFromCuts,
  studentMetrics,
  type ComparisonFact,
} from './comparison';
import { addDays } from './studyDay';

const METRICS = ['sim_accuracy', 'reviews', 'consistency'] as const;
const AS_OF = '2026-10-15';

/** 19 cortes que no bajan, como los que publica la noche */
const sortedCuts = fc
  .array(fc.integer({ min: 0, max: 1000 }), { minLength: 19, maxLength: 19 })
  .map((values) => values.sort((a, b) => a - b).map((value) => value / 10));

const fact = fc.record(
  {
    day: fc.integer({ min: 0, max: 40 }).map((offset) => addDays(AS_OF, -offset)),
    kind: fc.constantFrom('answer' as const, 'review' as const),
    branch: fc.constantFrom('pediatrics', 'general_surgery', 'medical_english'),
    correct: fc.boolean(),
    sessionKind: fc.constantFrom('practice' as const, 'exam' as const, 'challenge' as const, null),
    count: fc.integer({ min: 1, max: 5 }),
  },
  { requiredKeys: ['day', 'kind'] },
) as fc.Arbitrary<ComparisonFact>;

describe('propiedades de la comparación', () => {
  it('el percentil nunca baja si el valor sube', () => {
    fc.assert(
      fc.property(
        sortedCuts,
        fc.double({ min: -10, max: 110, noNaN: true }),
        fc.double({ min: -10, max: 110, noNaN: true }),
        (cuts, a, b) => {
          const low = Math.min(a, b);
          const high = Math.max(a, b);
          expect(percentileFromCuts(low, cuts).band).toBeLessThanOrEqual(
            percentileFromCuts(high, cuts).band,
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('la banda es un múltiplo de 5 entre 0 y 100 y las marcas dicen cuándo se sale de los cortes', () => {
    fc.assert(
      fc.property(sortedCuts, fc.double({ min: -10, max: 110, noNaN: true }), (cuts, value) => {
        const result = percentileFromCuts(value, cuts);
        expect(result.band % 5).toBe(0);
        expect(result.band).toBeGreaterThanOrEqual(0);
        expect(result.band).toBeLessThanOrEqual(100);
        expect(result.below5).toBe(value < (cuts[0] as number));
        expect(result.above95).toBe(value > (cuts[18] as number));
        if (!result.below5 && !result.above95) expect(result.band).toBeGreaterThanOrEqual(5);
      }),
      { numRuns: 500 },
    );
  });

  it('los cortes son 19, no bajan y quedan dentro de los valores del grupo', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 200 }),
        fc.constantFrom(...METRICS),
        (values, metric) => {
          const cuts = distributionCuts(values, metric);
          expect(cuts).toHaveLength(CUT_PERCENTILES.length);
          for (let index = 1; index < cuts.length; index += 1) {
            expect(cuts[index]).toBeGreaterThanOrEqual(cuts[index - 1] as number);
          }
          // El redondeo puede mover un corte medio decimal, nunca fuera del rango
          expect(Math.min(...cuts)).toBeGreaterThanOrEqual(Math.min(...values) - 0.5);
          expect(Math.max(...cuts)).toBeLessThanOrEqual(Math.max(...values) + 0.5);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('un valor del grupo queda entre el percentil 0 y el 100 de sus propios cortes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 30, maxLength: 120 }),
        (values) => {
          const cuts = distributionCuts(values, 'reviews');
          for (const value of values) {
            const { band } = percentileFromCuts(value, cuts);
            expect(band).toBeGreaterThanOrEqual(0);
            expect(band).toBeLessThanOrEqual(100);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('las métricas del alumno quedan en su rango y no dependen del orden', () => {
    fc.assert(
      fc.property(fc.array(fact, { maxLength: 60 }), (facts) => {
        const options = { asOfDay: AS_OF, windowDays: 30, minBranchAnswers: 3 };
        const metrics = studentMetrics(facts, options);
        for (const value of Object.values(metrics.sim_accuracy)) {
          if (value === null) continue;
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        const days = metrics.consistency['*'];
        if (days !== null && days !== undefined) {
          expect(days).toBeGreaterThanOrEqual(1);
          expect(days).toBeLessThanOrEqual(30);
        }
        expect(studentMetrics([...facts].reverse(), options)).toEqual(metrics);
      }),
      { numRuns: 300 },
    );
  });
});
