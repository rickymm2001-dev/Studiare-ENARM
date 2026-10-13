// Misiones del motor de recompensas. Logros, sus insignias y sus ligas se quitaron en B3 del plan del
// cambio (comentario 14) y con ellos sus pruebas y las misiones de la semana. Quedan el resumen por día
// y las misiones de hoy (4.12).
import fc from 'fast-check';
import { monotonicFactory } from 'ulid';
import { describe, expect, it } from 'vitest';
import { MISSION_TARGETS } from '@/config/rewards';
import { createEvent } from '@/data/events/createEvent';
import type { AppEvent, EventPayload, EventType } from '@/data/schemas/events';
import * as engine from './rewards';
import { buildMissions, dayTotals, missionsFor } from './rewards';

const nextId = monotonicFactory();
const USER = nextId();
const TZ = 'America/Merida';
// 2026-10-08 es jueves. Mérida va seis horas atrás de UTC, así que 15:00 UTC es 9 a. m. local
const THU = '2026-10-08';
const at = (day: string, hour = 15) =>
  new Date(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`);

function make<T extends EventType>(type: T, payload: EventPayload<T>, when: Date): AppEvent {
  return createEvent(type, payload, { userId: USER, tz: TZ, clock: { now: () => when } });
}

const card = (when: Date) =>
  make(
    'card_reviewed',
    {
      cardId: nextId(),
      deckId: nextId(),
      source: 'card',
      rating: 'good',
      confidence: null,
      msToReveal: 2000,
      msToRate: 1500,
      stateBefore: null,
      stateAfter: {
        due: when.toISOString(),
        stability: 1,
        difficulty: 5,
        scheduledDays: 1,
        learningSteps: 0,
        reps: 1,
        lapses: 0,
        state: 'review',
        lastReview: when.toISOString(),
      },
    },
    when,
  );

const answer = (when: Date, correct: boolean) =>
  make(
    'question_answered',
    {
      questionVersionId: nextId(),
      optionVersionId: nextId(),
      correct,
      confidence: null,
      msToAnswer: 30_000,
      changeCount: 0,
      highlightEnabled: false,
    },
    when,
  );

const xp = (when: Date, amount: number) =>
  make('xp_awarded', { amount, reason: 'card_review', sourceEventId: null }, when);

const session = (
  when: Date,
  kind: 'review' | 'practice' | 'exam' | 'challenge',
  minutes: number,
  reason: 'completed' | 'abandoned' = 'completed',
) =>
  make(
    'session_ended',
    { kind, reason, items: 1, correct: null, durationMs: minutes * 60000, xp: 0 },
    when,
  );

const pomodoro = (when: Date, minutes: number) =>
  make('pomodoro_completed', { phase: 'focus', plannedMinutes: 25, actualMinutes: minutes }, when);

describe('resumen de la bitácora por día', () => {
  it('cuenta tarjetas y preguntas en el día de estudio, que corta a las 4 a. m.', () => {
    const totals = dayTotals([
      card(at(THU)),
      card(at(THU)),
      answer(at(THU), true),
      answer(at(THU), false),
      // 9:59 UTC del viernes son las 3:59 a. m. en Mérida, todavía el jueves
      card(new Date('2026-10-09T09:59:00.000Z')),
      card(new Date('2026-10-09T10:01:00.000Z')),
    ]);
    expect(totals.get(THU)).toEqual({ cards: 3, questions: 2, minutes: 0 });
    expect(totals.get('2026-10-09')).toMatchObject({ cards: 1 });
  });

  it('los minutos son el mayor entre las sesiones y el Pomodoro, no la suma', () => {
    const totals = dayTotals([session(at(THU), 'review', 20), pomodoro(at(THU), 25)]);
    expect(totals.get(THU)?.minutes).toBe(25);
    expect(
      dayTotals([session(at(THU), 'review', 30), pomodoro(at(THU), 10)]).get(THU)?.minutes,
    ).toBe(30);
  });

  it('solo cuenta el enfoque del Pomodoro y no los descansos', () => {
    const rest = make(
      'pomodoro_completed',
      { phase: 'short_break', plannedMinutes: 5, actualMinutes: 5 },
      at(THU),
    );
    expect(dayTotals([rest]).get(THU)).toBeUndefined();
  });

  it('una sesión abandonada también suma sus minutos y lo que no es estudio no cuenta', () => {
    const totals = dayTotals([
      session(at(THU), 'exam', 12, 'abandoned'),
      make(
        'deck_imported',
        { deckId: nextId(), format: 'csv', notes: 3, cards: 3, media: 0, warnings: [] },
        at(THU),
      ),
    ]);
    expect(totals.get(THU)).toEqual({ cards: 0, questions: 0, minutes: 12 });
    // El XP no es una misión de hoy, así que un día con solo XP no aparece
    expect(dayTotals([xp(at(THU), 30)]).get(THU)).toBeUndefined();
  });
});

describe('misiones de hoy', () => {
  it('miran el día en curso', () => {
    const events = [
      ...Array.from({ length: MISSION_TARGETS.dailyCards }, () => card(at(THU))),
      ...Array.from({ length: 3 }, () => answer(at(THU), true)),
      // Ayer no cuenta
      ...Array.from({ length: 50 }, () => card(at('2026-10-07'))),
    ];
    expect(
      missionsFor(dayTotals(events), THU).map((mission) => [
        mission.key,
        mission.current,
        mission.done,
      ]),
    ).toEqual([
      ['dailyCards', MISSION_TARGETS.dailyCards, true],
      ['dailyQuestions', 3, false],
      ['dailyMinutes', 0, false],
    ]);
  });

  it('sin actividad las tres están en cero y sin cumplir', () => {
    const missions = missionsFor(new Map(), THU);
    expect(missions).toHaveLength(3);
    expect(missions.every((mission) => mission.current === 0 && !mission.done)).toBe(true);
  });
});

describe('misiones desde la bitácora completa', () => {
  it('toma el día de estudio en la zona del alumno, que corta a las 4 a. m.', () => {
    // 9:30 UTC del viernes son las 3:30 a. m. en Mérida, todavía el jueves
    const lateThursday = new Date('2026-10-09T09:30:00.000Z');
    const events = Array.from({ length: MISSION_TARGETS.dailyCards }, () => card(lateThursday));
    const thursday = buildMissions({ events, now: lateThursday, timeZone: TZ });
    expect(thursday[0]).toMatchObject({ key: 'dailyCards', done: true });
    // A las 4:30 a. m. del viernes ya es otro día y la misión empieza de cero
    const friday = buildMissions({
      events,
      now: new Date('2026-10-09T10:30:00.000Z'),
      timeZone: TZ,
    });
    expect(friday[0]).toMatchObject({ key: 'dailyCards', current: 0, done: false });
  });

  it('sin bitácora quedan las tres de hoy en cero', () => {
    const missions = buildMissions({ events: [], now: at(THU), timeZone: TZ });
    expect(missions.map((mission) => mission.key)).toEqual([
      'dailyCards',
      'dailyQuestions',
      'dailyMinutes',
    ]);
    expect(missions.every((mission) => mission.current === 0)).toBe(true);
  });

  it('propiedad. la misión de tarjetas se cumple justo al llegar al objetivo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), (count) => {
        const events = Array.from({ length: count }, () => card(at(THU)));
        const [cards] = buildMissions({ events, now: at(THU), timeZone: TZ });
        return cards?.current === count && cards.done === count >= MISSION_TARGETS.dailyCards;
      }),
      { numRuns: 40 },
    );
  });

  it('el motor ya no calcula insignias, ligas ni misiones de la semana (comentario 14)', () => {
    expect(Object.keys(engine).sort()).toEqual(['buildMissions', 'dayTotals', 'missionsFor']);
  });
});
