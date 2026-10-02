// Propiedades de FSRS con fast-check (7.1, PLAN Fase B)
// - Otra vez nunca da un vencimiento posterior a Bien para la misma tarjeta y el mismo momento
// - En modo examen ningún vencimiento pasa la fecha del ENARM
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import {
  examDeadline,
  previewReview,
  scheduleReview,
  type FsrsRating,
  type SchedulerConfig,
} from './fsrs';

const START = new Date('2026-01-15T15:00:00.000Z').getTime();
const MINUTE = 60 * 1000;

const baseConfig: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: null,
  timeZone: 'America/Merida',
  thresholds: DEFAULT_THRESHOLDS.fsrs,
};

const ratingArbitrary = fc.constantFrom<FsrsRating>('again', 'hard', 'good', 'easy');
/** Historia de repasos desde una tarjeta nueva. Cada paso es una calificación y un salto de tiempo */
const historyArbitrary = fc.array(
  fc.record({ rating: ratingArbitrary, gapMinutes: fc.integer({ min: 0, max: 60 * 24 * 120 }) }),
  { maxLength: 15 },
);

function play(
  history: { rating: FsrsRating; gapMinutes: number }[],
  config: SchedulerConfig,
): { state: FsrsCardState | null; at: number } {
  let state: FsrsCardState | null = null;
  let at = START;
  for (const step of history) {
    at += step.gapMinutes * MINUTE;
    state = scheduleReview(state, step.rating, new Date(at), config).state;
  }
  return { state, at };
}

describe('propiedades de FSRS', () => {
  it('Otra vez nunca vence después que Bien, en cualquier tarjeta y momento', () => {
    fc.assert(
      fc.property(
        historyArbitrary,
        fc.integer({ min: 0, max: 60 * 24 * 200 }),
        fc.constantFrom(0.8, 0.9, 0.95, 0.97),
        (history, waitMinutes, retention) => {
          const config = { ...baseConfig, desiredRetention: retention };
          const { state, at } = play(history, config);
          const preview = previewReview(state, new Date(at + waitMinutes * MINUTE), config);
          expect(new Date(preview.again.state.due).getTime()).toBeLessThanOrEqual(
            new Date(preview.good.state.due).getTime(),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('en modo examen ningún vencimiento pasa del ENARM mientras el ENARM no llega', () => {
    fc.assert(
      fc.property(
        historyArbitrary,
        fc.integer({ min: 1, max: 400 }),
        ratingArbitrary,
        fc.integer({ min: 0, max: 60 * 24 * 30 }),
        (history, examOffsetDays, rating, waitMinutes) => {
          const examDate = new Date(START + examOffsetDays * 24 * 60 * MINUTE)
            .toISOString()
            .slice(0, 10);
          const config = { ...baseConfig, examDate };
          const deadline = examDeadline(config)?.getTime() ?? Infinity;
          const { state, at } = play(history, config);
          const now = at + waitMinutes * MINUTE;
          const outcome = scheduleReview(state, rating, new Date(now), config);
          if (now < deadline) {
            expect(new Date(outcome.state.due).getTime()).toBeLessThanOrEqual(deadline);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
