// Análisis de distractores en los bordes de 5% y 100 exposiciones (7.8)
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { analyzeOption, analyzeQuestionDistractors, tallyOptions } from './distractors';

const thresholds = DEFAULT_THRESHOLDS.sampling;

describe('distractores no funcionales', () => {
  it('menos de 5% con 100 exposiciones es no funcional, 5% exacto no', () => {
    expect(analyzeOption('d', false, { exposures: 100, choices: 4 }, thresholds).status).toEqual({
      kind: 'non_functional',
    });
    expect(analyzeOption('d', false, { exposures: 100, choices: 5 }, thresholds).status).toEqual({
      kind: 'functional',
    });
    expect(analyzeOption('d', false, { exposures: 100, choices: 0 }, thresholds).status).toEqual({
      kind: 'non_functional',
    });
  });

  it('con 99 exposiciones sigue calibrando y dice cuántas faltan', () => {
    expect(analyzeOption('d', false, { exposures: 99, choices: 0 }, thresholds).status).toEqual({
      kind: 'calibrating',
      exposuresNeeded: 1,
    });
    expect(analyzeOption('d', false, { exposures: 0, choices: 0 }, thresholds).status).toEqual({
      kind: 'calibrating',
      exposuresNeeded: 100,
    });
  });

  it('la correcta no se marca y la atracción trae su intervalo', () => {
    const correct = analyzeOption('c', true, { exposures: 200, choices: 2 }, thresholds);
    expect(correct.status).toEqual({ kind: 'correct_option' });
    expect(correct.attraction).toBeCloseTo(0.01, 12);
    expect(correct.lower).toBeLessThan(0.01);
    expect(correct.upper).toBeGreaterThan(0.01);
    expect(() => analyzeOption('x', false, { exposures: 1, choices: 2 }, thresholds)).toThrow(
      RangeError,
    );
  });

  it('cuenta exposiciones y elecciones desde los sets mostrados', () => {
    const tallies = tallyOptions({
      shownSets: [
        ['a', 'b', 'c', 'd'],
        ['a', 'b', 'e', 'f'],
      ],
      chosen: ['b', 'a'],
    });
    expect(tallies).toEqual({
      a: { exposures: 2, choices: 1 },
      b: { exposures: 2, choices: 1 },
      c: { exposures: 1, choices: 0 },
      d: { exposures: 1, choices: 0 },
      e: { exposures: 1, choices: 0 },
      f: { exposures: 1, choices: 0 },
    });
  });

  it('resume la pregunta y pide revisión si hay alguno no funcional', () => {
    const report = analyzeQuestionDistractors(
      [
        { id: 'c', isCorrect: true },
        { id: 'd1', isCorrect: false },
        { id: 'd2', isCorrect: false },
        { id: 'd3', isCorrect: false },
      ],
      {
        c: { exposures: 150, choices: 90 },
        d1: { exposures: 150, choices: 40 },
        d2: { exposures: 150, choices: 3 },
      },
      thresholds,
    );
    expect(report).toMatchObject({
      functional: 1,
      nonFunctional: 1,
      calibrating: 1,
      needsReview: true,
    });
  });
});
