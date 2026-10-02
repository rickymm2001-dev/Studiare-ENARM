/**
 * Modelo beta-binomial con encogimiento hacia la media del grupo (empirical Bayes).
 *
 * Qué hace. Estima la proporción de aciertos de cada elemento (un tema o una categoría de
 * estructura) encogiéndola hacia la media de su grupo (su rama o el total). Con pocos datos la
 * estimación se queda cerca de la media del grupo, y con muchos se acerca a la proporción propia.
 * Entradas. Por elemento, aciertos y respuestas. La media del grupo sale de los propios datos
 * (aciertos totales entre respuestas totales). La fuerza del prior y el ancho máximo del intervalo.
 * Salidas. Por elemento, media posterior, intervalo creíble de 95%, su ancho, si ya se puede
 * mostrar y cuántas respuestas faltan aproximadamente para poder mostrarla.
 * Método. Prior Beta(m·κ, (1−m)·κ), con m la media del grupo y κ la fuerza del prior. Posterior
 * Beta(m·κ + k, (1−m)·κ + n − k). Intervalo de colas iguales con los cuantiles de la beta.
 * Umbrales. κ = 10 respuestas y ancho máximo de 0.25 (7.3, J, configurables).
 */
import { betaInterval } from './beta';
import { zForConfidence } from './normal';

export interface Tally {
  successes: number;
  trials: number;
}

export interface ShrunkEstimate {
  /** Proporción cruda k/n, o null si no hay respuestas */
  raw: number | null;
  /** Media posterior, ya encogida hacia el grupo */
  mean: number;
  lower: number;
  upper: number;
  width: number;
  /** El intervalo ya es más angosto que el máximo, así que la estimación se puede mostrar */
  reliable: boolean;
  /** Respuestas que faltan aproximadamente para que el intervalo baje del máximo. 0 si ya baja */
  responsesNeeded: number;
}

export interface ShrinkOptions {
  priorStrength: number;
  maxIntervalWidth: number;
  level?: number;
  /** Media a usar si el grupo no tiene ninguna respuesta. 0.5 por defecto */
  fallbackMean?: number;
}

/** Media del grupo con todas sus respuestas juntas */
export function pooledMean(tallies: readonly Tally[], fallback = 0.5): number {
  const successes = tallies.reduce((sum, tally) => sum + tally.successes, 0);
  const trials = tallies.reduce((sum, tally) => sum + tally.trials, 0);
  return trials === 0 ? fallback : successes / trials;
}

/**
 * Respuestas que faltan para que el intervalo mida menos que el máximo, con la aproximación
 * normal del ancho 2·z·√(p(1−p)/(α+β+1)). Es una aproximación, como pide 7.3
 */
export function responsesNeededForWidth(
  alpha: number,
  beta: number,
  maxWidth: number,
  level = 0.95,
): number {
  const p = alpha / (alpha + beta);
  const z = zForConfidence(level);
  // Con p en 0 o 1 la varianza aproximada sería 0. Se usa un piso para no prometer de más
  const variance = Math.max(p * (1 - p), 0.01);
  const totalNeeded = (4 * z * z * variance) / (maxWidth * maxWidth) - 1;
  return Math.max(0, Math.ceil(totalNeeded - (alpha + beta)));
}

export function shrinkTally(
  tally: Tally,
  groupMean: number,
  options: ShrinkOptions,
): ShrunkEstimate {
  const { successes, trials } = tally;
  if (
    !Number.isInteger(successes) ||
    !Number.isInteger(trials) ||
    successes < 0 ||
    successes > trials
  ) {
    throw new RangeError(
      `Se necesita 0 ≤ aciertos ≤ respuestas, enteros. Llegó ${successes} de ${trials}`,
    );
  }
  // La media del grupo nunca es exactamente 0 o 1, para que el prior sea una beta válida
  const mean = Math.min(Math.max(groupMean, 0.001), 0.999);
  const alpha = mean * options.priorStrength + successes;
  const beta = (1 - mean) * options.priorStrength + trials - successes;
  const level = options.level ?? 0.95;
  const interval = betaInterval(alpha, beta, level);
  const width = interval.upper - interval.lower;
  const reliable = width < options.maxIntervalWidth;
  return {
    raw: trials === 0 ? null : successes / trials,
    mean: interval.mean,
    lower: interval.lower,
    upper: interval.upper,
    width,
    reliable,
    responsesNeeded: reliable
      ? 0
      : Math.max(1, responsesNeededForWidth(alpha, beta, options.maxIntervalWidth, level)),
  };
}

/** Encoge cada elemento hacia la media de todos los del grupo */
export function shrinkGroup<K extends string>(
  tallies: Readonly<Record<K, Tally>>,
  options: ShrinkOptions,
): Record<K, ShrunkEstimate> {
  const entries = Object.entries(tallies) as [K, Tally][];
  const groupMean = pooledMean(
    entries.map(([, tally]) => tally),
    options.fallbackMean ?? 0.5,
  );
  const result = {} as Record<K, ShrunkEstimate>;
  for (const [key, tally] of entries) result[key] = shrinkTally(tally, groupMean, options);
  return result;
}
