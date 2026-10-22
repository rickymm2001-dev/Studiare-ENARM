/**
 * Cuántas tarjetas vencen cada día (B15, 3.3).
 *
 * Qué hace. Calcula las tarjetas vencidas de hoy y de los 13 días que siguen, y las nuevas disponibles hoy. La
 * app sube ese conteo al servidor para que el recordatorio por correo diga cuántas tarjetas le tocan al
 * alumno. Las tarjetas de los mazos precargados no viajan a la nube (src/engines/sync.ts), así que el
 * servidor no puede contarlas. La foto solo lleva fechas y números, nunca una tarjeta.
 * Entradas. Las tarjetas activas de los mazos que el alumno sigue y los suyos, sin las suspendidas, con su
 * nota y su estado de FSRS. La hora de ahora, su zona y su configuración del programador.
 * Salidas. Por día, las vencidas acumuladas con la misma regla que el contador de Repasar, y las nuevas de hoy.
 * Método. Hoy se pide a buildDailyQueue, la cola que arma Repasar, así que hoy y las nuevas salen justo
 * como el contador. Los días siguientes cuentan con la misma regla sin armar la cola, porque no hace falta
 * el orden. Una tarjeta vence en un día si su fecha cae antes de que el día de estudio termine, a las 4 a. m.
 * del siguiente, y las atrasadas se acumulan. De cada nota entra una sola tarjeta por día (las hermanas se
 * entierran), y el límite de repasos por día corta la cuenta. Es lo que le tocaría al alumno ese día si no
 * repasara nada antes.
 * Umbrales. 14 días, el límite de repasos y de nuevas que eligió el alumno.
 */
import type { FsrsCardState } from '@/data/schemas/common';
import { buildDailyQueue, type QueueCard, type ReviewedToday, type SchedulerConfig } from './fsrs';
import { addDays, studyDayEnd, studyDayOf } from './studyDay';

/** Hoy y los 13 días que siguen */
export const FORECAST_DAYS = 14;
/** El número más alto que acepta la foto del servidor (DUE_SNAPSHOT_MAX_COUNT) */
export const FORECAST_MAX_COUNT = 100_000;

export interface ForecastInput {
  /** Las tarjetas activas de los mazos que sigue el alumno y los suyos, sin las suspendidas */
  cards: readonly QueueCard[];
  now: Date;
  /** Trae la zona horaria y los límites diarios, como la que usa Repasar */
  config: SchedulerConfig;
  /** Lo que ya repasó hoy, que baja el límite y entierra las notas de hoy */
  reviewedToday: ReviewedToday;
  days?: number;
}

export interface DueForecast {
  /** Cada día con las vencidas acumuladas. Hoy primero */
  days: { day: string; due: number }[];
  /** Las nuevas que entrarían hoy según el tope y lo que ya introdujo */
  newAvailable: number;
}

const clamp = (value: number) => Math.min(FORECAST_MAX_COUNT, Math.max(0, Math.trunc(value)));

/** Cuántas notas tienen alguna tarjeta ya vista que vence antes de cada corte, acumulado y sin repetir notas */
function notesDueBy(cards: readonly QueueCard[], cutoffs: readonly number[]): number[] {
  // De cada nota importa su tarjeta que vence primero
  const earliest = new Map<string, number>();
  for (const card of cards) {
    const state: FsrsCardState | null = card.state;
    if (state === null || state.state === 'new') continue;
    const due = new Date(state.due).getTime();
    const known = earliest.get(card.noteId);
    if (known === undefined || due < known) earliest.set(card.noteId, due);
  }
  const counts = cutoffs.map(() => 0);
  for (const due of earliest.values()) {
    // Entra desde el primer día cuyo corte es posterior. Los cortes van de menor a mayor
    const first = cutoffs.findIndex((cutoff) => due < cutoff);
    if (first >= 0) counts[first] = (counts[first] ?? 0) + 1;
  }
  // Acumulado: lo que vence antes de un corte también vence antes de los siguientes
  let running = 0;
  return counts.map((count) => {
    running += count;
    return running;
  });
}

export function forecastDue(input: ForecastInput): DueForecast {
  const { now, config, reviewedToday } = input;
  const total = Math.max(1, input.days ?? FORECAST_DAYS);
  const today = studyDayOf(now, config.timeZone);
  const days = Array.from({ length: total }, (_, offset) => addDays(today, offset));

  // Hoy, con la cola que arma Repasar. Los repasos y las nuevas salen del mismo cálculo
  const queue = buildDailyQueue({ cards: input.cards, now, config, reviewedToday });

  // Los demás días, con la misma regla sin el orden. El corte de cada día es cuando termina
  const cutoffs = days.map((day) => studyDayEnd(day, config.timeZone).getTime());
  const accumulated = notesDueBy(input.cards, cutoffs);
  const limit = Math.max(0, config.thresholds.reviewsPerDay);

  return {
    days: days.map((day, offset) => ({
      day,
      due: clamp(offset === 0 ? queue.reviews.length : Math.min(limit, accumulated[offset] ?? 0)),
    })),
    newAvailable: clamp(queue.newCards.length),
  };
}
