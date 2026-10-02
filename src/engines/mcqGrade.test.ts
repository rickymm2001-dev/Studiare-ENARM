import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { gradeMcq, type McqGradeInput } from './mcqGrade';

const inputArbitrary = fc.record({
  correct: fc.boolean(),
  confidence: fc.constantFrom('guessed' as const, 'unsure' as const, 'sure' as const),
  rapidGuess: fc.boolean(),
  fasterThanP25: fc.boolean(),
  changeCount: fc.integer({ min: 0, max: 20 }),
});

/** Oráculo escrito directo desde la tabla de 7.1, fila por fila */
function oracle(input: McqGradeInput): string {
  const rows: [boolean, string][] = [
    [!input.correct, 'again'],
    [input.correct && input.confidence === 'guessed', 'again'],
    [input.correct && input.rapidGuess, 'again'],
    [input.correct && input.confidence === 'unsure' && !input.rapidGuess, 'hard'],
    [
      input.correct &&
        input.confidence === 'sure' &&
        input.fasterThanP25 &&
        input.changeCount === 0,
      'easy',
    ],
    [input.correct && input.confidence === 'sure' && !input.rapidGuess, 'good'],
  ];
  const match = rows.find(([applies]) => applies);
  return match ? match[1] : 'sin fila';
}

describe('tabla de opción múltiple (7.1)', () => {
  it('es completa y coincide con la tabla en todas las combinaciones', () => {
    fc.assert(
      fc.property(inputArbitrary, (input) => {
        expect(gradeMcq(input).rating).toBe(oracle(input));
      }),
      { numRuns: 2000 },
    );
  });

  it('es determinista', () => {
    fc.assert(
      fc.property(inputArbitrary, (input) => {
        expect(gradeMcq(input)).toEqual(gradeMcq({ ...input }));
      }),
    );
  });

  it('cada fila se puede alcanzar', () => {
    const base = {
      correct: true,
      confidence: 'sure',
      rapidGuess: false,
      fasterThanP25: false,
      changeCount: 0,
    } as const;
    expect(gradeMcq({ ...base, correct: false }).rule).toBe(1);
    expect(gradeMcq({ ...base, confidence: 'guessed' }).rule).toBe(2);
    expect(gradeMcq({ ...base, rapidGuess: true }).rule).toBe(3);
    expect(gradeMcq({ ...base, confidence: 'unsure' })).toEqual({ rating: 'hard', rule: 4 });
    expect(gradeMcq({ ...base, fasterThanP25: true })).toEqual({ rating: 'easy', rule: 5 });
    expect(gradeMcq({ ...base, fasterThanP25: true, changeCount: 1 })).toEqual({
      rating: 'good',
      rule: 6,
    });
    expect(gradeMcq(base)).toEqual({ rating: 'good', rule: 6 });
  });

  it('rechaza conteos de cambios inválidos', () => {
    expect(() =>
      gradeMcq({
        correct: true,
        confidence: 'sure',
        rapidGuess: false,
        fasterThanP25: false,
        changeCount: -1,
      }),
    ).toThrow(RangeError);
  });
});
