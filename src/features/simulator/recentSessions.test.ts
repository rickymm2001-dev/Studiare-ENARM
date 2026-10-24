import { describe, expect, it } from 'vitest';
import { createEvent } from '@/data/events/createEvent';
import { accuracyPercent, recentSessions, sessionDayLabel } from './recentSessions';

const at = (iso: string) => ({ now: () => new Date(iso) });
// Los IDs de sesión son ULID, así que s1 se escribe como un ULID que termina en 1
const sid = (n: string) => `01HZZZZZZZZZZZZZZZZZZZZZZ${n}`;
const ctx = (iso: string, sessionId: string, seq: number) => ({
  userId: '01HZZZZZZZZZZZZZZZZZZZZZZA',
  tz: 'America/Mexico_City',
  sessionId: sid(sessionId),
  clock: at(iso),
  newId: () => `01HZZZZZZZZZZZZZZZZZZZZ${String(seq).padStart(3, '0')}`,
});

const ended = (
  iso: string,
  sessionId: string,
  seq: number,
  payload: Partial<{
    kind: 'practice' | 'exam' | 'challenge' | 'review';
    items: number;
    correct: number | null;
  }>,
) =>
  createEvent(
    'session_ended',
    {
      kind: 'practice',
      reason: 'completed',
      items: 10,
      correct: 7,
      durationMs: 600_000,
      xp: 50,
      ...payload,
    },
    ctx(iso, sessionId, seq),
  );

describe('últimas sesiones del simulador (D-150)', () => {
  it('toma las más recientes de práctica, examen y duelo, y deja fuera el repaso', () => {
    const events = [
      ended('2026-10-20T10:00:00Z', '1', 1, { kind: 'practice' }),
      ended('2026-10-21T10:00:00Z', '2', 2, { kind: 'review' }),
      ended('2026-10-22T10:00:00Z', '3', 3, { kind: 'exam', items: 50, correct: 34 }),
      ended('2026-10-23T10:00:00Z', '4', 4, { kind: 'challenge' }),
      ended('2026-10-24T10:00:00Z', '5', 5, { kind: 'practice', correct: null }),
    ];
    const recent = recentSessions(events, 3);
    expect(recent.map((session) => session.sessionId)).toEqual(['5', '4', '3'].map(sid));
    expect(recent.map((session) => session.mode)).toEqual(['practice', 'challenge', 'exam']);
    expect(accuracyPercent(recent[2] as (typeof recent)[number])).toBe(68);
    // Sin aciertos registrados no se inventa un porcentaje
    expect(accuracyPercent(recent[0] as (typeof recent)[number])).toBeNull();
  });

  it('una práctica con muestreo dirigido se reconoce por su session_started', () => {
    const events = [
      createEvent(
        'session_started',
        { kind: 'practice', config: { sampling: 'targeted', count: 10 } },
        ctx('2026-10-24T09:00:00Z', '9', 1),
      ),
      ended('2026-10-24T10:00:00Z', '9', 2, { kind: 'practice' }),
      ended('2026-10-23T10:00:00Z', '8', 3, { kind: 'practice' }),
    ];
    expect(recentSessions(events).map((session) => session.mode)).toEqual(['targeted', 'practice']);
  });

  it('dice Hoy, Ayer, el día de la semana en la última semana y después la fecha', () => {
    const now = new Date('2026-10-24T18:00:00Z');
    const words = { today: 'Hoy', yesterday: 'Ayer' };
    const tz = 'America/Mexico_City';
    expect(sessionDayLabel('2026-10-24T10:00:00Z', now, tz, words)).toBe('Hoy');
    expect(sessionDayLabel('2026-10-23T23:30:00Z', now, tz, words)).toBe('Ayer');
    // Un martes
    expect(sessionDayLabel('2026-10-20T15:00:00Z', now, tz, words)).toBe('Martes');
    expect(sessionDayLabel('2026-10-10T15:00:00Z', now, tz, words)).toBe('10 de octubre');
  });
});
