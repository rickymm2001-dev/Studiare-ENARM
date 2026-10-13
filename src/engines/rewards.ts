/**
 * Misiones del día y de la semana (Fase P bloque 6). Logros, sus insignias y sus ligas se quitaron en
 * B3 del plan del cambio (comentario 14). Quedan las misiones, que Inicio muestra en Misiones de hoy
 * (4.12).
 *
 * Qué hace. Convierte la bitácora del alumno en misiones con su avance, sin inventar datos.
 * Entradas. Los eventos del alumno, el momento actual y la zona horaria del alumno.
 * Salidas. Un estado con claves, sin texto. La interfaz pone el idioma. No guarda nada, todo se
 * reconstruye de la bitácora, así nada se puede falsificar ni desfasar.
 * Método. Se resume la bitácora por día de estudio, que corta a las 4 a. m. en la zona del alumno.
 * Las misiones miran el día y la semana en curso. La misión de aciertos de la semana muestra
 * calibrando hasta tener 30 preguntas, porque un porcentaje con pocas preguntas no dice nada.
 * Umbrales. Todos en src/config/rewards.ts y provisionales.
 */
import { MISSION_TARGETS, STUDY_DAY_MIN } from '@/config/rewards';
import type { AppEvent } from '@/data/schemas/events';
import { addDays, studyDayOf, weekStartOf } from './studyDay';

export interface DayTotals {
  cards: number;
  questions: number;
  correct: number;
  minutes: number;
  xp: number;
}

const emptyTotals = (): DayTotals => ({ cards: 0, questions: 0, correct: 0, minutes: 0, xp: 0 });

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
      case 'question_answered': {
        const entry = at(day);
        entry.questions += 1;
        if (event.payload.correct) entry.correct += 1;
        break;
      }
      case 'xp_awarded':
        at(day).xp += event.payload.amount;
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

export type MissionKey =
  'dailyCards' | 'dailyQuestions' | 'dailyMinutes' | 'weeklyDays' | 'weeklyXp' | 'weeklyAccuracy';

export interface Mission {
  key: MissionKey;
  scope: 'daily' | 'weekly';
  current: number;
  target: number;
  done: boolean;
  /** Sin suficientes datos para medirla. Faltan `need - have` preguntas */
  calibrating: { have: number; need: number } | null;
}

export interface Missions {
  daily: Mission[];
  weekly: Mission[];
}

const missionOf = (
  key: MissionKey,
  scope: Mission['scope'],
  current: number,
  target: number,
): Mission => ({ key, scope, current, target, done: current >= target, calibrating: null });

export function isStudyDay(totals: DayTotals | undefined): boolean {
  return (
    totals !== undefined &&
    (totals.cards >= STUDY_DAY_MIN.cards ||
      totals.questions >= STUDY_DAY_MIN.questions ||
      totals.minutes >= STUDY_DAY_MIN.minutes)
  );
}

export function missionsFor(totals: ReadonlyMap<string, DayTotals>, today: string): Missions {
  const now = totals.get(today) ?? emptyTotals();
  const monday = weekStartOf(today);
  let days = 0;
  let xp = 0;
  let questions = 0;
  let correct = 0;
  for (let day = monday; day <= today; day = addDays(day, 1)) {
    const entry = totals.get(day);
    if (!entry) continue;
    if (isStudyDay(entry)) days += 1;
    xp += entry.xp;
    questions += entry.questions;
    correct += entry.correct;
  }
  const need = MISSION_TARGETS.weeklyAccuracyMinQuestions;
  const percent = questions === 0 ? 0 : Math.round((100 * correct) / questions);
  const accuracy = missionOf(
    'weeklyAccuracy',
    'weekly',
    percent,
    MISSION_TARGETS.weeklyAccuracyPercent,
  );
  const measured = questions >= need;
  return {
    daily: [
      missionOf('dailyCards', 'daily', now.cards, MISSION_TARGETS.dailyCards),
      missionOf('dailyQuestions', 'daily', now.questions, MISSION_TARGETS.dailyQuestions),
      missionOf('dailyMinutes', 'daily', now.minutes, MISSION_TARGETS.dailyMinutes),
    ],
    weekly: [
      missionOf('weeklyDays', 'weekly', days, MISSION_TARGETS.weeklyDays),
      missionOf('weeklyXp', 'weekly', xp, MISSION_TARGETS.weeklyXp),
      // Con pocas preguntas el porcentaje no es de fiar y la misión ni se da por hecha ni por perdida
      measured
        ? accuracy
        : { ...accuracy, current: percent, done: false, calibrating: { have: questions, need } },
    ],
  };
}

/** Las misiones de hoy y de la semana desde la bitácora completa del alumno */
export function buildMissions(input: {
  events: readonly AppEvent[];
  now: Date;
  timeZone: string;
}): Missions {
  return missionsFor(dayTotals(input.events), studyDayOf(input.now, input.timeZone));
}
