import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { previewReview, scheduleReview, softCapDays, type SchedulerConfig } from './fsrs';

const base: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: null,
  timeZone: 'America/Merida',
  thresholds: DEFAULT_THRESHOLDS.fsrs,
};

describe('intervalo máximo con compresión suave (D-064)', () => {
  it('nunca pasa del tope, conserva el orden y casi no toca lo corto', () => {
    expect(softCapDays(47, 30)).toBeCloseTo(23.7, 1);
    expect(softCapDays(100, 30)).toBeLessThan(30);
    expect(softCapDays(100, 30)).toBeGreaterThan(softCapDays(47, 30));
    expect(softCapDays(1, 30)).toBeGreaterThan(0.98);
  });

  it('una tarjeta madura deja de irse a meses y los botones siguen distintos', () => {
    let state = null;
    let now = new Date('2026-01-01T15:00:00Z');
    for (let i = 0; i < 6; i += 1) {
      state = scheduleReview(state, 'good', now, base).state;
      now = new Date(state.due);
    }
    const free = previewReview(state, now, base);
    const capped = previewReview(state, now, { ...base, maxIntervalDays: 30 });
    expect(free.easy.state.scheduledDays).toBeGreaterThan(30);
    const days = (['hard', 'good', 'easy'] as const).map((r) => capped[r].state.scheduledDays);
    for (const d of days) expect(d).toBeLessThanOrEqual(30);
    expect(days[0]).toBeLessThanOrEqual(days[1] as number);
    expect(days[1]).toBeLessThanOrEqual(days[2] as number);
    expect(capped.again.state.due).toBe(free.again.state.due);
  });
});
