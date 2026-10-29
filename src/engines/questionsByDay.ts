// Preguntas contestadas por día de la semana, esta semana contra la pasada (D-150). Las semanas van
// de lunes a domingo, como la tabla de Party (9.6), en el día de estudio del alumno. Función pura.
import type { AppEvent } from '@/data/schemas/events';
import { addDays, daysBetween, studyDayOf, weekStartOf } from './studyDay';

export interface WeekComparison {
  /** Siete cifras, de lunes a domingo. Los días que aún no llegan van en 0 */
  current: number[];
  previous: number[];
  totalCurrent: number;
  totalPrevious: number;
  /** Promedio por día de esta semana, contando solo los días que ya pasaron, hoy incluido */
  averageCurrent: number;
}

export function questionsByWeekday(input: {
  events: readonly AppEvent[];
  timeZone: string;
  today: string;
}): WeekComparison {
  const { events, timeZone, today } = input;
  const currentStart = weekStartOf(today);
  const previousStart = addDays(currentStart, -7);
  const current = [0, 0, 0, 0, 0, 0, 0];
  const previous = [0, 0, 0, 0, 0, 0, 0];
  for (const event of events) {
    if (event.type !== 'question_answered') continue;
    const day = studyDayOf(new Date(event.at), timeZone);
    if (day > today || day < previousStart) continue;
    if (day >= currentStart) {
      const index = daysBetween(currentStart, day);
      if (index >= 0 && index < 7) current[index] = (current[index] ?? 0) + 1;
    } else {
      const index = daysBetween(previousStart, day);
      if (index >= 0 && index < 7) previous[index] = (previous[index] ?? 0) + 1;
    }
  }
  const totalCurrent = current.reduce((sum, value) => sum + value, 0);
  const totalPrevious = previous.reduce((sum, value) => sum + value, 0);
  const elapsed = daysBetween(currentStart, today) + 1;
  return {
    current,
    previous,
    totalCurrent,
    totalPrevious,
    averageCurrent: elapsed > 0 ? Math.round(totalCurrent / elapsed) : 0,
  };
}
