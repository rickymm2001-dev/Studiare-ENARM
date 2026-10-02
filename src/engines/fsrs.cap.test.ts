import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import { previewReview, scheduleReview, softCapDays, type SchedulerConfig } from './fsrs';

const base: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: null,
  timeZone: 'America/Merida',
  thresholds: DEFAULT_THRESHOLDS.fsrs,
};

function matureCard(reviews: number) {
  let state: FsrsCardState | null = null;
  let now = new Date('2026-01-01T15:00:00Z');
  for (let i = 0; i < reviews; i += 1) {
    state = scheduleReview(state, 'good', now, base).state;
    now = new Date(state.due);
  }
  return { state, now };
}

const days = (preview: ReturnType<typeof previewReview>) =>
  (['hard', 'good', 'easy'] as const).map((rating) => preview[rating].state.scheduledDays);

describe('tope y separación del repaso (D-064, D-067)', () => {
  it('la compresión suave nunca pasa del tope y casi no toca lo corto', () => {
    expect(softCapDays(47, 21)).toBeLessThan(21);
    expect(softCapDays(100, 21)).toBeGreaterThan(softCapDays(47, 21));
    expect(softCapDays(1, 21)).toBeGreaterThan(0.97);
  });

  it('Bien queda bajo el tope y Difícil y Fácil guardan su proporción', () => {
    const { state, now } = matureCard(4);
    const free = days(previewReview(state, now, base));
    const capped = days(previewReview(state, now, { ...base, maxIntervalDays: 21 }));
    expect(free[1]).toBeGreaterThan(21);
    expect(capped[1]).toBeLessThanOrEqual(21);
    expect(capped[0]).toBeLessThan(capped[1] as number);
    expect(capped[1]).toBeLessThan(capped[2] as number);
    const freeRatio = (free[2] as number) / (free[1] as number);
    const cappedRatio = (capped[2] as number) / (capped[1] as number);
    expect(Math.abs(freeRatio - cappedRatio)).toBeLessThan(0.15);
  });

  it('el multiplicador de cada botón acerca o aleja su tarjeta y Otra vez no cambia', () => {
    const { state, now } = matureCard(3);
    const normal = previewReview(state, now, { ...base, maxIntervalDays: 21 });
    const custom = previewReview(state, now, {
      ...base,
      maxIntervalDays: 21,
      spacing: { hard: 0.5, good: 1, easy: 1.5 },
    });
    expect(custom.hard.state.scheduledDays).toBeLessThan(normal.hard.state.scheduledDays);
    expect(custom.good.state.scheduledDays).toBe(normal.good.state.scheduledDays);
    expect(custom.easy.state.scheduledDays).toBeGreaterThan(normal.easy.state.scheduledDays);
    expect(custom.again.state.due).toBe(normal.again.state.due);
  });
});
