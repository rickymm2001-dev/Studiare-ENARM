import { describe, expect, it } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import { questionsByWeekday } from './questionsByDay';

const tz = 'America/Mexico_City';
const base = { userId: 'u1', tz, schemaVersion: 1 as const, sessionId: null };
const answered = (id: string, day: string, type = 'question_answered'): AppEvent =>
  ({
    ...base,
    id,
    at: `${day}T18:00:00.000Z`,
    type,
    payload: {
      questionVersionId: 'q1',
      optionVersionId: 'o1',
      correct: true,
      confidence: null,
      msToAnswer: 1000,
      changeCount: 0,
      highlightEnabled: false,
    },
  }) as AppEvent;

describe('preguntas por día de la semana (D-150)', () => {
  it('reparte esta semana y la pasada de lunes a domingo y promedia solo los días que ya pasaron', () => {
    // El 24 de octubre de 2026 es sábado. Su semana empieza el lunes 19
    const events = [
      answered('1', '2026-10-19'),
      answered('2', '2026-10-19'),
      answered('3', '2026-10-24'),
      // La semana pasada, lunes 12 a domingo 18
      answered('4', '2026-10-12'),
      answered('5', '2026-10-18'),
      // Hace dos semanas, mañana y otro tipo. No cuentan
      answered('6', '2026-10-11'),
      answered('7', '2026-10-25'),
      answered('8', '2026-10-20', 'question_shown'),
    ];
    const result = questionsByWeekday({ events, timeZone: tz, today: '2026-10-24' });
    expect(result.current).toEqual([2, 0, 0, 0, 0, 1, 0]);
    expect(result.previous).toEqual([1, 0, 0, 0, 0, 0, 1]);
    expect(result.totalCurrent).toBe(3);
    expect(result.totalPrevious).toBe(2);
    // Seis días transcurridos, del lunes al sábado
    expect(result.averageCurrent).toBe(Math.round(3 / 6));
  });

  it('sin eventos todo queda en cero', () => {
    const result = questionsByWeekday({ events: [], timeZone: tz, today: '2026-10-19' });
    expect(result.current).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(result.totalCurrent).toBe(0);
    expect(result.averageCurrent).toBe(0);
  });
});
