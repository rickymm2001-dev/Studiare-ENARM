import { describe, expect, it } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import {
  ACCURACY_GOAL,
  ENARM_PACE_SECONDS,
  accuracyVerdict,
  averageAnswerTime,
  paceVerdict,
  rangePosition,
  retentionByWeek,
  retentionVerdict,
} from './keyIndicators';

const tz = 'America/Mexico_City';
const base = { userId: 'u1', tz, schemaVersion: 1 as const, sessionId: null };
const answered = (
  id: string,
  day: string,
  msToAnswer: number,
  type = 'question_answered',
): AppEvent =>
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
      msToAnswer,
      changeCount: 0,
      highlightEnabled: false,
    },
  }) as AppEvent;
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

describe('indicadores clave (D-150)', () => {
  it('promedia el tiempo por pregunta de los últimos 30 días y deja fuera lo demás', () => {
    const events = [
      answered('1', '2026-10-24', 60_000),
      answered('2', '2026-10-01', 80_000),
      // Hace más de 30 días, mañana y otro tipo. No cuentan
      answered('3', '2026-09-20', 5_000),
      answered('4', '2026-10-25', 5_000),
      answered('5', '2026-10-20', 5_000, 'question_shown'),
    ];
    expect(averageAnswerTime({ events, timeZone: tz, today: '2026-10-24' })).toEqual({
      answered: 2,
      averageMs: 70_000,
    });
  });

  it('sin preguntas el promedio es null', () => {
    expect(averageAnswerTime({ events: [], timeZone: tz, today: '2026-10-24' })).toEqual({
      answered: 0,
      averageMs: null,
    });
  });

  it('reparte la retención por semana de lunes a domingo, de la más vieja a la actual', () => {
    // El 24 de octubre de 2026 es sábado. Su semana empieza el lunes 19 y tres semanas atrás el 28 de septiembre
    const events = [
      reviewed('1', '2026-10-19', 'good'),
      reviewed('2', '2026-10-24', 'again'),
      reviewed('3', '2026-10-12', 'good'),
      reviewed('4', '2026-10-18', 'good'),
      // Antes del rango y mañana. No cuentan
      reviewed('5', '2026-09-27', 'again'),
      reviewed('6', '2026-10-25', 'again'),
    ];
    const weeks = retentionByWeek({ events, timeZone: tz, today: '2026-10-24', weeks: 4 });
    expect(weeks.map((week) => week.weekStart)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ]);
    expect(weeks.map((week) => week.reviews)).toEqual([0, 0, 2, 2]);
    expect(weeks.map((week) => week.retention)).toEqual([null, null, 1, 0.5]);
    expect(weeks[3]?.recalled).toBe(1);
  });

  it('por omisión son seis semanas', () => {
    expect(retentionByWeek({ events: [], timeZone: tz, today: '2026-10-19' })).toHaveLength(6);
  });

  it('la posición en la barra va de 0 a 100 y se recorta en los extremos', () => {
    expect(rangePosition(72, 40, 120)).toBe(40);
    expect(rangePosition(10, 40, 120)).toBe(0);
    expect(rangePosition(500, 40, 120)).toBe(100);
    expect(rangePosition(5, 10, 10)).toBe(0);
  });

  it('los veredictos siguen la meta de aciertos, el ritmo del ENARM y la retención deseada', () => {
    expect(accuracyVerdict(ACCURACY_GOAL)).toBe('good');
    expect(accuracyVerdict(0.62)).toBe('near');
    expect(accuracyVerdict(0.5)).toBe('low');
    expect(paceVerdict(ENARM_PACE_SECONDS)).toBe('good');
    expect(paceVerdict(90)).toBe('near');
    expect(paceVerdict(130)).toBe('low');
    expect(retentionVerdict(0.91, 0.9)).toBe('good');
    expect(retentionVerdict(0.85, 0.9)).toBe('near');
    expect(retentionVerdict(0.7, 0.9)).toBe('low');
  });
});
