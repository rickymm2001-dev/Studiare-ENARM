// Funciones estadísticas contra valores de referencia (14.1, PLAN Fase B bloque 1).
// Fuentes de los valores
// - Normal. statistics.NormalDist de la biblioteca estándar de Python
// - Wilson. Newcombe RG (1998), Stat Med 17:857-872, tabla I, método 3, a 4 decimales, y una
//   implementación independiente en Python a 6 decimales
// - Beta. Para parámetros enteros, la identidad exacta I_x(a, b) = P(Binomial(a+b−1, x) ≥ a)
//   calculada con fracciones exactas en Python. Para Beta(0.5, 0.5), la fórmula cerrada del
//   arcoseno, I_x = (2/π)·arcsen(√x)
// - Kappa. Ejemplo de 50 pares con po = 0.7 y pe = 0.5 calculado a mano, y una tabla de 3
//   categorías calculada con una implementación directa en Python
import { describe, expect, it } from 'vitest';
import { createRng } from '@/engines/random';
import { betaCdf, betaInterval, betaQuantile, logGamma } from './beta';
import { pooledMean, responsesNeededForWidth, shrinkGroup, shrinkTally } from './betaBinomial';
import { cohenKappa, kappaByCategory } from './kappa';
import { normalCdf, normalQuantile, Z_95, zForConfidence } from './normal';
import { wilsonInterval } from './wilson';

describe('normal', () => {
  it('cuantiles contra NormalDist de Python', () => {
    const reference: [number, number][] = [
      [0.975, 1.9599639845400536],
      [0.95, 1.6448536269514715],
      [0.5, 0],
      [0.001, -3.090232306167813],
      [0.999, 3.090232306167813],
      [0.01, -2.3263478740408408],
      [0.025, -1.9599639845400538],
    ];
    for (const [p, z] of reference) expect(normalQuantile(p), String(p)).toBeCloseTo(z, 8);
  });

  it('acumulada contra NormalDist de Python', () => {
    const reference: [number, number][] = [
      [0, 0.5],
      [1, 0.8413447460685428],
      [Z_95, 0.975],
      [-2.5, 0.006209665325776159],
      [3, 0.9986501019683699],
    ];
    for (const [z, p] of reference) expect(normalCdf(z), String(z)).toBeCloseTo(p, 6);
  });

  it('z por nivel de confianza y rechazo fuera de rango', () => {
    expect(zForConfidence(0.95)).toBe(Z_95);
    expect(zForConfidence(0.9)).toBeCloseTo(1.6448536269514715, 8);
    expect(() => normalQuantile(0)).toThrow(RangeError);
    expect(() => normalQuantile(1)).toThrow(RangeError);
  });
});

describe('Wilson', () => {
  it('coincide con Newcombe (1998) a 4 decimales', () => {
    const reference: [number, number, number, number][] = [
      [81, 263, 0.2553, 0.3662],
      [15, 148, 0.0624, 0.1605],
      [0, 20, 0, 0.1611],
      [1, 29, 0.0061, 0.1718],
    ];
    for (const [k, n, lower, upper] of reference) {
      const interval = wilsonInterval(k, n);
      expect(interval.lower, `${k}/${n}`).toBeCloseTo(lower, 4);
      expect(interval.upper, `${k}/${n}`).toBeCloseTo(upper, 4);
      expect(interval.estimate).toBeCloseTo(k / n, 12);
    }
  });

  it('coincide con la implementación en Python a 6 decimales, incluso en los bordes', () => {
    const reference: [number, number, number, number][] = [
      [81, 263, 0.255289, 0.36621],
      [29, 29, 0.88303, 1],
      [5, 10, 0.236593, 0.763407],
    ];
    for (const [k, n, lower, upper] of reference) {
      const interval = wilsonInterval(k, n);
      expect(interval.lower).toBeCloseTo(lower, 6);
      expect(interval.upper).toBeCloseTo(upper, 6);
    }
  });

  it('sin datos da el intervalo completo y rechaza entradas inválidas', () => {
    expect(wilsonInterval(0, 0)).toEqual({ estimate: 0, lower: 0, upper: 1 });
    expect(() => wilsonInterval(3, 2)).toThrow(RangeError);
    expect(() => wilsonInterval(-1, 2)).toThrow(RangeError);
    expect(() => wilsonInterval(1.5, 2)).toThrow(RangeError);
  });

  it('más confianza da un intervalo más ancho', () => {
    const narrow = wilsonInterval(20, 50, 0.8);
    const wide = wilsonInterval(20, 50, 0.99);
    expect(wide.upper - wide.lower).toBeGreaterThan(narrow.upper - narrow.lower);
  });
});

describe('beta', () => {
  it('logGamma da factoriales y Γ(1/2) = √π', () => {
    expect(Math.exp(logGamma(5))).toBeCloseTo(24, 9);
    expect(Math.exp(logGamma(10))).toBeCloseTo(362880, 4);
    expect(Math.exp(logGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 10);
    expect(Math.exp(logGamma(0.25))).toBeCloseTo(3.625609908221908, 9);
  });

  it('acumulada contra la identidad binomial exacta', () => {
    const reference: [number, number, number, number][] = [
      [0.3, 2, 3, 0.3483],
      [0.5, 2, 3, 0.6875],
      [0.1, 1, 1, 0.1],
      [0.7, 5, 2, 0.420175],
      [0.25, 10, 30, 0.5243691817384027],
      [0.9, 30, 4, 0.5769436641256926],
      [0.42, 13, 17, 0.4482554718006042],
    ];
    for (const [x, a, b, p] of reference)
      expect(betaCdf(x, a, b), `${x} ${a} ${b}`).toBeCloseTo(p, 10);
  });

  it('acumulada y cuantiles de Beta(0.5, 0.5) contra la fórmula del arcoseno', () => {
    expect(betaCdf(0.1, 0.5, 0.5)).toBeCloseTo(0.20483276469913345, 10);
    expect(betaCdf(0.5, 0.5, 0.5)).toBeCloseTo(0.5, 10);
    expect(betaCdf(0.8, 0.5, 0.5)).toBeCloseTo(0.7048327646991335, 10);
    expect(betaQuantile(0.025, 0.5, 0.5)).toBeCloseTo(0.001541333133436012, 9);
    expect(betaQuantile(0.975, 0.5, 0.5)).toBeCloseTo(0.9984586668665639, 9);
  });

  it('cuantiles contra la búsqueda sobre la acumulada exacta', () => {
    const reference: [number, number, number, number][] = [
      [0.025, 2, 3, 0.06758598648854294],
      [0.975, 2, 3, 0.8058795503167564],
      [0.5, 5, 2, 0.7355500167043401],
      [0.025, 13, 17, 0.2644553037067049],
      [0.975, 13, 17, 0.6106372086030936],
    ];
    for (const [p, a, b, x] of reference)
      expect(betaQuantile(p, a, b), `${p} ${a} ${b}`).toBeCloseTo(x, 9);
  });

  it('fórmulas cerradas de Beta(a, 1) y Beta(1, b)', () => {
    expect(betaQuantile(0.3, 4, 1)).toBeCloseTo(0.3 ** (1 / 4), 9);
    expect(betaQuantile(0.3, 1, 4)).toBeCloseTo(1 - 0.7 ** (1 / 4), 9);
  });

  it('bordes y entradas inválidas', () => {
    expect(betaCdf(0, 2, 2)).toBe(0);
    expect(betaCdf(1, 2, 2)).toBe(1);
    expect(betaQuantile(0, 2, 2)).toBe(0);
    expect(betaQuantile(1, 2, 2)).toBe(1);
    expect(() => betaCdf(0.5, 0, 1)).toThrow(RangeError);
    expect(() => betaQuantile(1.5, 1, 1)).toThrow(RangeError);
    expect(betaInterval(13, 7)).toMatchObject({ mean: 0.65 });
  });
});

describe('beta-binomial con empirical Bayes (7.3)', () => {
  const options = { priorStrength: 10, maxIntervalWidth: 0.25 };

  it('el posterior es Beta(m·κ + k, (1−m)·κ + n − k)', () => {
    // m = 0.6, κ = 10, 7 de 10. Posterior Beta(13, 7)
    const estimate = shrinkTally({ successes: 7, trials: 10 }, 0.6, options);
    expect(estimate.mean).toBeCloseTo(0.65, 12);
    expect(estimate.lower).toBeCloseTo(0.434498431153849, 9);
    expect(estimate.upper).toBeCloseTo(0.8371141278449004, 9);
    expect(estimate.raw).toBe(0.7);
    expect(estimate.reliable).toBe(false);
  });

  it('sin respuestas queda en la media del grupo y calibrando', () => {
    const estimate = shrinkTally({ successes: 0, trials: 0 }, 0.5, options);
    expect(estimate.raw).toBeNull();
    expect(estimate.mean).toBeCloseTo(0.5, 12);
    expect(estimate.width).toBeCloseTo(0.5759829864422639, 8);
    expect(estimate.reliable).toBe(false);
    // Con la aproximación normal faltan 51 respuestas. Beta(31, 31) ya mide 0.246
    expect(estimate.responsesNeeded).toBe(51);
    const after = shrinkTally({ successes: 26, trials: 52 }, 0.5, options);
    expect(after.width).toBeCloseTo(0.24606405147374044, 8);
    expect(after.reliable).toBe(true);
    expect(after.responsesNeeded).toBe(0);
  });

  it('con muchos datos la estimación se acerca a la proporción propia', () => {
    const estimate = shrinkTally({ successes: 400, trials: 500 }, 0.5, options);
    expect(estimate.mean).toBeCloseTo(405 / 510, 12);
    expect(estimate.reliable).toBe(true);
  });

  it('encoge cada tema hacia la media del grupo', () => {
    const result = shrinkGroup(
      {
        a: { successes: 9, trials: 10 },
        b: { successes: 1, trials: 10 },
        c: { successes: 50, trials: 100 },
      },
      options,
    );
    expect(
      pooledMean([
        { successes: 9, trials: 10 },
        { successes: 1, trials: 10 },
        { successes: 50, trials: 100 },
      ]),
    ).toBeCloseTo(0.5, 12);
    expect(result.a.mean).toBeLessThan(0.9);
    expect(result.b.mean).toBeGreaterThan(0.1);
    expect(result.a.mean).toBeCloseTo(14 / 20, 12);
    expect(pooledMean([])).toBe(0.5);
  });

  it('con datos simulados, el encogimiento tiene menor error absoluto medio que la proporción cruda', () => {
    const rng = createRng('encogimiento-7.3');
    let rawError = 0;
    let shrunkError = 0;
    let comparisons = 0;
    for (let run = 0; run < 30; run += 1) {
      const truths = Array.from({ length: 40 }, () => rng.beta(12, 6));
      const tallies = Object.fromEntries(
        truths.map((truth, index) => {
          const trials = rng.int(3, 15);
          let successes = 0;
          for (let trial = 0; trial < trials; trial += 1) if (rng.chance(truth)) successes += 1;
          return [`t${index}`, { successes, trials }];
        }),
      );
      const shrunk = shrinkGroup(tallies, options);
      truths.forEach((truth, index) => {
        const key = `t${index}`;
        const tally = tallies[key];
        const estimate = shrunk[key];
        if (!tally || !estimate) return;
        rawError += Math.abs(tally.successes / tally.trials - truth);
        shrunkError += Math.abs(estimate.mean - truth);
        comparisons += 1;
      });
    }
    expect(comparisons).toBe(1200);
    expect(shrunkError / comparisons).toBeLessThan(rawError / comparisons);
  });

  it('respuestas necesarias y entradas inválidas', () => {
    expect(responsesNeededForWidth(5, 5, 0.25)).toBe(51);
    expect(responsesNeededForWidth(500, 500, 0.25)).toBe(0);
    expect(() => shrinkTally({ successes: 5, trials: 4 }, 0.5, options)).toThrow(RangeError);
  });
});

describe('kappa de Cohen (7.11)', () => {
  // Ejemplo calculado a mano. 50 pares. Sí-sí 20, sí-no 5, no-sí 10, no-no 15
  const textbook = [
    ...Array.from({ length: 20 }, () => ['si', 'si'] as const),
    ...Array.from({ length: 5 }, () => ['si', 'no'] as const),
    ...Array.from({ length: 10 }, () => ['no', 'si'] as const),
    ...Array.from({ length: 15 }, () => ['no', 'no'] as const),
  ];

  it('ejemplo de 2 categorías calculado a mano', () => {
    const result = cohenKappa(textbook);
    expect(result?.observedAgreement).toBeCloseTo(0.7, 12);
    expect(result?.expectedAgreement).toBeCloseTo(0.5, 12);
    expect(result?.kappa).toBeCloseTo(0.4, 12);
    // Varianza de Fleiss, Cohen y Everitt a mano. (0.10972 + 0.10188 − 0.01) / 12.5 = 0.016128
    expect(result?.standardError).toBeCloseTo(Math.sqrt(0.016128), 10);
    expect(result?.lower).toBeCloseTo(0.4 - Z_95 * Math.sqrt(0.016128), 10);
    expect(result?.upper).toBeCloseTo(0.4 + Z_95 * Math.sqrt(0.016128), 10);
    expect(result?.n).toBe(50);
  });

  it('tabla de 3 categorías contra la implementación en Python', () => {
    const counts: [string, string, number][] = [
      ['a', 'a', 20],
      ['a', 'b', 3],
      ['a', 'c', 2],
      ['b', 'a', 4],
      ['b', 'b', 15],
      ['b', 'c', 1],
      ['c', 'a', 1],
      ['c', 'b', 2],
      ['c', 'c', 12],
    ];
    const pairs = counts.flatMap(([a, b, count]) =>
      Array.from({ length: count }, () => [a, b] as const),
    );
    const result = cohenKappa(pairs);
    expect(result?.n).toBe(60);
    expect(result?.observedAgreement).toBeCloseTo(0.7833333333333333, 12);
    expect(result?.expectedAgreement).toBeCloseTo(0.3472222222222222, 12);
    expect(result?.kappa).toBeCloseTo(0.6680851063829787, 12);
    expect(result?.standardError).toBeCloseTo(0.08180327696523297, 12);
    expect(kappaByCategory(pairs).a?.kappa).toBeCloseTo(0.6571428571428573, 12);
  });

  it('acuerdo perfecto da 1 y sin pares o sin variación no hay kappa', () => {
    const perfect = [
      ['x', 'x'],
      ['y', 'y'],
      ['z', 'z'],
      ['x', 'x'],
    ] as const;
    expect(cohenKappa(perfect)?.kappa).toBeCloseTo(1, 12);
    expect(cohenKappa([])).toBeNull();
    expect(
      cohenKappa([
        ['x', 'x'],
        ['x', 'x'],
      ]),
    ).toBeNull();
  });
});
