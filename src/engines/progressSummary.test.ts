import { describe, expect, it } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import {
  accuracyDelta,
  branchAccuracyInWindow,
  percentOf,
  progressSummary,
  recentSessions,
  relativeDelta,
  SUMMARY_THRESHOLDS,
} from './progressSummary';

const tz = 'America/Mexico_City';
const base = { userId: 'u1', tz, schemaVersion: 1 as const, sessionId: null };
let counter = 0;

const answered = (day: string, correct: boolean, questionVersionId = 'q1'): AppEvent => ({
  ...base,
  id: `a${String((counter += 1))}`,
  at: `${day}T18:00:00.000Z`,
  type: 'question_answered',
  payload: {
    questionVersionId,
    optionVersionId: 'o1',
    correct,
    confidence: null,
    msToAnswer: 1000,
    changeCount: 0,
    highlightEnabled: false,
  },
});

const reviewed = (day: string): AppEvent =>
  ({
    ...base,
    id: `r${String((counter += 1))}`,
    at: `${day}T18:00:00.000Z`,
    type: 'card_reviewed',
    payload: { cardId: 'c1', rating: 'good' },
  }) as AppEvent;

const started = (sessionId: string, at: string, kind = 'exam'): AppEvent =>
  ({
    ...base,
    sessionId,
    id: `s${String((counter += 1))}`,
    at,
    type: 'session_started',
    payload: { kind, config: {} },
  }) as AppEvent;

const ended = (
  sessionId: string,
  at: string,
  payload: { items: number; correct: number | null; reason: 'completed' | 'abandoned' },
  kind = 'exam',
): AppEvent =>
  ({
    ...base,
    sessionId,
    id: `e${String((counter += 1))}`,
    at,
    type: 'session_ended',
    payload: { kind, durationMs: 60_000, xp: 0, ...payload },
  }) as AppEvent;

const today = '2026-10-24';

describe('resumen de Progreso (D-150)', () => {
  it('separa los aciertos y las preguntas de los últimos 30 días de los 30 anteriores', () => {
    const events = [
      // Dentro de la ventana actual, que empieza el 25 de septiembre
      answered('2026-09-25', true),
      answered('2026-10-20', false),
      answered(today, true),
      // Ventana anterior, del 26 de agosto al 24 de septiembre
      answered('2026-09-24', false),
      answered('2026-08-26', false),
      // Demasiado viejo y en el futuro, no cuentan
      answered('2026-08-25', true),
      answered('2026-10-25', true),
    ];
    const summary = progressSummary({ events, timeZone: tz, today });
    expect(summary.accuracy.current).toEqual({ answered: 3, correct: 2 });
    expect(summary.accuracy.previous).toEqual({ answered: 2, correct: 0 });
    expect(summary.questions).toMatchObject({ current: 3, previous: 2 });
  });

  it('las series chicas van del día más viejo a hoy y solo la tendencia salta los días sin respuestas', () => {
    const events = [
      answered('2026-10-22', true),
      answered('2026-10-22', false),
      answered(today, true),
      reviewed(today),
      reviewed('2026-10-13'),
    ];
    const summary = progressSummary({ events, timeZone: tz, today });
    // Siete días, pero solo dos tuvieron respuestas, el 22 con 50 y hoy con 100
    expect(summary.accuracy.trend).toEqual([50, 100]);
    // Seis días del 19 al 24
    expect(summary.questions.byDay).toEqual([0, 0, 0, 2, 0, 1]);
    // Doce días del 13 al 24, con tarjetas más preguntas
    expect(summary.activity).toHaveLength(12);
    expect(summary.activity[0]).toBe(1);
    expect(summary.activity.at(-1)).toBe(2);
    expect(summary.activity[9]).toBe(2);
  });

  it('el porcentaje y el cambio piden respuestas suficientes en las dos ventanas', () => {
    expect(percentOf({ answered: 0, correct: 0 })).toBeNull();
    expect(percentOf({ answered: 4, correct: 3 })).toBe(75);
    const enough = { answered: SUMMARY_THRESHOLDS.answers, correct: 15 };
    expect(accuracyDelta(enough, { answered: 5, correct: 5 })).toBeNull();
    expect(accuracyDelta({ answered: 5, correct: 5 }, enough)).toBeNull();
    expect(accuracyDelta({ answered: 40, correct: 30 }, { answered: 20, correct: 14 })).toBe(5);
    expect(accuracyDelta({ answered: 40, correct: 30 }, { answered: 20, correct: 14 }, 50)).toBe(
      null,
    );
  });

  it('el cambio relativo de preguntas no existe sin conteo anterior', () => {
    expect(relativeDelta(10, 0)).toBeNull();
    expect(relativeDelta(110, 100)).toBe(10);
    expect(relativeDelta(80, 100)).toBe(-20);
  });

  it('los aciertos por rama en una ventana usan la rama que dice el banco y saltan lo que ya no está', () => {
    const branchOf = (id: string) =>
      id === 'q-mi' ? 'internal_medicine' : id === 'q-ped' ? 'pediatrics' : undefined;
    const events = [
      // Hace un mes, del 59 al 30 días antes de hoy. 24 de septiembre está 30 días atrás
      answered('2026-09-24', true, 'q-mi'),
      answered('2026-09-01', false, 'q-mi'),
      answered('2026-08-26', true, 'q-ped'),
      answered('2026-09-10', true, 'q-gone'),
      // Fuera de la ventana por los dos lados
      answered('2026-08-25', true, 'q-mi'),
      answered('2026-09-25', true, 'q-mi'),
    ];
    const tallies = branchAccuracyInWindow({
      events,
      branchOf,
      timeZone: tz,
      today,
      from: 59,
      to: 30,
    });
    expect([...tallies.entries()]).toEqual([
      ['internal_medicine', { answered: 2, correct: 1 }],
      ['pediatrics', { answered: 1, correct: 1 }],
    ]);
  });

  it('arma las últimas sesiones de la más reciente a la más vieja con su estado', () => {
    const events = [
      started('s1', '2026-10-20T10:00:00.000Z', 'practice'),
      ended(
        's1',
        '2026-10-20T10:30:00.000Z',
        { items: 10, correct: 7, reason: 'completed' },
        'practice',
      ),
      started('s2', '2026-10-22T10:00:00.000Z'),
      ended('s2', '2026-10-22T11:00:00.000Z', { items: 50, correct: 30, reason: 'abandoned' }),
      // Empezó y nunca cerró
      started('s3', '2026-10-23T10:00:00.000Z', 'review'),
      // Cerró sin inicio en la bitácora, cuenta desde su cierre
      ended(
        's4',
        '2026-10-24T10:00:00.000Z',
        { items: 20, correct: null, reason: 'completed' },
        'review',
      ),
      // Sin sesión no cuenta
      answered(today, true),
    ];
    const rows = recentSessions({ events });
    expect(rows.map((row) => row.id)).toEqual(['s4', 's3', 's2', 's1']);
    expect(rows[0]).toMatchObject({ kind: 'review', items: 20, correct: null, state: 'completed' });
    expect(rows[1]).toMatchObject({ kind: 'review', items: null, state: 'open' });
    expect(rows[2]).toMatchObject({ kind: 'exam', items: 50, correct: 30, state: 'abandoned' });
    expect(rows[3]).toMatchObject({ kind: 'practice', items: 10, correct: 7 });
    // El inicio que llega después del cierre corrige la hora y el tipo
    const reordered = recentSessions({
      events: [
        ended('s5', '2026-10-24T12:00:00.000Z', { items: 5, correct: 5, reason: 'completed' }),
        started('s5', '2026-10-24T11:00:00.000Z', 'challenge'),
      ],
    });
    expect(reordered[0]).toMatchObject({
      kind: 'challenge',
      startedAt: '2026-10-24T11:00:00.000Z',
      state: 'completed',
    });
    expect(recentSessions({ events, limit: 2 })).toHaveLength(2);
  });
});
