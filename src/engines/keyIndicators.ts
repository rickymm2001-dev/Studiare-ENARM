// Indicadores clave de Inicio (D-150). Lo que la pantalla necesita para Retención, Aciertos y
// Tiempo por pregunta, sacado de la bitácora con funciones puras. Cada indicador calibra hasta llegar
// a su umbral (4.3) y la pantalla nunca inventa una cifra. La fatiga no vive aquí, sale del informe
// de insights (fatigueSignal en behavior.ts). Sin React ni Dexie.
import { EXAM_SECONDS_PER_QUESTION } from './exam';
import type { AppEvent } from '@/data/schemas/events';
import { addDays, studyDayOf } from './studyDay';

/** Lo mínimo para que cada indicador diga algo, los mismos umbrales del pulso de estudio */
export const INDICATOR_THRESHOLDS = { answered: 50, reviews: 50 } as const;

/** Ritmo del ENARM, el mismo segundo por reactivo que usa el examen. La barra de tiempo va de 40 a 120 segundos */
export const ENARM_PACE_SECONDS = EXAM_SECONDS_PER_QUESTION;
export const PACE_RANGE = { min: 40, max: 120 } as const;

/** La meta de aciertos y el rango de su barra, de 40 a 100 por ciento */
export const ACCURACY_GOAL = 0.7;
export const ACCURACY_RANGE = { min: 0.4, max: 1 } as const;

export type IndicatorVerdict = 'good' | 'near' | 'low';

export interface AnswerTime {
  /** Preguntas contestadas en el periodo */
  answered: number;
  /** Promedio de milisegundos por pregunta. null sin preguntas */
  averageMs: number | null;
}

/** Promedio del tiempo por pregunta de los últimos days días de estudio, hoy incluido */
export function averageAnswerTime(input: {
  events: readonly AppEvent[];
  timeZone: string;
  today: string;
  days?: number;
}): AnswerTime {
  const { events, timeZone, today, days = 30 } = input;
  const since = addDays(today, -(days - 1));
  let answered = 0;
  let totalMs = 0;
  for (const event of events) {
    if (event.type !== 'question_answered') continue;
    const day = studyDayOf(new Date(event.at), timeZone);
    if (day > today || day < since) continue;
    answered += 1;
    totalMs += event.payload.msToAnswer;
  }
  return { answered, averageMs: answered > 0 ? totalMs / answered : null };
}

export interface WeekRetention {
  /** Lunes de la semana, AAAA-MM-DD */
  weekStart: string;
  reviews: number;
  recalled: number;
  /** Proporción recordada, de 0 a 1. null sin repasos esa semana */
  retention: number | null;
}

/**
 * Retención por semana de las últimas weeks semanas, de la más vieja a la actual. Un repaso cuenta
 * como recordado cuando su calificación no es Otra vez, igual que en el pulso de estudio
 */
export function retentionByWeek(input: {
  events: readonly AppEvent[];
  timeZone: string;
  today: string;
  weeks?: number;
}): WeekRetention[] {
  const { events, timeZone, today, weeks = 6 } = input;
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const currentStart = addDays(today, -weekday);
  const starts = Array.from({ length: weeks }, (_, index) =>
    addDays(currentStart, -7 * (weeks - 1 - index)),
  );
  const first = starts[0] ?? currentStart;
  const counts = starts.map(() => ({ reviews: 0, recalled: 0 }));
  for (const event of events) {
    if (event.type !== 'card_reviewed') continue;
    const day = studyDayOf(new Date(event.at), timeZone);
    if (day > today || day < first) continue;
    const index = Math.floor(
      (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / (7 * 86_400_000),
    );
    const bucket = counts[index];
    if (!bucket) continue;
    bucket.reviews += 1;
    if (event.payload.rating !== 'again') bucket.recalled += 1;
  }
  return starts.map((weekStart, index) => {
    const bucket = counts[index] ?? { reviews: 0, recalled: 0 };
    return {
      weekStart,
      reviews: bucket.reviews,
      recalled: bucket.recalled,
      retention: bucket.reviews > 0 ? bucket.recalled / bucket.reviews : null,
    };
  });
}

/** Dónde cae un valor en una barra de rango, de 0 a 100 */
export function rangePosition(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);
}

/** Aciertos contra la meta. Bueno desde la meta, cerca a menos de 10 puntos, bajo lo demás */
export function accuracyVerdict(accuracy: number): IndicatorVerdict {
  if (accuracy >= ACCURACY_GOAL) return 'good';
  if (accuracy >= ACCURACY_GOAL - 0.1) return 'near';
  return 'low';
}

/** Tiempo por pregunta contra el ritmo del ENARM. Bueno hasta el ritmo, cerca hasta 100 segundos */
export function paceVerdict(seconds: number): IndicatorVerdict {
  if (seconds <= ENARM_PACE_SECONDS) return 'good';
  if (seconds <= 100) return 'near';
  return 'low';
}

/** Retención contra la meta de FSRS del alumno. Bueno desde la meta, cerca a menos de 10 puntos */
export function retentionVerdict(retention: number, goal: number): IndicatorVerdict {
  if (retention >= goal) return 'good';
  if (retention >= goal - 0.1) return 'near';
  return 'low';
}
