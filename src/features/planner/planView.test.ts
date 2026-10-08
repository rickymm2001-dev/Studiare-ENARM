import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import { MAX_NEW_CARDS_PER_DAY } from '@/data/schemas/people';
import { scheduleReview, type QueueCard, type SchedulerConfig } from '@/engines/fsrs';
import { addDays } from '@/engines/studyDay';
import type { DaySummary } from '../home/snapshot';
import {
  buildPlannerView,
  MEASURED_DAYS_NEEDED,
  measuredMinutes,
  PLAN_DAYS,
  PROVISIONAL_MINUTES,
} from './planView';

const NOW = new Date('2026-10-06T15:00:00.000Z');
const TODAY = '2026-10-06';
const DAY = 24 * 60 * 60 * 1000;

const config: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: '2027-09-13',
  timeZone: 'America/Merida',
  thresholds: { ...DEFAULT_THRESHOLDS.fsrs, newCardsPerDay: 20, reviewsPerDay: 200 },
};
const nothingDone = { newCount: 0, reviewCount: 0, noteIds: [] };

const day = (focusMinutes: number): DaySummary => ({
  cards: 0,
  questions: 0,
  focusMinutes,
  xp: 0,
});

/** Una tarjeta ya vista que vence en el número de días indicado, contado desde hoy */
function dueIn(index: number, days: number): QueueCard {
  let state: FsrsCardState = scheduleReview(
    null,
    'good',
    new Date(NOW.getTime() - 40 * DAY),
    config,
  ).state;
  state = { ...state, state: 'review', due: new Date(NOW.getTime() + days * DAY).toISOString() };
  return { cardId: `c${index}`, noteId: `n${index}`, state };
}

const newCards = (count: number, from = 0): QueueCard[] =>
  Array.from({ length: count }, (_, index) => ({
    cardId: `new${from + index}`,
    noteId: `nn${from + index}`,
    state: null,
  }));

const view = (overrides: Partial<Parameters<typeof buildPlannerView>[0]> = {}) =>
  buildPlannerView({
    now: NOW,
    today: TODAY,
    config,
    cards: [],
    reviewedToday: nothingDone,
    activity: {},
    declaredMinutes: null,
    examDate: config.examDate,
    priorityTopics: [],
    ...overrides,
  });

describe('minutos medidos', () => {
  it('toma los días con estudio de las dos últimas semanas y no cuenta hoy', () => {
    const activity = {
      [TODAY]: day(500),
      [addDays(TODAY, -1)]: day(40),
      [addDays(TODAY, -2)]: day(0),
      [addDays(TODAY, -5)]: day(25),
      [addDays(TODAY, -15)]: day(90),
    };
    expect(measuredMinutes(activity, TODAY)).toEqual([40, 25]);
  });
});

describe('plan del día y de la semana', () => {
  it('sin minutos declarados ni días medidos usa el valor inicial y avisa que calibra', () => {
    const result = view({ activity: { [addDays(TODAY, -1)]: day(30) } });
    expect(result.plan.minutesAvailable).toBe(PROVISIONAL_MINUTES);
    expect(result.minutes).toEqual({ kind: 'provisional', measuredDays: 1 });
  });

  it('con minutos declarados y pocos días medidos usa los declarados', () => {
    const result = view({ declaredMinutes: 90 });
    expect(result.plan.minutesAvailable).toBe(90);
    expect(result.minutes).toEqual({
      kind: 'declared',
      minutes: 90,
      measuredDays: 0,
      measuredAverage: null,
    });
  });

  it('sin declarar y con 3 días de estudio usa el promedio real', () => {
    const activity = Object.fromEntries(
      [1, 2, 3].map((back, index) => [addDays(TODAY, -back), day(30 + index * 15)]),
    );
    expect(Object.keys(activity)).toHaveLength(MEASURED_DAYS_NEEDED);
    const result = view({ activity });
    expect(result.minutes).toEqual({ kind: 'measured', days: 3, average: 45 });
    expect(result.plan.minutesAvailable).toBe(45);
  });

  it('lo declarado gana sobre el promedio real, que solo se informa', () => {
    const activity = Object.fromEntries(
      [1, 2, 3].map((back, index) => [addDays(TODAY, -back), day(30 + index * 15)]),
    );
    const result = view({ activity, declaredMinutes: 200 });
    expect(result.plan.minutesAvailable).toBe(200);
    expect(result.minutes).toEqual({
      kind: 'declared',
      minutes: 200,
      measuredDays: 3,
      measuredAverage: 45,
    });
  });

  it('arma 7 días y llena el día con repasos, nuevas y simulador del tema prioritario', () => {
    const cards = [...[0, 1, 2, 3, 4].map((index) => dueIn(index, -1)), ...newCards(10)];
    const result = view({ cards, declaredMinutes: 60, priorityTopics: ['cardiologia'] });
    expect(result.plan.week).toHaveLength(PLAN_DAYS);
    expect(result.plan.today.reviews).toBe(5);
    expect(result.plan.today.newCards).toBe(10);
    expect(result.plan.today.simulatorQuestions).toBeGreaterThan(0);
    expect(result.plan.today.simulatorTopic).toBe('cardiologia');
    expect(result.cardCount).toBe(15);
  });

  it('pasa el límite de preguntas del plan al motor', () => {
    const result = view({ declaredMinutes: 90, questionLimit: { today: 20, perDay: 20 } });
    expect(result.plan.today.simulatorQuestions).toBe(20);
    expect(result.plan.today.simulatorCapped).toBe(true);
  });

  it('descuenta lo que ya repasó hoy y respeta los límites diarios', () => {
    const cards = [...Array.from({ length: 30 }, (_, index) => dueIn(index, -1)), ...newCards(40)];
    const small: SchedulerConfig = {
      ...config,
      thresholds: { ...config.thresholds, reviewsPerDay: 25, newCardsPerDay: 20 },
    };
    const result = view({
      cards,
      config: small,
      declaredMinutes: 240,
      reviewedToday: { newCount: 8, reviewCount: 10, noteIds: [] },
    });
    // 25 de límite menos 10 hechos y 20 nuevas menos 8 hechas
    expect(result.plan.today.reviews).toBe(15);
    expect(result.plan.today.newCards).toBe(12);
    // Mañana ya no se descuenta nada
    expect(result.plan.week[1]?.newCards).toBe(20);
  });
});

describe('sobrecarga', () => {
  const overloaded = () =>
    view({
      cards: [...Array.from({ length: 120 }, (_, index) => dueIn(index, -1)), ...newCards(200)],
      declaredMinutes: 10,
    });

  it('sin límite de nuevas, la propuesta de bajarlas cabe en el ajuste', () => {
    const unlimited = view({
      cards: [...Array.from({ length: 120 }, (_, index) => dueIn(index, -1)), ...newCards(200)],
      declaredMinutes: 10,
      config: { ...config, thresholds: { ...config.thresholds, newCardsPerDay: 100_000 } },
    });
    const reduce = unlimited.plan.warnings[0]?.options.find(
      (option) => option.action === 'reduce_new',
    );
    expect(reduce?.value).toBe(MAX_NEW_CARDS_PER_DAY);
  });

  it('sin límite de nuevas, la propuesta parte del número que el alumno tenía guardado', () => {
    const unlimited = view({
      cards: [...Array.from({ length: 120 }, (_, index) => dueIn(index, -1)), ...newCards(200)],
      declaredMinutes: 10,
      config: { ...config, thresholds: { ...config.thresholds, newCardsPerDay: 100_000 } },
      reduceNewFrom: 20,
    });
    const reduce = unlimited.plan.warnings[0]?.options.find(
      (option) => option.action === 'reduce_new',
    );
    expect(reduce?.value).toBe(10);
  });

  it('avisa con dos opciones y su efecto en minutos al día', () => {
    const [warning] = overloaded().plan.warnings;
    expect(warning?.kind).toBe('overload');
    expect(warning?.availableMinutes).toBe(10);
    const reduce = warning?.options.find((option) => option.action === 'reduce_new');
    const raise = warning?.options.find((option) => option.action === 'increase_minutes');
    // Propone la mitad de las nuevas de hoy
    expect(reduce?.value).toBe(10);
    expect(reduce?.effectMinutesPerDay).toBeGreaterThan(0);
    expect(raise?.value).toBeGreaterThan(10);
    expect(raise?.effectMinutesPerDay).toBeGreaterThan(0);
  });

  it('sin nuevas por día no ofrece bajarlas', () => {
    const none: SchedulerConfig = {
      ...config,
      thresholds: { ...config.thresholds, newCardsPerDay: 0 },
    };
    const result = view({
      config: none,
      cards: Array.from({ length: 400 }, (_, index) => dueIn(index, -1)),
      declaredMinutes: 5,
    });
    const options = result.plan.warnings[0]?.options.map((option) => option.action) ?? [];
    expect(options).toEqual(['increase_minutes']);
  });

  it('con tiempo de sobra no avisa', () => {
    const result = view({
      cards: [dueIn(0, -1), ...newCards(3)],
      declaredMinutes: 120,
    });
    expect(result.plan.warnings).toEqual([]);
  });
});
