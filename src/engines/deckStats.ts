/**
 * Estadísticas de un mazo (V4-B3, lo que Ricardo pidió de los complementos de estadísticas de Anki).
 *
 * Qué hace. Cuenta cuántas tarjetas tiene un mazo por estado, cuántas ya tocan o están atrasadas,
 * reparte las que ya se repasan por intervalo y estima cuánto recuerda el alumno en promedio.
 * Entradas. El estado FSRS de cada tarjeta del mazo, null si nunca se ha visto, el momento actual y
 * la zona horaria del alumno.
 * Salidas. DeckStats, con la retención estimada en null mientras haya pocas tarjetas repasadas, que
 * es el estado calibrando de las funciones que dependen de datos.
 * Método
 *   - Nuevas. Sin estado o en estado new
 *   - En aprendizaje. Learning y relearning
 *   - En repaso. Review
 *   - Tocan hoy. Con fecha de vencimiento antes del final del día de estudio de hoy
 *   - Atrasadas. Vencieron antes del inicio del día de estudio de hoy, como en reschedule.ts
 *   - Maduras. En repaso con 21 días o más de intervalo, la definición que usa Anki
 *   - Intervalo. Los días que FSRS asignó la última vez, en cubetas de INTERVAL_BUCKETS, solo para
 *     las tarjetas en repaso o reaprendizaje
 *   - Retención estimada. Promedio de la probabilidad de recordar ahora de las tarjetas en repaso
 *     y reaprendizaje, con un mínimo de MIN_FOR_RETENTION tarjetas para no dar una cifra sin base
 * Lo que no hace. No usa la bitácora de respuestas ni predice un puntaje. Es solo el estado actual
 */
import type { FsrsCardState } from '@/data/schemas/common';
import { retrievabilityOf } from './fsrs';
import { studyDayEnd, studyDayOf, studyDayStart } from './studyDay';

/** Con menos tarjetas en repaso que esto no se da una retención estimada */
export const MIN_FOR_RETENTION = 20;
/** Intervalo desde el que una tarjeta en repaso se cuenta como madura */
export const MATURE_INTERVAL_DAYS = 21;

/** Cubetas del histograma de intervalos. El límite superior no se incluye */
export const INTERVAL_BUCKETS = [
  { key: 'under1', upTo: 1 },
  { key: 'd1to6', upTo: 7 },
  { key: 'd7to20', upTo: 21 },
  { key: 'd21to59', upTo: 60 },
  { key: 'd60to179', upTo: 180 },
  { key: 'd180plus', upTo: Number.POSITIVE_INFINITY },
] as const;
export type IntervalBucketKey = (typeof INTERVAL_BUCKETS)[number]['key'];

export interface DeckStats {
  total: number;
  fresh: number;
  learning: number;
  review: number;
  mature: number;
  dueToday: number;
  overdue: number;
  intervals: Record<IntervalBucketKey, number>;
  /** 0 a 1, o null mientras calibra */
  retention: number | null;
  /** Cuántas tarjetas en repaso faltan para dar la retención, 0 si ya se da */
  retentionNeeded: number;
}

function bucketOf(days: number): IntervalBucketKey {
  for (const bucket of INTERVAL_BUCKETS) if (days < bucket.upTo) return bucket.key;
  return 'd180plus';
}

export function deckStats(input: {
  states: readonly (FsrsCardState | null)[];
  now: Date;
  timeZone: string;
}): DeckStats {
  const { now, timeZone } = input;
  const today = studyDayOf(now, timeZone);
  const startMs = studyDayStart(today, timeZone).getTime();
  const endMs = studyDayEnd(today, timeZone).getTime();
  const stats: DeckStats = {
    total: input.states.length,
    fresh: 0,
    learning: 0,
    review: 0,
    mature: 0,
    dueToday: 0,
    overdue: 0,
    intervals: { under1: 0, d1to6: 0, d7to20: 0, d21to59: 0, d60to179: 0, d180plus: 0 },
    retention: null,
    retentionNeeded: 0,
  };
  let retrievabilitySum = 0;
  let retrievabilityCount = 0;
  for (const state of input.states) {
    if (state === null || state.state === 'new') {
      stats.fresh += 1;
      continue;
    }
    if (state.state === 'learning' || state.state === 'relearning') stats.learning += 1;
    else stats.review += 1;
    const dueMs = Date.parse(state.due);
    if (!Number.isNaN(dueMs)) {
      if (dueMs < endMs) stats.dueToday += 1;
      if (dueMs < startMs) stats.overdue += 1;
    }
    if (state.state === 'review' || state.state === 'relearning') {
      stats.intervals[bucketOf(state.scheduledDays)] += 1;
      retrievabilitySum += retrievabilityOf(state, now);
      retrievabilityCount += 1;
    }
    if (state.state === 'review' && state.scheduledDays >= MATURE_INTERVAL_DAYS) stats.mature += 1;
  }
  if (retrievabilityCount >= MIN_FOR_RETENTION) {
    stats.retention = retrievabilitySum / retrievabilityCount;
  } else {
    stats.retentionNeeded = MIN_FOR_RETENTION - retrievabilityCount;
  }
  return stats;
}
