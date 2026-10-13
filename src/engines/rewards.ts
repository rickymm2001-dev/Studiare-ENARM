/**
 * Misiones del día (Fase P bloque 6, 4.12 del plan del cambio). Logros, sus insignias y sus ligas se
 * quitaron en B3 del plan del cambio (comentario 14) y con ellos las misiones de la semana, que Inicio
 * ya no mostraba. Quedan las tres de hoy, que Inicio muestra en Misiones de hoy.
 *
 * Qué hace. Convierte la bitácora del alumno en misiones con su avance, sin inventar datos.
 * Entradas. Los eventos del alumno, el momento actual y la zona horaria del alumno.
 * Salidas. Una lista de misiones con claves, sin texto. La interfaz pone el idioma. No guarda nada,
 * todo se reconstruye de la bitácora, así nada se puede falsificar ni desfasar.
 * Método. Se resume la bitácora por día de estudio, que corta a las 4 a. m. en la zona del alumno, y
 * las misiones miran el día en curso.
 * Umbrales. Todos en src/config/rewards.ts y provisionales.
 */
import { MISSION_TARGETS } from '@/config/rewards';
import type { AppEvent } from '@/data/schemas/events';
import { studyDayOf } from './studyDay';

export interface DayTotals {
  cards: number;
  questions: number;
  minutes: number;
}

const emptyTotals = (): DayTotals => ({ cards: 0, questions: 0, minutes: 0 });

/** La bitácora resumida por día de estudio. Los minutos son el mayor entre sesiones y Pomodoro */
export function dayTotals(events: readonly AppEvent[]): Map<string, DayTotals> {
  const totals = new Map<string, DayTotals>();
  const sessions = new Map<string, number>();
  const pomodoro = new Map<string, number>();
  const at = (day: string) => {
    let entry = totals.get(day);
    if (!entry) {
      entry = emptyTotals();
      totals.set(day, entry);
    }
    return entry;
  };
  for (const event of events) {
    const day = studyDayOf(new Date(event.at), event.tz);
    switch (event.type) {
      case 'card_reviewed':
        at(day).cards += 1;
        break;
      case 'question_answered':
        at(day).questions += 1;
        break;
      case 'session_ended':
        sessions.set(day, (sessions.get(day) ?? 0) + event.payload.durationMs / 60000);
        break;
      case 'pomodoro_completed':
        if (event.payload.phase === 'focus') {
          pomodoro.set(day, (pomodoro.get(day) ?? 0) + event.payload.actualMinutes);
        }
        break;
      default:
        break;
    }
  }
  for (const day of new Set([...sessions.keys(), ...pomodoro.keys()])) {
    at(day).minutes = Math.round(Math.max(sessions.get(day) ?? 0, pomodoro.get(day) ?? 0));
  }
  return totals;
}

export type MissionKey = 'dailyCards' | 'dailyQuestions' | 'dailyMinutes';

export interface Mission {
  key: MissionKey;
  current: number;
  target: number;
  done: boolean;
}

const missionOf = (key: MissionKey, current: number, target: number): Mission => ({
  key,
  current,
  target,
  done: current >= target,
});

/** Las misiones de hoy, en el orden en que se muestran */
export function missionsFor(totals: ReadonlyMap<string, DayTotals>, today: string): Mission[] {
  const now = totals.get(today) ?? emptyTotals();
  return [
    missionOf('dailyCards', now.cards, MISSION_TARGETS.dailyCards),
    missionOf('dailyQuestions', now.questions, MISSION_TARGETS.dailyQuestions),
    missionOf('dailyMinutes', now.minutes, MISSION_TARGETS.dailyMinutes),
  ];
}

/** Las misiones de hoy desde la bitácora completa del alumno */
export function buildMissions(input: {
  events: readonly AppEvent[];
  now: Date;
  timeZone: string;
}): Mission[] {
  return missionsFor(dayTotals(input.events), studyDayOf(input.now, input.timeZone));
}
