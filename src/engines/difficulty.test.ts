import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import {
  calibrationStatus,
  DEFAULT_ELO,
  difficultyBand,
  kFactor,
  physicianToLogit,
  pickAdaptive,
  probabilityCorrect,
  updateElo,
} from './difficulty';
import { createRng } from './random';
import { estimateRasch, type RaschResponse } from './rasch';
import { pearson } from './stats/correlation';

describe('correlación de Pearson', () => {
  it('valores conocidos', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
    // Calculado a mano. Medias 3 y 4, suma de productos 6, sumas de cuadrados 10 y 6
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(6 / Math.sqrt(10 * 6), 12);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNaN();
    expect(() => pearson([1], [1])).toThrow(RangeError);
  });
});

describe('Elo (7.7)', () => {
  it('convierte la escala del médico a logit', () => {
    expect([1, 2, 3, 4, 5].map(physicianToLogit)).toEqual([-2, -1, 0, 1, 2]);
    expect(() => physicianToLogit(6)).toThrow(RangeError);
    expect(() => physicianToLogit(2.5)).toThrow(RangeError);
  });

  it('un acierto sube la habilidad y baja la dificultad, y K baja con las respuestas', () => {
    const result = updateElo({
      student: { rating: 0, responses: 0 },
      item: { rating: 0, responses: 0 },
      correct: true,
    });
    expect(result.expected).toBeCloseTo(0.5, 12);
    expect(result.student.rating).toBeCloseTo(DEFAULT_ELO.k0 * 0.5, 12);
    expect(result.item.rating).toBeCloseTo(-DEFAULT_ELO.k0 * 0.5, 12);
    expect(result.student.responses).toBe(1);
    expect(kFactor(0)).toBe(DEFAULT_ELO.k0);
    expect(kFactor(100)).toBeLessThan(kFactor(10));
    expect(kFactor(1e9)).toBe(DEFAULT_ELO.kMin);
    expect(probabilityCorrect(1, 1)).toBe(0.5);
  });

  it('estados de calibración por número de respuestas', () => {
    const thresholds = DEFAULT_THRESHOLDS.difficulty;
    expect(calibrationStatus(0, thresholds)).toEqual({
      state: 'physician_estimate',
      responsesToNext: 30,
    });
    expect(calibrationStatus(29, thresholds)).toEqual({
      state: 'physician_estimate',
      responsesToNext: 1,
    });
    expect(calibrationStatus(30, thresholds)).toEqual({
      state: 'provisional',
      responsesToNext: 70,
    });
    expect(calibrationStatus(100, thresholds)).toEqual({ state: 'calibrated', responsesToNext: 0 });
  });

  it('bandas de dificultad', () => {
    expect([-1.5, -0.5, 0, 1, 1.2].map(difficultyBand)).toEqual([
      'easy',
      'medium',
      'hard',
      'hard',
      'very_hard',
    ]);
  });

  it('el modo adaptativo elige preguntas cercanas a la habilidad', () => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      id: `i${index}`,
      difficulty: -2 + index * 0.1,
    }));
    const picked = pickAdaptive({ items, ability: 0.5, count: 5, rng: createRng('adaptativo') });
    expect(picked).toHaveLength(5);
    for (const item of picked)
      expect(Math.abs(item.difficulty - 0.5)).toBeLessThanOrEqual(0.75 + 1e-9);
  });

  it('con datos simulados la dificultad de Elo sigue a la verdadera', () => {
    const rng = createRng('elo-humo');
    const abilities = Array.from({ length: 200 }, () => rng.normal(0, 1));
    const truth = Array.from({ length: 40 }, () => rng.normal(0, 1));
    const students = abilities.map(() => ({ rating: 0, responses: 0 }));
    const items = truth.map(() => ({ rating: 0, responses: 0 }));
    for (let round = 0; round < 40; round += 1) {
      for (let s = 0; s < abilities.length; s += 1) {
        const i = rng.int(0, truth.length - 1);
        const correct = rng.chance(probabilityCorrect(abilities[s] as number, truth[i] as number));
        const result = updateElo({
          student: students[s] as (typeof students)[number],
          item: items[i] as (typeof items)[number],
          correct,
        });
        students[s] = result.student;
        items[i] = result.item;
      }
    }
    expect(
      pearson(
        truth,
        items.map((item) => item.rating),
      ),
    ).toBeGreaterThan(0.8);
  });
});

/** Datos simulados de Rasch con parámetros conocidos */
function simulate(seed: string, persons: number, itemCount: number, coverage = 1) {
  const rng = createRng(seed);
  const abilities = Array.from({ length: persons }, () => rng.normal(0, 1));
  const difficulties = Array.from({ length: itemCount }, () => rng.normal(0, 1));
  const responses: RaschResponse[] = [];
  abilities.forEach((ability, p) => {
    difficulties.forEach((difficulty, i) => {
      if (!rng.chance(coverage)) return;
      responses.push({
        person: `p${p}`,
        item: `i${i}`,
        correct: rng.chance(probabilityCorrect(ability, difficulty)),
      });
    });
  });
  return { abilities, difficulties, responses };
}

describe('Rasch por máxima verosimilitud conjunta (D-025)', () => {
  it('recupera las dificultades verdaderas con datos completos', () => {
    const { difficulties, responses } = simulate('rasch-completo', 300, 60);
    const result = estimateRasch(responses);
    expect(result.converged).toBe(true);
    const estimated = difficulties.map((_, i) => result.items[`i${i}`]?.difficulty ?? Number.NaN);
    expect(pearson(difficulties, estimated)).toBeGreaterThan(0.95);
    const mean = estimated.reduce((sum, value) => sum + value, 0) / estimated.length;
    expect(Math.abs(mean)).toBeLessThan(1e-6);
    expect(result.items.i0?.standardError).toBeGreaterThan(0);
  });

  it('funciona con datos faltantes', () => {
    const { difficulties, responses } = simulate('rasch-faltantes', 300, 60, 0.4);
    const result = estimateRasch(responses);
    const estimated = difficulties.map((_, i) => result.items[`i${i}`]?.difficulty ?? 0);
    expect(pearson(difficulties, estimated)).toBeGreaterThan(0.9);
  });

  it('excluye alumnos y preguntas con puntaje extremo', () => {
    const { responses } = simulate('rasch-extremos', 50, 10);
    const extra: RaschResponse[] = [
      ...Array.from({ length: 10 }, (_, i) => ({
        person: 'todo-bien',
        item: `i${i}`,
        correct: true,
      })),
      ...Array.from({ length: 50 }, (_, p) => ({
        person: `p${p}`,
        item: 'nadie-acierta',
        correct: false,
      })),
    ];
    const result = estimateRasch([...responses, ...extra]);
    expect(result.excludedPersons).toContain('todo-bien');
    expect(result.excludedItems).toContain('nadie-acierta');
    expect(result.persons['todo-bien']).toBeUndefined();
  });

  it('la corrección de Wright multiplica por (L − 1) / L', () => {
    const { responses } = simulate('rasch-wright', 100, 20);
    const corrected = estimateRasch(responses);
    const raw = estimateRasch(responses, { wrightCorrection: false });
    expect(corrected.items.i3?.difficulty).toBeCloseTo(
      (raw.items.i3?.difficulty ?? 0) * (19 / 20),
      9,
    );
  });

  it('sin respuestas devuelve un resultado vacío', () => {
    expect(estimateRasch([])).toMatchObject({ items: {}, persons: {}, converged: false });
  });
});
