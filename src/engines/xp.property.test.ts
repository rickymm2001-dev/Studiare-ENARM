// XP y niveles (9.5), con propiedades de fast-check y la simulación del alumno constante
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  awardXp,
  DEFAULT_LEVEL_CURVE,
  isVolumeAward,
  levelFor,
  streakMultiplier,
  XP_RULES,
  xpForLevel,
  type XpActivity,
  type XpAward,
} from './xp';

const activityArbitrary: fc.Arbitrary<XpActivity> = fc.oneof(
  fc.record({
    kind: fc.constant('mcq' as const),
    correct: fc.boolean(),
    physicianDifficulty: fc.integer({ min: 1, max: 5 }),
    eventId: fc.constant('e'),
  }),
  fc.record({
    kind: fc.constant('card' as const),
    msToRate: fc.integer({ min: 0, max: 60000 }),
    eventId: fc.constant('e'),
  }),
  fc.record({ kind: fc.constant('daily_goal' as const), eventId: fc.constant(null) }),
  fc.record({ kind: fc.constant('challenge' as const), eventId: fc.constant(null) }),
);

const total = (awards: readonly XpAward[]) => awards.reduce((sum, award) => sum + award.amount, 0);

describe('propiedades del XP', () => {
  it('nunca da XP negativo y cada premio tiene motivo', () => {
    fc.assert(
      fc.property(
        activityArbitrary,
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 3000 }),
        (activity, streakDays, volumeXpToday) => {
          const awards = awardXp({ activity, streakDays, volumeXpToday });
          for (const award of awards) {
            expect(award.amount).toBeGreaterThan(0);
            expect(Number.isInteger(award.amount)).toBe(true);
            expect(award.reason).toBeTruthy();
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('el volumen nunca pasa el tope diario', () => {
    fc.assert(
      fc.property(
        fc.array(activityArbitrary, { maxLength: 400 }),
        fc.integer({ min: 0, max: 100 }),
        (activities, streakDays) => {
          let volume = 0;
          for (const activity of activities) {
            const awards = awardXp({ activity, streakDays, volumeXpToday: volume });
            volume += total(awards.filter(isVolumeAward));
          }
          expect(volume).toBeLessThanOrEqual(XP_RULES.dailyVolumeCap);
        },
      ),
    );
  });

  it('una tarjeta da lo mismo sin importar la calificación y nada si dura menos de 1 segundo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 60000 }),
        fc.integer({ min: 1000, max: 60000 }),
        (a, b) => {
          expect(
            awardXp({
              activity: { kind: 'card', msToRate: a, eventId: 'x' },
              streakDays: 0,
              volumeXpToday: 0,
            }),
          ).toEqual(
            awardXp({
              activity: { kind: 'card', msToRate: b, eventId: 'x' },
              streakDays: 0,
              volumeXpToday: 0,
            }),
          );
        },
      ),
    );
    expect(
      awardXp({
        activity: { kind: 'card', msToRate: 999, eventId: 'x' },
        streakDays: 10,
        volumeXpToday: 0,
      }),
    ).toEqual([]);
  });

  it('el multiplicador por racha crece y se topa en 1.5', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 }), (a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        expect(streakMultiplier(low)).toBeLessThanOrEqual(streakMultiplier(high));
        expect(streakMultiplier(high)).toBeLessThanOrEqual(1.5);
        expect(streakMultiplier(low)).toBeGreaterThanOrEqual(1);
      }),
    );
  });

  it('un acierto vale más con más dificultad y siempre más que un error', () => {
    const correct = (level: number) =>
      total(
        awardXp({
          activity: { kind: 'mcq', correct: true, physicianDifficulty: level, eventId: 'x' },
          streakDays: 0,
          volumeXpToday: 0,
        }),
      );
    expect([1, 2, 3, 4, 5].map(correct)).toEqual([10, 15, 20, 25, 30]);
    expect(
      total(
        awardXp({
          activity: { kind: 'mcq', correct: false, physicianDifficulty: 5, eventId: 'x' },
          streakDays: 0,
          volumeXpToday: 0,
        }),
      ),
    ).toBe(2);
  });

  it('el nivel crece con el XP y el título sigue los tramos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        (a, b) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          expect(levelFor(low).level).toBeLessThanOrEqual(levelFor(high).level);
          const info = levelFor(high);
          expect(info.xpIntoLevel).toBeGreaterThanOrEqual(0);
          expect(info.xpIntoLevel).toBeLessThan(info.xpForNext);
        },
      ),
    );
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'R0' });
    expect(levelFor(xpForLevel(3)).title).toBe('R1');
    expect(levelFor(xpForLevel(14)).title).toBe('Jefe de residentes');
    expect(levelFor(xpForLevel(33)).title).toBe('Adscritosaurio');
    expect(levelFor(xpForLevel(60)).title).toBe('Eminencia');
  });
});

describe('curva de niveles con un alumno constante simulado (9.5)', () => {
  /** XP de un día de un alumno constante. 100 tarjetas, 30 preguntas con 65% de aciertos y meta */
  function constantDay(streakDays: number): number {
    let volume = 0;
    let dayTotal = 0;
    const add = (activity: XpActivity) => {
      const awards = awardXp({ activity, streakDays, volumeXpToday: volume });
      volume += total(awards.filter(isVolumeAward));
      dayTotal += total(awards);
    };
    for (let card = 0; card < 100; card += 1) add({ kind: 'card', msToRate: 8000, eventId: 'c' });
    for (let question = 0; question < 30; question += 1) {
      add({ kind: 'mcq', correct: question % 20 < 13, physicianDifficulty: 3, eventId: 'q' });
    }
    add({ kind: 'daily_goal', eventId: null });
    return dayTotal;
  }

  it('sube unos 2 niveles la primera semana y 1 cada 2 semanas a los 3 meses', () => {
    const totals: number[] = [0];
    for (let day = 1; day <= 98; day += 1)
      totals.push((totals[day - 1] as number) + constantDay(day));
    const levelAt = (day: number) => levelFor(totals[day] as number).level;
    const firstWeek = levelAt(7) - levelAt(0);
    const perWeekAtThreeMonths = (levelAt(98) - levelAt(70)) / 4;
    expect(firstWeek).toBeGreaterThanOrEqual(2);
    expect(firstWeek).toBeLessThanOrEqual(3);
    expect(perWeekAtThreeMonths).toBeGreaterThanOrEqual(0.35);
    expect(perWeekAtThreeMonths).toBeLessThanOrEqual(0.75);
    expect(DEFAULT_LEVEL_CURVE).toEqual({ a: 1700, p: 1.7 });
  });
});
