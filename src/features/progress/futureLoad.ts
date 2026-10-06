// Carga futura de repasos (7.1, pantalla 10). Proyecta cuántos repasos y tarjetas nuevas tocan en
// los próximos 30 o 60 días con la configuración actual del alumno. Es la misma proyección y los
// mismos límites que usa el planificador, así las cifras coinciden. Supone que el alumno responde
// Bien en cada repaso y que introduce las nuevas al ritmo de su límite diario, y lo dice. Sin React
// ni Dexie, para probarlo con tarjetas armadas a mano.
import {
  projectLoad,
  type DayLoad,
  type QueueCard,
  type ReviewedToday,
  type SchedulerConfig,
} from '@/engines/fsrs';
import { applyLimits } from '../planner/planView';

export const LOAD_HORIZONS = [30, 60] as const;
export type LoadHorizon = (typeof LOAD_HORIZONS)[number];

export interface LoadWeek {
  /** Primer día de la semana de la proyección, AAAA-MM-DD */
  start: string;
  reviews: number;
  newCards: number;
}

export interface FutureLoad {
  horizon: LoadHorizon;
  days: DayLoad[];
  weeks: LoadWeek[];
  totalReviews: number;
  totalNew: number;
  /** Repasos por día en promedio */
  averageReviews: number;
  /** El día con más tarjetas, repasos y nuevas juntos. null si no hay nada que proyectar */
  peak: DayLoad | null;
  /** Tarjetas de mazos seguidos con las que se proyectó */
  cardCount: number;
}

const WEEK = 7;

export function futureLoad(input: {
  now: Date;
  config: SchedulerConfig;
  cards: readonly QueueCard[];
  /** Lo que ya repasó hoy, para no contarlo otra vez en el día de hoy */
  reviewedToday: ReviewedToday;
  horizon: LoadHorizon;
}): FutureLoad {
  const { config, horizon } = input;
  const days = applyLimits(
    projectLoad({ cards: input.cards, now: input.now, config, days: horizon }),
    {
      reviewsPerDay: config.thresholds.reviewsPerDay,
      newCardsPerDay: config.thresholds.newCardsPerDay,
    },
    input.reviewedToday,
  );

  const weeks: LoadWeek[] = [];
  for (let index = 0; index < days.length; index += WEEK) {
    const slice = days.slice(index, index + WEEK);
    weeks.push({
      start: slice[0]?.day ?? '',
      reviews: slice.reduce((sum, day) => sum + day.reviews, 0),
      newCards: slice.reduce((sum, day) => sum + day.newCards, 0),
    });
  }

  const totalReviews = days.reduce((sum, day) => sum + day.reviews, 0);
  const totalNew = days.reduce((sum, day) => sum + day.newCards, 0);
  const busiest = days.reduce<DayLoad | null>(
    (best, day) =>
      best === null || day.reviews + day.newCards > best.reviews + best.newCards ? day : best,
    null,
  );
  return {
    horizon,
    days,
    weeks,
    totalReviews,
    totalNew,
    averageReviews: days.length === 0 ? 0 : totalReviews / days.length,
    peak: busiest && busiest.reviews + busiest.newCards > 0 ? busiest : null,
    cardCount: input.cards.length,
  };
}
