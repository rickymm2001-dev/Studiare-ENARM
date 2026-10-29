import { describe, expect, it } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import {
  PULSE_MAX,
  PULSE_THRESHOLDS,
  pulseInputFromEvents,
  studyPulse,
  type PulseInput,
} from './studyPulse';

const full: PulseInput = { activeDays: 14, answered: 100, correct: 80, reviews: 100, recalled: 95 };

describe('pulso de estudio (D-150)', () => {
  it('calibra hasta llegar a los tres umbrales y dice cuánto falta de cada uno', () => {
    const result = studyPulse({
      activeDays: 3,
      answered: 10,
      correct: 5,
      reviews: 60,
      recalled: 50,
    });
    expect(result).toEqual({
      calibrating: true,
      needed: {
        activeDays: PULSE_THRESHOLDS.activeDays - 3,
        answered: PULSE_THRESHOLDS.answered - 10,
        reviews: 0,
      },
    });
  });

  it('con todo al máximo da 100 y su tono es bueno', () => {
    const result = studyPulse(full);
    expect(result.calibrating).toBe(false);
    if (result.calibrating) return;
    expect(result.score).toBe(100);
    expect(result.tone).toBe('good');
    expect(result.parts).toEqual({
      consistency: { points: PULSE_MAX.consistency, max: PULSE_MAX.consistency },
      accuracy: { points: PULSE_MAX.accuracy, max: PULSE_MAX.accuracy },
      retention: { points: PULSE_MAX.retention, max: PULSE_MAX.retention },
    });
    expect(result.accuracy).toBe(0.8);
    expect(result.retention).toBe(0.95);
  });

  it('los aciertos valen 0 en 40 por ciento, la retención en 70, y la constancia es proporcional', () => {
    const result = studyPulse({
      activeDays: 7,
      answered: 100,
      correct: 40,
      reviews: 100,
      recalled: 70,
    });
    expect(result.calibrating).toBe(false);
    if (result.calibrating) return;
    expect(result.parts.accuracy.points).toBe(0);
    expect(result.parts.retention.points).toBe(0);
    expect(result.parts.consistency.points).toBe(Math.round(PULSE_MAX.consistency / 2));
    expect(result.score).toBe(result.parts.consistency.points);
    expect(result.tone).toBe('low');
  });

  it('a medio camino el tono es cerca de la meta', () => {
    const result = studyPulse({
      activeDays: 10,
      answered: 100,
      correct: 60,
      reviews: 100,
      recalled: 85,
    });
    expect(result.calibrating).toBe(false);
    if (result.calibrating) return;
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThan(75);
    expect(result.tone).toBe('near');
  });

  it('saca de la bitácora los días activos de 14 y las cifras de 30, en el día de estudio del alumno', () => {
    const tz = 'America/Mexico_City';
    const base = { userId: 'u1', tz, schemaVersion: 1 as const, sessionId: null };
    const answered = (id: string, day: string, correct: boolean): AppEvent => ({
      ...base,
      id,
      at: `${day}T18:00:00.000Z`,
      type: 'question_answered',
      payload: {
        questionVersionId: 'q1',
        optionVersionId: 'o1',
        correct,
        confidence: null,
        msToAnswer: 1000,
        changeCount: 0,
        highlightEnabled: false,
      },
    });
    const reviewed = (id: string, day: string, rating: 'again' | 'good'): AppEvent =>
      ({
        ...base,
        id,
        at: `${day}T18:00:00.000Z`,
        type: 'card_reviewed',
        payload: {
          cardId: 'c1',
          deckId: 'd1',
          source: 'card',
          rating,
          confidence: null,
          msToReveal: 1000,
          msToRate: 1000,
          stateBefore: null,
          stateAfter: { state: 'review', due: '2026-11-01T00:00:00.000Z', lapses: 0 },
        },
      }) as AppEvent;
    const events = [
      answered('a1', '2026-10-24', true),
      answered('a2', '2026-10-24', false),
      reviewed('r1', '2026-10-20', 'good'),
      reviewed('r2', '2026-10-20', 'again'),
      // Dentro de los 30 días pero fuera de los 14. Cuenta en cifras y no en días activos
      answered('a3', '2026-10-01', true),
      // Fuera de los 30 días y en el futuro. No cuentan
      answered('a4', '2026-09-01', true),
      answered('a5', '2026-10-30', true),
      // Otro tipo de evento no cuenta
      {
        ...base,
        id: 'x',
        at: '2026-10-24T18:00:00.000Z',
        type: 'cause_reported',
        payload: { targetKind: 'question', targetId: 'q1', cause: 'forgot' },
      } as AppEvent,
    ];
    expect(pulseInputFromEvents({ events, timeZone: tz, today: '2026-10-24' })).toEqual({
      activeDays: 2,
      answered: 3,
      correct: 2,
      reviews: 2,
      recalled: 1,
    });
  });
});
