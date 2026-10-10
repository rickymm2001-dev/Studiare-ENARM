import fc from 'fast-check';
import { monotonicFactory } from 'ulid';
import { describe, expect, it } from 'vitest';
import { LEAGUES, MISSION_TARGETS } from '@/config/rewards';
import { createEvent } from '@/data/events/createEvent';
import type { AppEvent, EventPayload, EventType } from '@/data/schemas/events';
import {
  badgeTierKey,
  badgesFor,
  buildRewards,
  dayTotals,
  earnedBadgeKeys,
  isStudyDay,
  leagueFor,
  leagueOfXp,
  missionsFor,
  unseenBadgeTiers,
} from './rewards';

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
  it('cuenta tarjetas, preguntas, aciertos y XP en el día de estudio, que corta a las 4 a. m.', () => {
    const totals = dayTotals([
      card(at(THU)),
      card(at(THU)),
      answer(at(THU), true),
      answer(at(THU), false),
      xp(at(THU), 30),
      // 9:59 UTC del viernes son las 3:59 a. m. en Mérida, todavía el jueves
      card(new Date('2026-10-09T09:59:00.000Z')),
      card(new Date('2026-10-09T10:01:00.000Z')),
    ]);
    expect(totals.get(THU)).toMatchObject({ cards: 3, questions: 2, correct: 1, xp: 30 });
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

  it('cuenta exámenes y duelos terminados, no los abandonados', () => {
    const totals = dayTotals([
      session(at(THU), 'exam', 60),
      session(at(THU), 'exam', 5, 'abandoned'),
      session(at(THU), 'challenge', 8),
    ]);
    expect(totals.get(THU)).toMatchObject({ exams: 1, duels: 1 });
  });

  it('cuenta importaciones, señales atendidas y tarjetas de IA aprobadas', () => {
    const totals = dayTotals([
      make(
        'deck_imported',
        { deckId: nextId(), format: 'csv', notes: 3, cards: 3, media: 0, warnings: [] },
        at(THU),
      ),
      make('card_controversy_resolved', { noteId: nextId(), resolution: 'verified' }, at(THU)),
      make('ai_artifact_approved', { artifactId: nextId(), kind: 'flashcard' }, at(THU)),
      make('ai_artifact_approved', { artifactId: nextId(), kind: 'weekly_report' }, at(THU)),
    ]);
    expect(totals.get(THU)).toMatchObject({ imports: 1, verifications: 1, aiCards: 1 });
  });

  it('un día solo cuenta como de estudio con algo de actividad', () => {
    expect(isStudyDay(undefined)).toBe(false);
    expect(isStudyDay(dayTotals([xp(at(THU), 5)]).get(THU))).toBe(false);
    expect(isStudyDay(dayTotals([card(at(THU))]).get(THU))).toBe(true);
    expect(isStudyDay(dayTotals([session(at(THU), 'review', 6)]).get(THU))).toBe(true);
  });
});

describe('misiones', () => {
  it('las del día miran el día en curso', () => {
    const events = [
      ...Array.from({ length: MISSION_TARGETS.dailyCards }, () => card(at(THU))),
      ...Array.from({ length: 3 }, () => answer(at(THU), true)),
      // Ayer no cuenta
      ...Array.from({ length: 50 }, () => card(at('2026-10-07'))),
    ];
    const { daily } = missionsFor(dayTotals(events), THU);
    expect(daily.map((mission) => [mission.key, mission.current, mission.done])).toEqual([
      ['dailyCards', MISSION_TARGETS.dailyCards, true],
      ['dailyQuestions', 3, false],
      ['dailyMinutes', 0, false],
    ]);
  });

  it('las de la semana van del lunes al día de hoy', () => {
    // El lunes 5, martes 6 y jueves 8 hubo estudio. El domingo anterior ya es otra semana
    const events = [
      card(at('2026-10-04')),
      card(at('2026-10-05')),
      card(at('2026-10-06')),
      card(at(THU)),
      xp(at('2026-10-04'), 900),
      xp(at('2026-10-05'), 200),
      xp(at(THU), 300),
    ];
    const { weekly } = missionsFor(dayTotals(events), THU);
    const byKey = Object.fromEntries(weekly.map((mission) => [mission.key, mission]));
    expect(byKey.weeklyDays).toMatchObject({ current: 3, done: false });
    expect(byKey.weeklyXp).toMatchObject({
      current: 500,
      target: MISSION_TARGETS.weeklyXp,
      done: false,
    });
  });

  it('completa la de XP al llegar al objetivo', () => {
    const { weekly } = missionsFor(dayTotals([xp(at(THU), MISSION_TARGETS.weeklyXp)]), THU);
    expect(weekly.find((mission) => mission.key === 'weeklyXp')?.done).toBe(true);
  });

  it('los aciertos de la semana muestran calibrando hasta tener suficientes preguntas', () => {
    const few = Array.from({ length: 10 }, () => answer(at(THU), true));
    const { weekly } = missionsFor(dayTotals(few), THU);
    const accuracy = weekly.find((mission) => mission.key === 'weeklyAccuracy');
    expect(accuracy?.calibrating).toEqual({
      have: 10,
      need: MISSION_TARGETS.weeklyAccuracyMinQuestions,
    });
    expect(accuracy?.done).toBe(false);
  });

  it('los aciertos de la semana se miden con las preguntas suficientes', () => {
    const need = MISSION_TARGETS.weeklyAccuracyMinQuestions;
    const events = Array.from({ length: need }, (_, index) => answer(at(THU), index < need * 0.8));
    const accuracy = missionsFor(dayTotals(events), THU).weekly.find(
      (mission) => mission.key === 'weeklyAccuracy',
    );
    expect(accuracy?.calibrating).toBeNull();
    expect(accuracy).toMatchObject({ current: 80, done: true });
    const bad = Array.from({ length: need }, (_, index) => answer(at(THU), index < need * 0.5));
    const poor = missionsFor(dayTotals(bad), THU).weekly.find(
      (mission) => mission.key === 'weeklyAccuracy',
    );
    expect(poor).toMatchObject({ current: 50, done: false, calibrating: null });
  });

  it('sin actividad todas están en cero y ninguna calibra sin motivo', () => {
    const { daily, weekly } = missionsFor(new Map(), THU);
    expect([...daily, ...weekly].every((mission) => mission.current === 0 && !mission.done)).toBe(
      true,
    );
    expect(weekly.find((mission) => mission.key === 'weeklyAccuracy')?.calibrating).toEqual({
      have: 0,
      need: MISSION_TARGETS.weeklyAccuracyMinQuestions,
    });
  });
});

describe('insignias', () => {
  const byFamily = (events: AppEvent[], streakBest = 0) =>
    Object.fromEntries(
      badgesFor(dayTotals(events), streakBest).map((badge) => [badge.family, badge]),
    );

  it('sin actividad no hay niveles y el siguiente es el primero', () => {
    const badges = byFamily([]);
    expect(badges.reviews).toMatchObject({ current: 0, level: 0 });
    expect(badges.reviews?.next?.threshold).toBe(100);
  });

  it('gana el nivel al cruzar el umbral y guarda el primer día en que lo cruzó', () => {
    const events = [
      ...Array.from({ length: 60 }, () => card(at('2026-10-05'))),
      ...Array.from({ length: 60 }, () => card(at('2026-10-06'))),
    ];
    const reviews = byFamily(events).reviews;
    expect(reviews).toMatchObject({ current: 120, level: 1 });
    expect(reviews?.tiers[0]).toMatchObject({ earned: true, earnedOn: '2026-10-06' });
    expect(reviews?.next).toMatchObject({
      tier: 2,
      threshold: 1000,
      earned: false,
      earnedOn: null,
    });
  });

  it('con todos los niveles ganados ya no hay siguiente', () => {
    const events = Array.from({ length: 1 }, () =>
      make(
        'deck_imported',
        { deckId: nextId(), format: 'xlsx', notes: 1, cards: 1, media: 0, warnings: [] },
        at(THU),
      ),
    );
    const imports = byFamily(events).imports;
    expect(imports?.level).toBe(1);
    expect(imports?.next).toBeNull();
  });

  it('la racha usa su mejor valor y no sabe de qué día', () => {
    const streak = byFamily([], 8).streak;
    expect(streak?.level).toBe(2);
    expect(streak?.tiers.every((tier) => tier.earnedOn === null)).toBe(true);
    expect(streak?.next?.threshold).toBe(30);
  });

  it('el nivel sale del XP acumulado', () => {
    const level = byFamily([xp(at('2026-10-06'), 10_000), xp(at(THU), 10_000)]).level;
    expect(level?.current).toBe(5);
    expect(level?.level).toBe(2);
    // El nivel 3 ya se tenía con los primeros 10,000 y el 5 se alcanzó con los segundos
    expect(level?.tiers.map((tier) => tier.earnedOn)).toEqual([
      '2026-10-06',
      THU,
      null,
      null,
      null,
    ]);
  });

  it('un examen terminado gana la primera insignia de exámenes y uno abandonado no', () => {
    expect(byFamily([session(at(THU), 'exam', 60)]).exams?.level).toBe(1);
    expect(byFamily([session(at(THU), 'exam', 5, 'abandoned')]).exams?.level).toBe(0);
  });

  it('las fechas ganadas nunca retroceden de un nivel al siguiente', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 40 }), { minLength: 1, maxLength: 12 }),
        (counts) => {
          const events = counts.flatMap((count, index) =>
            Array.from({ length: count * 10 }, () =>
              card(at(`2026-09-${String(10 + index).padStart(2, '0')}`)),
            ),
          );
          const reviews = byFamily(events).reviews;
          const dates = (reviews?.tiers ?? []).flatMap((tier) =>
            tier.earnedOn ? [tier.earnedOn] : [],
          );
          expect(dates).toEqual([...dates].sort());
          // Un nivel ganado implica todos los anteriores
          const flags = (reviews?.tiers ?? []).map((tier) => tier.earned);
          expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
        },
      ),
      { numRuns: 60 },
    );
  }, 30_000);
});

describe('avisos de insignias', () => {
  const reviewsOf = (count: number) =>
    badgesFor(dayTotals(Array.from({ length: count }, () => card(at('2026-10-06')))), 0);

  it('sin actividad no hay niveles ganados ni nada que avisar', () => {
    const badges = reviewsOf(0);
    expect(earnedBadgeKeys(badges)).toEqual([]);
    expect(unseenBadgeTiers(badges, new Set())).toEqual([]);
  });

  it('cada nivel ganado tiene su llave y las llaves no se repiten', () => {
    const keys = earnedBadgeKeys(reviewsOf(1200));
    expect(keys).toContain(badgeTierKey('reviews', 1));
    expect(keys).toContain(badgeTierKey('reviews', 2));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('avisa solo de los niveles ganados que no se han visto', () => {
    const badges = reviewsOf(1200);
    const seen = new Set([badgeTierKey('reviews', 1)]);
    expect(unseenBadgeTiers(badges, seen)).toEqual([{ family: 'reviews', tier: 2 }]);
  });

  it('cuando ya vio todo lo ganado no hay aviso, y un nivel nuevo sí lo provoca', () => {
    const before = reviewsOf(120);
    const seen = new Set(earnedBadgeKeys(before));
    expect(unseenBadgeTiers(before, seen)).toEqual([]);
    expect(unseenBadgeTiers(reviewsOf(1200), seen)).toEqual([{ family: 'reviews', tier: 2 }]);
  });

  it('la racha también avisa, aunque no tenga un día de logro', () => {
    const badges = badgesFor(dayTotals([]), 7);
    const unseen = unseenBadgeTiers(badges, new Set());
    expect(unseen.some((item) => item.family === 'streak')).toBe(true);
  });

  it('propiedad. lo no visto nunca incluye algo ya visto y lo visto cubre todo lo ganado', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 12_000 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 5 }),
        (reviews, streak, keep) => {
          const badges = badgesFor(
            dayTotals(
              Array.from({ length: Math.min(reviews, 1500) }, () => card(at('2026-10-06'))),
            ),
            streak,
          );
          const all = earnedBadgeKeys(badges);
          const seen = new Set(all.slice(0, keep));
          const unseen = unseenBadgeTiers(badges, seen).map((item) =>
            badgeTierKey(item.family, item.tier),
          );
          return (
            unseen.every((key) => !seen.has(key)) &&
            [...seen, ...unseen].sort().join() === [...all].sort().join()
          );
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('liga', () => {
  const week = (xpByDay: Record<string, number>) =>
    dayTotals(Object.entries(xpByDay).map(([day, amount]) => xp(at(day), amount)));

  it('cada liga empieza en su XP y la más baja es la de partida', () => {
    for (const league of LEAGUES) expect(leagueOfXp(league.fromXp)).toBe(league.key);
    expect(leagueOfXp(0)).toBe('bronze');
    expect(leagueOfXp(1_000_000)).toBe('diamond');
    expect(leagueOfXp(LEAGUES[2].fromXp - 1)).toBe('silver');
  });

  it('dice cuánto falta para la siguiente', () => {
    const status = leagueFor(week({ [THU]: 200 }), THU);
    expect(status).toMatchObject({ current: 'silver', weeklyXp: 200 });
    expect(status.next).toEqual({ key: 'gold', missingXp: LEAGUES[2].fromXp - 200 });
  });

  it('en la más alta ya no hay siguiente', () => {
    expect(leagueFor(week({ [THU]: 5000 }), THU).next).toBeNull();
  });

  it('compara con la semana anterior', () => {
    const up = leagueFor(week({ '2026-10-01': 100, [THU]: 450 }), THU);
    expect(up).toMatchObject({ previous: 'bronze', current: 'gold', movement: 'up' });
    const down = leagueFor(week({ '2026-10-01': 800, [THU]: 20 }), THU);
    expect(down).toMatchObject({ previous: 'sapphire', current: 'bronze', movement: 'down' });
    const same = leagueFor(week({ '2026-10-01': 200, [THU]: 210 }), THU);
    expect(same.movement).toBe('same');
  });

  it('sin actividad la semana anterior no hay movimiento', () => {
    const status = leagueFor(week({ [THU]: 300 }), THU);
    expect(status.previous).toBeNull();
    expect(status.movement).toBeNull();
  });

  it('la mejor liga recorre todas las semanas', () => {
    const status = leagueFor(week({ '2026-09-01': 1200, [THU]: 10 }), THU);
    expect(status).toMatchObject({ current: 'bronze', best: 'ruby' });
  });

  it('el domingo todavía es de la semana que empezó el lunes anterior', () => {
    // 2026-10-11 es domingo y 2026-10-12 lunes
    const data = week({ '2026-10-06': 500, '2026-10-11': 100 });
    expect(leagueFor(data, '2026-10-11').weeklyXp).toBe(600);
    expect(leagueFor(data, '2026-10-12').weeklyXp).toBe(0);
  });
});

describe('todo junto', () => {
  it('arma las misiones, las insignias y la liga desde la bitácora', () => {
    const events = [...Array.from({ length: 120 }, () => card(at(THU))), xp(at(THU), 250)];
    const rewards = buildRewards({ events, now: at(THU), timeZone: TZ, streakBest: 4 });
    expect(rewards.missions.daily[0]).toMatchObject({ key: 'dailyCards', done: true });
    expect(rewards.league.current).toBe('silver');
    expect(rewards.badges.find((badge) => badge.family === 'reviews')?.level).toBe(1);
    expect(rewards.badges.find((badge) => badge.family === 'streak')?.level).toBe(1);
    expect(rewards.recentBadges.map((badge) => badge.family)).toContain('reviews');
    expect(
      rewards.recentBadges.every((badge) => badge.earnedOn >= '2026-10-08' || badge.earnedOn),
    ).toBe(true);
  });

  it('ordena las insignias de la ganada más recientemente a la más antigua', () => {
    const events = [
      ...Array.from({ length: 100 }, () => card(at('2026-10-05'))),
      ...Array.from({ length: 100 }, () => answer(at('2026-10-07'), true)),
    ];
    const rewards = buildRewards({ events, now: at(THU), timeZone: TZ, streakBest: 0 });
    expect(rewards.recentBadges.map((badge) => badge.family)).toEqual(['answers', 'reviews']);
  });

  it('sin bitácora todo queda en cero', () => {
    const rewards = buildRewards({ events: [], now: at(THU), timeZone: TZ, streakBest: 0 });
    expect(rewards.recentBadges).toEqual([]);
    expect(rewards.league).toMatchObject({ current: 'bronze', weeklyXp: 0, best: 'bronze' });
  });
});
