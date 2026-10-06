import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import { scheduleReview, type QueueCard, type SchedulerConfig } from '@/engines/fsrs';
import { futureLoad } from './futureLoad';

const NOW = new Date('2026-10-06T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const config: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: null,
  timeZone: 'America/Merida',
  thresholds: { ...DEFAULT_THRESHOLDS.fsrs, newCardsPerDay: 5, reviewsPerDay: 200 },
};
const nothingDone = { newCount: 0, reviewCount: 0, noteIds: [] };

function seen(index: number, dueInDays: number): QueueCard {
  let state: FsrsCardState = scheduleReview(
    null,
    'good',
    new Date(NOW.getTime() - 20 * DAY),
    config,
  ).state;
  state = {
    ...state,
    state: 'review',
    due: new Date(NOW.getTime() + dueInDays * DAY).toISOString(),
  };
  return { cardId: `c${index}`, noteId: `n${index}`, state };
}

const fresh = (count: number): QueueCard[] =>
  Array.from({ length: count }, (_, index) => ({
    cardId: `f${index}`,
    noteId: `nf${index}`,
    state: null,
  }));

const load = (cards: QueueCard[], horizon: 30 | 60 = 30) =>
  futureLoad({ now: NOW, config, cards, reviewedToday: nothingDone, horizon });

describe('carga futura en Progreso (7.1)', () => {
  it('sin tarjetas no hay nada que proyectar', () => {
    const result = load([]);
    expect(result).toMatchObject({
      horizon: 30,
      totalReviews: 0,
      totalNew: 0,
      averageReviews: 0,
      peak: null,
      cardCount: 0,
    });
    expect(result.days).toHaveLength(30);
  });

  it('proyecta 30 o 60 días y los agrupa por semanas de 7', () => {
    const cards = [seen(1, 1), seen(2, 3), ...fresh(12)];
    const month = load(cards, 30);
    const twoMonths = load(cards, 60);
    expect(month.days).toHaveLength(30);
    expect(month.weeks).toHaveLength(5);
    expect(twoMonths.days).toHaveLength(60);
    expect(twoMonths.weeks).toHaveLength(9);
    expect(month.weeks[0]?.start).toBe(month.days[0]?.day);
    expect(month.weeks[1]?.start).toBe(month.days[7]?.day);
    // La primera semana de 60 días es la misma que la de 30
    expect(twoMonths.weeks[0]).toEqual(month.weeks[0]);
  });

  it('las nuevas entran al ritmo del límite diario y el total cuadra con los días', () => {
    const result = load(fresh(12));
    expect(result.days.slice(0, 3).map((day) => day.newCards)).toEqual([5, 5, 2]);
    expect(result.totalNew).toBe(12);
    expect(result.totalReviews).toBe(result.days.reduce((sum, day) => sum + day.reviews, 0));
    expect(result.weeks.reduce((sum, week) => sum + week.reviews, 0)).toBe(result.totalReviews);
    expect(result.weeks.reduce((sum, week) => sum + week.newCards, 0)).toBe(12);
    expect(result.averageReviews).toBeCloseTo(result.totalReviews / 30, 10);
  });

  it('el día más cargado es el que más tarjetas junta', () => {
    const result = load([seen(1, 2), seen(2, 2), seen(3, 2), seen(4, 9)]);
    expect(result.peak?.reviews).toBeGreaterThanOrEqual(3);
    const most = Math.max(...result.days.map((day) => day.reviews + day.newCards));
    expect((result.peak?.reviews ?? 0) + (result.peak?.newCards ?? 0)).toBe(most);
  });

  it('descuenta lo que ya repasó hoy y respeta el límite de repasos', () => {
    const due = Array.from({ length: 10 }, (_, index) => seen(index, -1));
    const limited = futureLoad({
      now: NOW,
      config: { ...config, thresholds: { ...config.thresholds, reviewsPerDay: 6 } },
      cards: due,
      reviewedToday: { newCount: 0, reviewCount: 2, noteIds: [] },
      horizon: 30,
    });
    // Hoy quedan 6 − 2 = 4 repasos aunque venzan 10
    expect(limited.days[0]?.reviews).toBe(4);
  });
});
