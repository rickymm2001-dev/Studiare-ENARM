import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summarizeEnglish, type EnglishAnswer } from './englishSection';

const THRESHOLDS = { minAnswersForStats: 20, secondsPerItem: 90 };

/** n respuestas, k acertadas, cada una con los segundos que se pidan (90 por omisión) */
function answers(n: number, k: number, seconds: number | readonly number[] = 90): EnglishAnswer[] {
  return Array.from({ length: n }, (_, index) => ({
    questionId: `q${index}`,
    correct: index < k,
    msSpent:
      (typeof seconds === 'number' ? seconds : (seconds[index % seconds.length] as number)) * 1000,
  }));
}

describe('cifras de inglés del alumno', () => {
  it('con 19 respuestas calibra, dice cuántas lleva y no da ninguna cifra', () => {
    const summary = summarizeEnglish(answers(19, 15), THRESHOLDS);
    expect(summary).toEqual({
      answered: 19,
      correct: 15,
      accuracy: null,
      medianSecondsPerItem: null,
      suggestedSeconds: 90,
      calibrating: true,
      minAnswers: 20,
    });
  });

  it('con 20 respuestas ya da el porcentaje con su intervalo y la mediana', () => {
    const summary = summarizeEnglish(answers(20, 15, [60, 100, 80]), THRESHOLDS);
    expect(summary.calibrating).toBe(false);
    expect(summary.answered).toBe(20);
    expect(summary.correct).toBe(15);
    // Beta(16, 6): media 16/22, un intervalo que contiene a la media y no se sale de 0 y 1
    expect(summary.accuracy?.mean).toBeCloseTo(16 / 22, 10);
    expect(summary.accuracy?.low).toBeGreaterThan(0.5);
    expect(summary.accuracy?.low).toBeLessThan(summary.accuracy?.mean ?? 0);
    expect(summary.accuracy?.high).toBeGreaterThan(summary.accuracy?.mean ?? 1);
    expect(summary.accuracy?.high).toBeLessThan(0.95);
    // Veinte respuestas de 60, 100 y 80 segundos, con 7 de 60, 7 de 100 y 6 de 80
    expect(summary.medianSecondsPerItem).toBe(80);
    expect(summary.suggestedSeconds).toBe(90);
  });

  it('el umbral es editable y manda sobre el piso de 20', () => {
    expect(
      summarizeEnglish(answers(9, 5), { minAnswersForStats: 10, secondsPerItem: 77 }).calibrating,
    ).toBe(true);
    const ready = summarizeEnglish(answers(10, 5), { minAnswersForStats: 10, secondsPerItem: 77 });
    expect(ready.calibrating).toBe(false);
    expect(ready.suggestedSeconds).toBe(77);
    expect(ready.minAnswers).toBe(10);
  });

  it('sin respuestas calibra aunque el umbral fuera cero', () => {
    const summary = summarizeEnglish([], { minAnswersForStats: 0, secondsPerItem: 90 });
    expect(summary).toMatchObject({
      answered: 0,
      correct: 0,
      accuracy: null,
      medianSecondsPerItem: null,
      calibrating: true,
    });
  });

  it('la mediana de una cantidad par promedia las dos de en medio y no se deja llevar por un tiempo enorme', () => {
    const base = answers(20, 10, 60);
    const withOutlier = base.map((answer, index) =>
      index === 0 ? { ...answer, msSpent: 3_600_000 } : answer,
    );
    expect(summarizeEnglish(withOutlier, THRESHOLDS).medianSecondsPerItem).toBe(60);
    const even = summarizeEnglish(
      Array.from({ length: 20 }, (_, i) => ({
        questionId: `q${i}`,
        correct: true,
        msSpent: (i < 10 ? 50 : 71) * 1000,
      })),
      THRESHOLDS,
    );
    // Las dos de en medio son 50 y 71, que promedian 60.5 y se redondea
    expect(even.medianSecondsPerItem).toBe(61);
  });

  it('un tiempo que no es número o es negativo no rompe la cifra', () => {
    const odd: EnglishAnswer[] = [
      ...answers(18, 9, 60),
      { questionId: 'a', correct: true, msSpent: Number.NaN },
      { questionId: 'b', correct: false, msSpent: -5000 },
    ];
    const summary = summarizeEnglish(odd, THRESHOLDS);
    expect(summary.calibrating).toBe(false);
    expect(summary.medianSecondsPerItem).toBe(60);
  });

  it('propiedad. El intervalo contiene a la media, queda entre 0 y 1 y se angosta con más respuestas', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 400 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (n, rate) => {
          const k = Math.round(n * rate);
          const summary = summarizeEnglish(answers(n, k), THRESHOLDS);
          const accuracy = summary.accuracy;
          expect(accuracy).not.toBeNull();
          if (!accuracy) return;
          expect(accuracy.low).toBeGreaterThanOrEqual(0);
          expect(accuracy.high).toBeLessThanOrEqual(1);
          expect(accuracy.low).toBeLessThanOrEqual(accuracy.mean);
          expect(accuracy.mean).toBeLessThanOrEqual(accuracy.high);
          // La media encogida queda cerca de lo observado
          expect(Math.abs(accuracy.mean - k / n)).toBeLessThan(1 / (n + 2) + 1e-9);
        },
      ),
    );
    const narrow = summarizeEnglish(answers(400, 300), THRESHOLDS).accuracy;
    const wide = summarizeEnglish(answers(20, 15), THRESHOLDS).accuracy;
    expect((narrow?.high ?? 0) - (narrow?.low ?? 0)).toBeLessThan(
      (wide?.high ?? 0) - (wide?.low ?? 0),
    );
  });
});
