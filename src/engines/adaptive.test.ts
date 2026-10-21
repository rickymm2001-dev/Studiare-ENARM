import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ABILITY_POINTS,
  adaptiveAvailability,
  estimateAbility,
  isMeasuredState,
  pickAdaptiveSession,
  type AbilityResponse,
  type AdaptiveItem,
} from './adaptive';
import { probabilityCorrect } from './difficulty';
import { createRng } from './random';

/** Habilidad por EAP con una rejilla fina, como referencia para la de 41 puntos */
function reference(responses: readonly AbilityResponse[]) {
  const steps = 4001;
  const range = 8;
  let sum = 0;
  let first = 0;
  let second = 0;
  for (let index = 0; index < steps; index += 1) {
    const theta = -range + (2 * range * index) / (steps - 1);
    let weight = Math.exp(-0.5 * theta * theta);
    for (const response of responses) {
      const p = probabilityCorrect(theta, response.difficulty);
      weight *= response.correct ? p : 1 - p;
    }
    sum += weight;
    first += weight * theta;
    second += weight * theta * theta;
  }
  const mean = first / sum;
  return { theta: mean, se: Math.sqrt(second / sum - mean * mean) };
}

const answers = (...pairs: [number, boolean][]): AbilityResponse[] =>
  pairs.map(([difficulty, correct]) => ({ difficulty, correct }));

describe('habilidad por estimado a posteriori', () => {
  it('sin respuestas queda en 0 con el error estándar de la previa', () => {
    const estimate = estimateAbility([]);
    expect(estimate.theta).toBeCloseTo(0, 9);
    expect(estimate.se).toBeCloseTo(1, 3);
    expect(estimate.responses).toBe(0);
    expect(ABILITY_POINTS).toBe(41);
  });

  it('una respuesta mueve la habilidad un poco, hacia donde apunta', () => {
    const right = estimateAbility(answers([0, true]));
    const wrong = estimateAbility(answers([0, false]));
    expect(right.theta).toBeGreaterThan(0.1);
    expect(right.theta).toBeLessThan(0.6);
    expect(wrong.theta).toBeCloseTo(-right.theta, 9);
    expect(right.se).toBeLessThan(1);
  });

  it('coincide con una cuadratura fina en los casos que se calculan a mano', () => {
    const cases: AbilityResponse[][] = [
      answers([0, true]),
      answers([1, true], [1, true], [0.5, false]),
      answers([-1, true], [0, true], [1, false], [2, false], [0.3, true]),
      answers(
        ...Array.from({ length: 30 }, (_, index): [number, boolean] => [
          (index % 7) - 3,
          index % 3 !== 0,
        ]),
      ),
    ];
    for (const responses of cases) {
      const got = estimateAbility(responses);
      const expected = reference(responses);
      expect(Math.abs(got.theta - expected.theta)).toBeLessThan(0.01);
      expect(Math.abs(got.se - expected.se)).toBeLessThan(0.01);
    }
  });

  it('acertar una pregunta más difícil sube más la habilidad', () => {
    const easy = estimateAbility(answers([-1, true]));
    const hard = estimateAbility(answers([1.5, true]));
    expect(hard.theta).toBeGreaterThan(easy.theta);
    // Y fallar una fácil la baja más que fallar una difícil
    expect(estimateAbility(answers([-1, false])).theta).toBeLessThan(
      estimateAbility(answers([1.5, false])).theta,
    );
  });

  it('con más respuestas el error estándar baja y el orden no importa', () => {
    const few = answers([0, true], [1, false]);
    const many = [...few, ...answers([-1, true], [0.5, true], [1.5, false], [2, false])];
    expect(estimateAbility(many).se).toBeLessThan(estimateAbility(few).se);
    expect(estimateAbility([...many].reverse())).toEqual(estimateAbility(many));
  });

  it('una dificultad que no es un número no cuenta, y todo acertado no se sale del rango', () => {
    const noisy = estimateAbility([
      ...answers([0, true]),
      { difficulty: Number.NaN, correct: false },
      { difficulty: Number.POSITIVE_INFINITY, correct: true },
    ]);
    expect(noisy).toEqual(estimateAbility(answers([0, true])));
    const perfect = estimateAbility(
      answers(...Array.from({ length: 200 }, (): [number, boolean] => [2, true])),
    );
    expect(Number.isFinite(perfect.theta)).toBe(true);
    expect(perfect.theta).toBeLessThanOrEqual(4);
    const hopeless = estimateAbility(
      answers(...Array.from({ length: 200 }, (): [number, boolean] => [-2, false])),
    );
    expect(hopeless.theta).toBeGreaterThanOrEqual(-4);
  });

  it('recupera la habilidad de alumnos simulados', () => {
    const rng = createRng('adaptive-recovery');
    const items = Array.from({ length: 40 }, () => rng.next() * 4 - 2);
    const truth: number[] = [];
    const found: { theta: number; se: number }[] = [];
    for (let student = 0; student < 400; student += 1) {
      const theta = rng.normal(0, 1);
      const responses = items.map((difficulty) => ({
        difficulty,
        correct: rng.next() < probabilityCorrect(theta, difficulty),
      }));
      truth.push(theta);
      found.push(estimateAbility(responses));
    }
    const meanTruth = truth.reduce((a, b) => a + b, 0) / truth.length;
    const meanFound = found.reduce((a, b) => a + b.theta, 0) / found.length;
    let cov = 0;
    let varTruth = 0;
    let varFound = 0;
    truth.forEach((value, index) => {
      const estimate = (found[index] as { theta: number }).theta;
      cov += (value - meanTruth) * (estimate - meanFound);
      varTruth += (value - meanTruth) ** 2;
      varFound += (estimate - meanFound) ** 2;
    });
    expect(cov / Math.sqrt(varTruth * varFound)).toBeGreaterThan(0.85);
    // Con la previa igual a la distribución real, el intervalo de dos errores estándar cubre casi siempre
    const covered = truth.filter(
      (value, index) =>
        Math.abs(value - (found[index] as { theta: number; se: number }).theta) <=
        2 * (found[index] as { se: number }).se,
    ).length;
    expect(covered / truth.length).toBeGreaterThan(0.9);
  });
});

describe('cuándo hay modo adaptativo', () => {
  it('cuenta solo las preguntas provisionales o calibradas, y 50 es el borde', () => {
    const states = (calibrated: number, others: number) => [
      ...Array.from({ length: calibrated }, (_, index) =>
        index % 2 === 0 ? ('calibrated' as const) : ('provisional' as const),
      ),
      ...Array.from({ length: others }, () => 'physician_estimate' as const),
    ];
    expect(adaptiveAvailability(states(49, 300), 50)).toEqual({
      available: false,
      calibratedInScope: 49,
      needed: 50,
    });
    expect(adaptiveAvailability(states(50, 0), 50)).toEqual({
      available: true,
      calibratedInScope: 50,
      needed: 50,
    });
    expect(adaptiveAvailability([], 50).available).toBe(false);
    expect(isMeasuredState('provisional')).toBe(true);
    expect(isMeasuredState('physician_estimate')).toBe(false);
  });
});

/** Un banco de preguntas sueltas con dificultades repartidas de -3 a 3 */
const bank = (measured: number, calibrating: number): AdaptiveItem[] => [
  ...Array.from({ length: measured }, (_, index) => ({
    id: `m${String(index).padStart(3, '0')}`,
    caseId: null,
    caseOrder: null,
    difficulty: -3 + (6 * index) / Math.max(measured - 1, 1),
    measured: true,
  })),
  ...Array.from({ length: calibrating }, (_, index) => ({
    id: `c${String(index).padStart(3, '0')}`,
    caseId: null,
    caseOrder: null,
    difficulty: -3 + (6 * index) / Math.max(calibrating - 1, 1),
    measured: false,
  })),
];

const options = (overrides: Partial<Parameters<typeof pickAdaptiveSession>[1]> = {}) => ({
  ability: 0,
  targetOffset: 0,
  exploreShare: 0.2,
  count: 10,
  seed: 'sesion',
  ...overrides,
});

describe('elegir la sesión adaptativa', () => {
  it('elige cerca del nivel y lo hace igual con la misma semilla', () => {
    const items = bank(100, 0);
    const picked = pickAdaptiveSession(items, options({ ability: 1, exploreShare: 0 }));
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((item) => item.id)).size).toBe(10);
    const gap = picked.reduce((sum, item) => sum + Math.abs(item.difficulty - 1), 0) / 10;
    const all = items.reduce((sum, item) => sum + Math.abs(item.difficulty - 1), 0) / items.length;
    expect(gap).toBeLessThan(all / 3);
    expect(pickAdaptiveSession(items, options({ ability: 1, exploreShare: 0 }))).toEqual(picked);
    // Otra semilla da otras preguntas cercanas, no siempre las mismas
    const other = pickAdaptiveSession(
      items,
      options({ ability: 1, exploreShare: 0, seed: 'otra' }),
    );
    expect(other.map((item) => item.id)).not.toEqual(picked.map((item) => item.id));
  });

  it('el desplazamiento mueve el nivel que se busca', () => {
    const items = bank(100, 0);
    const meanOf = (offset: number) => {
      const picked = pickAdaptiveSession(items, options({ exploreShare: 0, targetOffset: offset }));
      return picked.reduce((sum, item) => sum + item.difficulty, 0) / picked.length;
    };
    expect(meanOf(1)).toBeGreaterThan(meanOf(0) + 0.5);
    expect(meanOf(-1)).toBeLessThan(meanOf(0) - 0.5);
  });

  it('una parte de la sesión va a preguntas que todavía calibran', () => {
    const items = bank(60, 40);
    const picked = pickAdaptiveSession(items, options({ exploreShare: 0.2 }));
    expect(picked).toHaveLength(10);
    expect(picked.filter((item) => !item.measured)).toHaveLength(2);
    // Las que calibran también salen cerca del objetivo, por la dificultad del médico
    for (const item of picked.filter((entry) => !entry.measured)) {
      expect(Math.abs(item.difficulty)).toBeLessThan(1.5);
    }
    expect(
      pickAdaptiveSession(items, options({ exploreShare: 0 })).every((item) => item.measured),
    ).toBe(true);
    expect(
      pickAdaptiveSession(items, options({ exploreShare: 0.5, count: 20 })).filter(
        (item) => !item.measured,
      ),
    ).toHaveLength(10);
  });

  it('si un grupo se queda corto, el otro completa la sesión', () => {
    const fewMeasured = pickAdaptiveSession(bank(3, 40), options({ exploreShare: 0.2 }));
    expect(fewMeasured).toHaveLength(10);
    expect(fewMeasured.filter((item) => item.measured)).toHaveLength(3);
    const noneCalibrating = pickAdaptiveSession(bank(40, 0), options({ exploreShare: 0.2 }));
    expect(noneCalibrating).toHaveLength(10);
    expect(noneCalibrating.every((item) => item.measured)).toBe(true);
    const onlyCalibrating = pickAdaptiveSession(bank(0, 40), options({ exploreShare: 0.2 }));
    expect(onlyCalibrating).toHaveLength(10);
  });

  it('pide más de lo que hay y se lleva todo, y sin preguntas o sin cupo no elige nada', () => {
    expect(pickAdaptiveSession(bank(4, 2), options({ count: 50 }))).toHaveLength(6);
    expect(pickAdaptiveSession([], options())).toEqual([]);
    expect(pickAdaptiveSession(bank(10, 0), options({ count: 0 }))).toEqual([]);
    expect(pickAdaptiveSession(bank(10, 0), options({ count: -3 }))).toEqual([]);
  });

  it('los casos seriados entran completos y en su orden, o no entran', () => {
    const cases: AdaptiveItem[] = ['a', 'b', 'c', 'd'].flatMap((caseId, caseIndex) =>
      [3, 1, 2].map((order) => ({
        id: `${caseId}${String(order)}`,
        caseId,
        caseOrder: order,
        difficulty: caseIndex - 1.5,
        measured: true,
      })),
    );
    const singles = bank(10, 0);
    for (let seed = 0; seed < 25; seed += 1) {
      const picked = pickAdaptiveSession(
        [...cases, ...singles],
        options({ count: 8, seed: `s${String(seed)}`, exploreShare: 0 }),
      );
      expect(picked.length).toBeLessThanOrEqual(8);
      for (const caseId of ['a', 'b', 'c', 'd']) {
        const members = picked.filter((item) => item.caseId === caseId);
        if (members.length === 0) continue;
        // Entero y seguido, en el orden del caso
        expect(members.map((item) => item.caseOrder)).toEqual([1, 2, 3]);
        const start = picked.indexOf(members[0] as AdaptiveItem);
        expect(picked.slice(start, start + 3)).toEqual(members);
      }
    }
  });

  it('un caso que no cabe en el cupo se salta y no parte la sesión', () => {
    const items: AdaptiveItem[] = [
      ...[1, 2, 3].map((order) => ({
        id: `k${String(order)}`,
        caseId: 'k',
        caseOrder: order,
        difficulty: 0,
        measured: true,
      })),
      { id: 'solo', caseId: null, caseOrder: null, difficulty: 2, measured: true },
    ];
    expect(
      pickAdaptiveSession(items, options({ count: 2, exploreShare: 0 })).map((item) => item.id),
    ).toEqual(['solo']);
  });

  it('nunca repite ni se pasa del cupo, en cualquier banco', () => {
    const item = fc.record({
      difficulty: fc.double({ min: -3, max: 3, noNaN: true }),
      measured: fc.boolean(),
      caseId: fc.constantFrom(null, null, null, 'x', 'y', 'z'),
    });
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 40 }),
        fc.integer({ min: 0, max: 15 }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        (list, count, ability, exploreShare) => {
          const members: AdaptiveItem[] = list.map((entry, index) => ({
            id: `q${String(index).padStart(3, '0')}`,
            caseId: entry.caseId,
            caseOrder: entry.caseId === null ? null : index,
            difficulty: entry.difficulty,
            measured: entry.measured,
          }));
          const picked = pickAdaptiveSession(members, {
            ability,
            targetOffset: 0,
            exploreShare,
            count,
            seed: 'p',
          });
          expect(picked.length).toBeLessThanOrEqual(count);
          expect(new Set(picked.map((entry) => entry.id)).size).toBe(picked.length);
          for (const entry of picked) {
            if (entry.caseId === null) continue;
            const wanted = members.filter((other) => other.caseId === entry.caseId).length;
            expect(picked.filter((other) => other.caseId === entry.caseId)).toHaveLength(wanted);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
