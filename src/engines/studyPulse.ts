// Pulso de estudio (D-150). Un puntaje de 0 a 100 que resume cómo va el alumno con tres partes,
// constancia (hasta 45 puntos, los días con actividad de los últimos 14), aciertos (hasta 35, la
// proporción de preguntas correctas de los últimos 30 días, de 40 por ciento que vale 0 a 80 que vale
// todo) y retención (hasta 20, la proporción de repasos recordados de los últimos 30 días, de 70 por
// ciento que vale 0 a 95 que vale todo). Hasta llegar a su umbral dice calibrando y cuánto falta
// (4.3). Es una función pura sobre eventos, sin React ni Dexie. No predice el puntaje del ENARM.
import type { AppEvent } from '@/data/schemas/events';
import { addDays, studyDayOf } from './studyDay';

export interface PulseInput {
  /** Días con actividad de los últimos 14, de 0 a 14 */
  activeDays: number;
  /** Preguntas contestadas y correctas en los últimos 30 días */
  answered: number;
  correct: number;
  /** Repasos de los últimos 30 días y cuántos se recordaron, con calificación distinta de otra vez */
  reviews: number;
  recalled: number;
}

/** Lo mínimo para que el puntaje diga algo (4.3) */
export const PULSE_THRESHOLDS = { activeDays: 7, answered: 50, reviews: 50 } as const;

export const PULSE_MAX = { consistency: 45, accuracy: 35, retention: 20 } as const;

export interface PulsePart {
  points: number;
  max: number;
}

export type PulseTone = 'good' | 'near' | 'low';

export type PulseResult =
  | {
      calibrating: true;
      /** Cuánto falta de cada umbral */
      needed: { activeDays: number; answered: number; reviews: number };
    }
  | {
      calibrating: false;
      score: number;
      tone: PulseTone;
      parts: { consistency: PulsePart; accuracy: PulsePart; retention: PulsePart };
      accuracy: number;
      retention: number;
    };

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export function studyPulse(input: PulseInput): PulseResult {
  const needed = {
    activeDays: Math.max(PULSE_THRESHOLDS.activeDays - input.activeDays, 0),
    answered: Math.max(PULSE_THRESHOLDS.answered - input.answered, 0),
    reviews: Math.max(PULSE_THRESHOLDS.reviews - input.reviews, 0),
  };
  if (needed.activeDays > 0 || needed.answered > 0 || needed.reviews > 0) {
    return { calibrating: true, needed };
  }
  const accuracy = input.answered > 0 ? input.correct / input.answered : 0;
  const retention = input.reviews > 0 ? input.recalled / input.reviews : 0;
  const consistency = Math.round(clamp01(input.activeDays / 14) * PULSE_MAX.consistency);
  const accuracyPoints = Math.round(clamp01((accuracy - 0.4) / 0.4) * PULSE_MAX.accuracy);
  const retentionPoints = Math.round(clamp01((retention - 0.7) / 0.25) * PULSE_MAX.retention);
  const score = consistency + accuracyPoints + retentionPoints;
  return {
    calibrating: false,
    score,
    tone: score >= 75 ? 'good' : score >= 50 ? 'near' : 'low',
    parts: {
      consistency: { points: consistency, max: PULSE_MAX.consistency },
      accuracy: { points: accuracyPoints, max: PULSE_MAX.accuracy },
      retention: { points: retentionPoints, max: PULSE_MAX.retention },
    },
    accuracy,
    retention,
  };
}

/** Lo que el pulso necesita, sacado de la bitácora. today es el día de estudio de hoy */
export function pulseInputFromEvents(input: {
  events: readonly AppEvent[];
  timeZone: string;
  today: string;
}): PulseInput {
  const { events, timeZone, today } = input;
  const since14 = addDays(today, -13);
  const since30 = addDays(today, -29);
  const activeDays = new Set<string>();
  let answered = 0;
  let correct = 0;
  let reviews = 0;
  let recalled = 0;
  for (const event of events) {
    if (event.type !== 'card_reviewed' && event.type !== 'question_answered') continue;
    const day = studyDayOf(new Date(event.at), timeZone);
    if (day > today || day < since30) continue;
    if (day >= since14) activeDays.add(day);
    if (event.type === 'question_answered') {
      answered += 1;
      if (event.payload.correct) correct += 1;
    } else {
      reviews += 1;
      if (event.payload.rating !== 'again') recalled += 1;
    }
  }
  return { activeDays: activeDays.size, answered, correct, reviews, recalled };
}
