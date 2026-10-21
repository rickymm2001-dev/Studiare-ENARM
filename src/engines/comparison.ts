/**
 * Comparación con otros alumnos (B14, 5 del plan de B14 y PC 4.2).
 *
 * Qué hace. Es el único motor de la comparación y lo usan dos lados con las mismas definiciones y la
 * misma ventana. La noche arma con él los cortes de cada grupo (src/engines/calibration/comparisonCells.ts)
 * y el navegador calcula con él las métricas del propio alumno y su percentil contra esos cortes. Tus
 * datos no viajan para compararte.
 * Entradas. Hechos de lo que ya pasó, una respuesta o un repaso por hecho (o varios iguales con count,
 * como los repasos de un día que la noche recibe contados), el día de estudio del corte y la ventana.
 * Salidas. Las tres métricas de un alumno por rama (studentMetrics), los 19 cortes de un grupo
 * (distributionCuts) y el percentil de un valor contra esos cortes (percentileFromCuts).
 * Método
 *   - Ventana. Los windowDays días de estudio completos anteriores al corte. El día del corte no entra,
 *     lo que haces hoy entra mañana
 *   - Aciertos en simuladores. Respuestas de sesiones de práctica y de examen, por rama y en total (*).
 *     Redondeado a 0.01. Entra la rama con minBranchAnswers respuestas o más
 *   - Repasos hechos. Los repasos de la ventana. Entra quien tuvo al menos un día con actividad
 *   - Constancia. Días de la ventana con al menos un repaso o una respuesta, de 0 a windowDays
 *   - Cortes. Los percentiles 5, 10, ... 95 con interpolación lineal (tipo 7), redondeados según la
 *     métrica. Nunca el mínimo ni el máximo
 *   - Percentil. Cuántos cortes quedan por debajo del valor. Con cortes iguales al valor, el rango medio
 *     de los empatados. Se entrega de 5 en 5. Abajo del primer corte es menos del 5 y arriba del último
 *     es más del 95
 * Umbrales. Los de model_settings.thresholds (minGroupSize de 30, comparisonWindowDays de 30 y
 * minBranchAnswers de 20), que decide quien llama. Nada aquí es un pronóstico del resultado del ENARM.
 */
import type { ComparisonMetric } from '@/data/model/contracts';
import { daysBetween } from './studyDay';

export const COMPARISON_METRICS: readonly ComparisonMetric[] = [
  'sim_accuracy',
  'reviews',
  'consistency',
];

/** La rama que significa el total de todas */
export const TOTAL_BRANCH = '*';

/** Percentiles de los cortes que se publican, de 5 en 5 y sin el mínimo ni el máximo */
export const CUT_PERCENTILES: readonly number[] = Array.from({ length: 19 }, (_, i) => (i + 1) * 5);

/** Repasos que cuenta un solo día. Lo que pasa de ahí se recorta, porque no es posible (J) */
export const MAX_REVIEWS_PER_DAY = 2000;

export interface ComparisonFact {
  /** Día de estudio AAAA-MM-DD */
  day: string;
  kind: 'answer' | 'review';
  /** Rama de la pregunta, en las respuestas */
  branch?: string;
  correct?: boolean;
  /** Solo cuentan para el acierto las sesiones de práctica y de examen */
  sessionKind?: 'practice' | 'exam' | 'challenge' | null;
  /** Cuántos hechos iguales representa. 1 si falta */
  count?: number;
}

export interface MetricsOptions {
  /** Día de estudio del corte. Es el primer día que no entra a la ventana */
  asOfDay: string;
  windowDays: number;
  minBranchAnswers: number;
}

export type StudentMetrics = Record<ComparisonMetric, Record<string, number | null>>;

const weightOf = (fact: ComparisonFact): number => {
  const count = fact.count ?? 1;
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Decimales con que se redondea cada métrica, en el alumno y en los cortes */
const DECIMALS: Record<ComparisonMetric, number> = {
  sim_accuracy: 2,
  reviews: 0,
  consistency: 1,
};

export function studentMetrics(
  facts: readonly ComparisonFact[],
  options: MetricsOptions,
): StudentMetrics {
  const accuracy = new Map<string, { correct: number; total: number }>();
  const activeDays = new Set<string>();
  const reviewsByDay = new Map<string, number>();
  for (const fact of facts) {
    const offset = daysBetween(fact.day, options.asOfDay);
    if (offset < 1 || offset > options.windowDays) continue;
    const weight = weightOf(fact);
    if (weight === 0) continue;
    activeDays.add(fact.day);
    if (fact.kind === 'review') {
      reviewsByDay.set(fact.day, (reviewsByDay.get(fact.day) ?? 0) + weight);
      continue;
    }
    if (fact.sessionKind !== 'practice' && fact.sessionKind !== 'exam') continue;
    if (fact.correct === undefined) continue;
    const keys = fact.branch === undefined ? [TOTAL_BRANCH] : [fact.branch, TOTAL_BRANCH];
    for (const key of keys) {
      const entry = accuracy.get(key) ?? { correct: 0, total: 0 };
      entry.total += weight;
      if (fact.correct) entry.correct += weight;
      accuracy.set(key, entry);
    }
  }

  const simAccuracy: Record<string, number | null> = { [TOTAL_BRANCH]: null };
  for (const [branch, entry] of accuracy) {
    simAccuracy[branch] =
      entry.total >= options.minBranchAnswers
        ? round(entry.correct / entry.total, DECIMALS.sim_accuracy)
        : null;
  }

  // Quien no tuvo ni un día con actividad en la ventana no entra a estas dos métricas
  const active = activeDays.size > 0;
  let reviews = 0;
  for (const count of reviewsByDay.values()) reviews += Math.min(count, MAX_REVIEWS_PER_DAY);
  return {
    sim_accuracy: simAccuracy,
    reviews: { [TOTAL_BRANCH]: active ? reviews : null },
    consistency: {
      [TOTAL_BRANCH]: active ? Math.min(activeDays.size, options.windowDays) : null,
    },
  };
}

/** Los 19 cortes, del percentil 5 al 95, de los valores de un grupo. Redondeados según la métrica */
export function distributionCuts(values: readonly number[], metric: ComparisonMetric): number[] {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) throw new RangeError('Hacen falta valores para armar los cortes');
  const last = sorted.length - 1;
  return CUT_PERCENTILES.map((percentile) => {
    const position = (last * percentile) / 100;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const low = sorted[lower] as number;
    const high = sorted[upper] as number;
    return round(low + (high - low) * (position - lower), DECIMALS[metric]);
  });
}

export interface PercentileResult {
  /** El percentil de 5 en 5. 0 abajo del primer corte y 100 arriba del último */
  band: number;
  below5: boolean;
  above95: boolean;
}

/** El percentil de un valor contra los 19 cortes de un grupo */
export function percentileFromCuts(value: number, cuts: readonly number[]): PercentileResult {
  if (cuts.length !== CUT_PERCENTILES.length) {
    throw new RangeError(`Se esperaban ${CUT_PERCENTILES.length} cortes y llegaron ${cuts.length}`);
  }
  if (!Number.isFinite(value)) throw new RangeError('El valor para el percentil no es un número');
  const first = cuts[0] as number;
  const last = cuts[cuts.length - 1] as number;
  if (value < first) return { band: 0, below5: true, above95: false };
  if (value > last) return { band: 100, below5: false, above95: true };
  const below = cuts.filter((cut) => cut < value).length;
  const equal = cuts.filter((cut) => cut === value).length;
  // Cortes iguales al valor, el rango medio de los empatados. Entre dos cortes, el de abajo
  const rank = equal > 0 ? below + (equal + 1) / 2 : below;
  return { band: Math.round(rank) * 5, below5: false, above95: false };
}
