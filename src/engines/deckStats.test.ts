import { describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import { activeDeckStates, deckStats, INTERVAL_BUCKETS, MIN_FOR_RETENTION } from './deckStats';

const TZ = 'America/Merida';
/** 9:00 a. m. en Mérida. El día de estudio empieza a las 10:00 UTC del mismo día */
const NOW = new Date('2026-10-08T15:00:00.000Z');
const DAY = 86_400_000;

function review(scheduledDays: number, dueOffsetDays: number, extra: Partial<FsrsCardState> = {}) {
  const due = new Date(NOW.getTime() + dueOffsetDays * DAY).toISOString();
  return {
    due,
    stability: Math.max(1, scheduledDays),
    difficulty: 5,
    scheduledDays,
    learningSteps: 0,
    reps: 4,
    lapses: 0,
    state: 'review',
    lastReview: new Date(NOW.getTime() + (dueOffsetDays - scheduledDays) * DAY).toISOString(),
    ...extra,
  } satisfies FsrsCardState;
}

describe('deckStats', () => {
  it('cuenta por estado y separa las nuevas, que no tienen estado o lo tienen en new', () => {
    const stats = deckStats({
      states: [
        null,
        review(0, 0, { state: 'new' }),
        review(0, 0, { state: 'learning' }),
        review(0, 0, { state: 'relearning', scheduledDays: 1 }),
        review(10, 5),
      ],
      now: NOW,
      timeZone: TZ,
    });
    expect(stats).toMatchObject({ total: 5, fresh: 2, learning: 2, review: 1 });
  });

  it('separa lo que toca hoy de lo atrasado, como el resto de la app', () => {
    const stats = deckStats({
      states: [
        review(10, -3), // atrasada
        review(10, 0), // vence a las 9 a. m., hoy
        review(10, 0.5), // vence hoy más tarde... ya es de mañana si pasa del fin del día
        review(10, 4),
      ],
      now: NOW,
      timeZone: TZ,
    });
    expect(stats.overdue).toBe(1);
    expect(stats.dueToday).toBeGreaterThanOrEqual(2);
    expect(stats.dueToday).toBeLessThanOrEqual(3);
  });

  it('reparte por cubetas de intervalo y cuenta como maduras las de 21 días o más', () => {
    const days = [0.5, 3, 10, 30, 90, 400];
    const stats = deckStats({
      states: days.map((d) => review(d, 3)),
      now: NOW,
      timeZone: TZ,
    });
    for (const bucket of INTERVAL_BUCKETS) expect(stats.intervals[bucket.key]).toBe(1);
    expect(stats.mature).toBe(3);
  });

  it('con pocas tarjetas en repaso la retención calibra y dice cuántas faltan', () => {
    const few = deckStats({
      states: Array.from({ length: 5 }, () => review(10, 3)),
      now: NOW,
      timeZone: TZ,
    });
    expect(few.retention).toBeNull();
    expect(few.retentionNeeded).toBe(MIN_FOR_RETENTION - 5);
  });

  it('con suficientes tarjetas da una retención entre 0 y 1, más alta si vencen más tarde', () => {
    const early = deckStats({
      states: Array.from({ length: MIN_FOR_RETENTION }, () => review(30, 25)),
      now: NOW,
      timeZone: TZ,
    });
    const late = deckStats({
      states: Array.from({ length: MIN_FOR_RETENTION }, () => review(30, -25)),
      now: NOW,
      timeZone: TZ,
    });
    expect(early.retention).not.toBeNull();
    expect(late.retention).not.toBeNull();
    expect(early.retention as number).toBeGreaterThan(late.retention as number);
    expect(early.retention as number).toBeLessThanOrEqual(1);
    expect(late.retention as number).toBeGreaterThanOrEqual(0);
    expect(early.retentionNeeded).toBe(0);
  });

  it('un mazo vacío da ceros y no rompe', () => {
    const stats = deckStats({ states: [], now: NOW, timeZone: TZ });
    expect(stats.total).toBe(0);
    expect(stats.retention).toBeNull();
    expect(Object.values(stats.intervals).every((count) => count === 0)).toBe(true);
  });

  it('una fecha ilegible no cuenta como atrasada ni rompe el resto', () => {
    const broken = review(10, 1, { due: 'no-es-fecha' });
    const stats = deckStats({ states: [broken], now: NOW, timeZone: TZ });
    expect(stats.overdue).toBe(0);
    expect(stats.review).toBe(1);
  });
});

describe('activeDeckStates', () => {
  it('deja fuera las tarjetas suspendidas, que Repasar no ofrece, y marca como nueva la que no tiene estado', () => {
    const states = new Map<string, FsrsCardState>([
      ['a', review(10, -2)],
      ['b', review(10, -1)],
      ['c', review(10, 5)],
    ]);
    // d no tiene estado, así que es nueva
    const cardIds = ['a', 'b', 'c', 'd'];
    const all = deckStats({
      states: activeDeckStates(cardIds, states, new Set()),
      now: NOW,
      timeZone: TZ,
    });
    expect(all).toMatchObject({ total: 4, fresh: 1, review: 3, overdue: 2 });
    // Con a y d suspendidas el panel cuenta lo mismo que la cola de Repasar
    const active = deckStats({
      states: activeDeckStates(cardIds, states, new Set(['a', 'd'])),
      now: NOW,
      timeZone: TZ,
    });
    expect(active).toMatchObject({ total: 2, fresh: 0, review: 2, overdue: 1 });
  });
});
