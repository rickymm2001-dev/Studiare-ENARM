/**
 * Racha con días de gracia (9.4).
 *
 * Qué hace. Calcula la racha actual, el récord y los congeladores a partir de la actividad de cada
 * día de estudio. Un día cuenta si se cumple la meta mínima. Un día sin meta se cubre solo con un
 * congelador si hay uno guardado.
 * Entradas. Actividad por día de estudio (tarjetas, preguntas y minutos de enfoque), la meta y el
 * día de hoy. Los días cambian a las 4 a. m. de Mérida (motor studyDay).
 * Salidas. Racha actual, récord, congeladores disponibles, días en que se usó uno, si hoy ya se
 * cumplió y el cierre de cada día pasado para los eventos streak_day_closed.
 * Método. Recorre los días desde el primero con actividad. Hoy solo suma si ya se cumplió la meta.
 * Si hoy no se ha cumplido todavía, la racha sigue viva desde ayer.
 * Umbrales. Un congelador por cada 7 días de racha, máximo 2 guardados (J).
 */
import type { Thresholds } from '@/config/thresholds';
import { addDays, daysBetween } from './studyDay';

export interface DayActivity {
  cards: number;
  questions: number;
  focusMinutes: number;
}

export interface StreakGoal {
  metric: keyof DayActivity;
  value: number;
}

export interface ClosedDay {
  day: string;
  goalMet: boolean;
  freezeUsed: boolean;
}

export interface StreakState {
  current: number;
  best: number;
  freezesAvailable: number;
  freezeDays: string[];
  todayMet: boolean;
  closedDays: ClosedDay[];
}

export function goalMet(activity: DayActivity | undefined, goal: StreakGoal): boolean {
  return activity !== undefined && activity[goal.metric] >= goal.value;
}

export function computeStreak(input: {
  activity: Readonly<Record<string, DayActivity>>;
  goal: StreakGoal;
  today: string;
  thresholds: Thresholds['streak'];
}): StreakState {
  const days = Object.keys(input.activity)
    .filter((day) => daysBetween(day, input.today) >= 0)
    .sort();
  const empty: StreakState = {
    current: 0,
    best: 0,
    freezesAvailable: 0,
    freezeDays: [],
    todayMet: false,
    closedDays: [],
  };
  const first = days[0];
  if (first === undefined) return empty;

  let current = 0;
  let best = 0;
  let freezes = 0;
  const freezeDays: string[] = [];
  const closedDays: ClosedDay[] = [];
  const span = daysBetween(first, input.today);
  for (let offset = 0; offset <= span; offset += 1) {
    const day = addDays(first, offset);
    const met = goalMet(input.activity[day], input.goal);
    const isToday = day === input.today;
    if (met) {
      current += 1;
      best = Math.max(best, current);
      if (current % input.thresholds.daysPerFreeze === 0) {
        freezes = Math.min(input.thresholds.maxFreezes, freezes + 1);
      }
    } else if (!isToday) {
      if (current > 0 && freezes > 0) {
        freezes -= 1;
        freezeDays.push(day);
      } else {
        current = 0;
      }
    }
    if (!isToday) closedDays.push({ day, goalMet: met, freezeUsed: freezeDays.at(-1) === day });
  }
  return {
    current,
    best,
    freezesAvailable: freezes,
    freezeDays,
    todayMet: goalMet(input.activity[input.today], input.goal),
    closedDays,
  };
}
