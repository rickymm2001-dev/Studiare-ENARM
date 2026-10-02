// Racha con días de gracia (9.4), con propiedades de fast-check
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { computeStreak, goalMet, type DayActivity, type StreakGoal } from './streak';
import { addDays } from './studyDay';

const thresholds = DEFAULT_THRESHOLDS.streak;
const goal: StreakGoal = { metric: 'cards', value: 20 };
const START = '2026-09-01';

const met: DayActivity = { cards: 25, questions: 0, focusMinutes: 0 };
const missed: DayActivity = { cards: 5, questions: 0, focusMinutes: 0 };

function history(pattern: readonly boolean[]): Record<string, DayActivity> {
  return Object.fromEntries(
    pattern.map((isMet, index) => [addDays(START, index), isMet ? met : missed]),
  );
}

describe('propiedades de la racha', () => {
  it('la racha actual nunca supera el récord y los congeladores quedan entre 0 y 2', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 120 }), (pattern) => {
        const today = addDays(START, pattern.length - 1);
        const state = computeStreak({ activity: history(pattern), goal, today, thresholds });
        expect(state.current).toBeLessThanOrEqual(state.best);
        expect(state.current).toBeGreaterThanOrEqual(0);
        expect(state.freezesAvailable).toBeGreaterThanOrEqual(0);
        expect(state.freezesAvailable).toBeLessThanOrEqual(2);
        expect(state.closedDays).toHaveLength(pattern.length - 1);
        expect(state.best).toBeLessThanOrEqual(pattern.filter(Boolean).length);
      }),
      { numRuns: 500 },
    );
  });

  it('cumplir todos los días da una racha igual al número de días', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (days) => {
        const pattern = Array.from({ length: days }, () => true);
        const state = computeStreak({
          activity: history(pattern),
          goal,
          today: addDays(START, days - 1),
          thresholds,
        });
        expect(state).toMatchObject({ current: days, best: days, freezeDays: [] });
        expect(state.freezesAvailable).toBe(Math.min(2, Math.floor(days / 7)));
      }),
    );
  });

  it('cumplir hoy suma uno a una racha viva', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 60 }), (pattern) => {
        const today = addDays(START, pattern.length);
        const withoutToday = computeStreak({ activity: history(pattern), goal, today, thresholds });
        const withToday = computeStreak({
          activity: { ...history(pattern), [today]: met },
          goal,
          today,
          thresholds,
        });
        expect(withToday.current).toBe(withoutToday.current + 1);
        expect(withToday.todayMet).toBe(true);
        expect(withoutToday.todayMet).toBe(false);
      }),
    );
  });
});

describe('casos de la racha', () => {
  it('un congelador cubre un día perdido después de 7 días', () => {
    const pattern = [...Array.from({ length: 7 }, () => true), false, true, true];
    const state = computeStreak({
      activity: history(pattern),
      goal,
      today: addDays(START, 9),
      thresholds,
    });
    expect(state).toMatchObject({
      current: 9,
      best: 9,
      freezesAvailable: 0,
      freezeDays: [addDays(START, 7)],
    });
    expect(state.closedDays.find((day) => day.day === addDays(START, 7))).toEqual({
      day: addDays(START, 7),
      goalMet: false,
      freezeUsed: true,
    });
  });

  it('sin congelador la racha se rompe', () => {
    const pattern = [true, true, true, false, true];
    const state = computeStreak({
      activity: history(pattern),
      goal,
      today: addDays(START, 4),
      thresholds,
    });
    expect(state).toMatchObject({ current: 1, best: 3 });
  });

  it('un día sin registro cuenta como perdido y la actividad futura no cuenta', () => {
    const activity = { [START]: met, [addDays(START, 2)]: met, [addDays(START, 10)]: met };
    const state = computeStreak({ activity, goal, today: addDays(START, 2), thresholds });
    expect(state).toMatchObject({ current: 1, best: 1 });
    expect(computeStreak({ activity: {}, goal, today: START, thresholds })).toMatchObject({
      current: 0,
      best: 0,
    });
  });

  it('la meta puede ser de preguntas o de minutos', () => {
    expect(
      goalMet({ cards: 0, questions: 10, focusMinutes: 0 }, { metric: 'questions', value: 10 }),
    ).toBe(true);
    expect(
      goalMet({ cards: 0, questions: 0, focusMinutes: 14 }, { metric: 'focusMinutes', value: 15 }),
    ).toBe(false);
    expect(goalMet(undefined, goal)).toBe(false);
  });
});
