/**
 * Dificultad con Elo en línea (7.7).
 *
 * Qué hace. Mantiene la habilidad de cada alumno y la dificultad de cada pregunta en la misma
 * escala logit, y las actualiza con cada respuesta. Da el estado de calibración de la pregunta,
 * su banda de dificultad y la elección adaptativa de preguntas cerca de la habilidad del alumno.
 * Entradas. La dificultad que estimó el médico (1 a 5), la habilidad y la dificultad previas con
 * sus conteos de respuestas, y si acertó.
 * Salidas. Habilidad y dificultad nuevas, estado de calibración y banda.
 * Método. Modelo de Rasch como probabilidad, p = 1 / (1 + e^−(θ−b)). Paso de Elo con factor K que
 * baja con el número de respuestas, K(n) = máx(Kmín, K0 / √(1 + n / c)). La escala del médico se
 * convierte a logit con 1 → −2, 2 → −1, 3 → 0, 4 → 1 y 5 → 2 (J).
 * Umbrales. Provisional desde 30 respuestas y calibrada desde 100 (V, Linacre). Bandas fácil
 * (< −1), media (−1 a 0), difícil (0 a 1) y muy difícil (> 1) (J).
 */
import type { Thresholds } from '@/config/thresholds';
import type { Rng } from './random';

export interface EloParameters {
  /** K inicial */
  k0: number;
  /** K mínimo */
  kMin: number;
  /** Respuestas en las que K se reduce a K0 / √2 */
  halfLife: number;
}

/** Valores por defecto (J). Se ajustan con la recuperación de parámetros de 14.2 */
export const DEFAULT_ELO: EloParameters = { k0: 0.4, kMin: 0.04, halfLife: 20 };

export function physicianToLogit(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new RangeError(`La dificultad del médico va de 1 a 5. Llegó ${level}`);
  }
  return level - 3;
}

export function probabilityCorrect(ability: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-(ability - difficulty)));
}

export function kFactor(responses: number, parameters: EloParameters = DEFAULT_ELO): number {
  return Math.max(parameters.kMin, parameters.k0 / Math.sqrt(1 + responses / parameters.halfLife));
}

export interface EloEntity {
  rating: number;
  responses: number;
}

export function updateElo(input: {
  student: EloEntity;
  item: EloEntity;
  correct: boolean;
  parameters?: EloParameters;
}): { student: EloEntity; item: EloEntity; expected: number } {
  const parameters = input.parameters ?? DEFAULT_ELO;
  const expected = probabilityCorrect(input.student.rating, input.item.rating);
  const surprise = (input.correct ? 1 : 0) - expected;
  return {
    expected,
    student: {
      rating: input.student.rating + kFactor(input.student.responses, parameters) * surprise,
      responses: input.student.responses + 1,
    },
    item: {
      rating: input.item.rating - kFactor(input.item.responses, parameters) * surprise,
      responses: input.item.responses + 1,
    },
  };
}

export type CalibrationState = 'physician_estimate' | 'provisional' | 'calibrated';

export interface CalibrationStatus {
  state: CalibrationState;
  /** Respuestas que faltan para el siguiente estado. 0 si ya está calibrada */
  responsesToNext: number;
}

export function calibrationStatus(
  responses: number,
  thresholds: Thresholds['difficulty'],
): CalibrationStatus {
  if (responses >= thresholds.calibratedResponses)
    return { state: 'calibrated', responsesToNext: 0 };
  if (responses >= thresholds.provisionalResponses) {
    return { state: 'provisional', responsesToNext: thresholds.calibratedResponses - responses };
  }
  return {
    state: 'physician_estimate',
    responsesToNext: thresholds.provisionalResponses - responses,
  };
}

export type DifficultyBand = 'easy' | 'medium' | 'hard' | 'very_hard';

export function difficultyBand(logit: number): DifficultyBand {
  if (logit < -1) return 'easy';
  if (logit < 0) return 'medium';
  if (logit <= 1) return 'hard';
  return 'very_hard';
}

/**
 * Modo adaptativo opcional (7.7). Elige preguntas cerca de la habilidad del alumno. Entre las
 * más cercanas elige al azar con semilla, para no repetir siempre las mismas
 */
export function pickAdaptive<T extends { id: string; difficulty: number }>(input: {
  items: readonly T[];
  ability: number;
  count: number;
  rng: Rng;
  /** Cuántas candidatas cercanas se consideran por cada una que se elige */
  poolFactor?: number;
}): T[] {
  const poolSize = Math.min(input.items.length, input.count * (input.poolFactor ?? 3));
  const closest = [...input.items]
    .sort(
      (a, b) =>
        Math.abs(a.difficulty - input.ability) - Math.abs(b.difficulty - input.ability) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, poolSize);
  return input.rng.shuffle(closest).slice(0, input.count);
}
