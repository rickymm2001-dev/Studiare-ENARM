import { describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import type { QueueCard } from './fsrs';
import { buildTopicQueue, TOPIC_SESSION_LIMIT } from './topicStudy';

const NOW = new Date('2026-10-08T15:00:00.000Z');

function reviewState(due: string): FsrsCardState {
  return {
    due,
    stability: 10,
    difficulty: 5,
    scheduledDays: 10,
    learningSteps: 0,
    reps: 5,
    lapses: 0,
    state: 'review',
    lastReview: '2026-09-28T15:00:00.000Z',
  };
}

const scheduled = (id: string, due: string): QueueCard => ({
  cardId: id,
  noteId: `n-${id}`,
  state: reviewState(due),
});
const unseen = (id: string): QueueCard => ({ cardId: id, noteId: `n-${id}`, state: null });

describe('buildTopicQueue', () => {
  it('pone primero lo vencido, luego lo próximo y al final las nuevas', () => {
    const cards = [
      unseen('n1'),
      scheduled('later', '2026-10-20T15:00:00.000Z'),
      scheduled('overdue', '2026-10-01T15:00:00.000Z'),
      scheduled('soon', '2026-10-09T15:00:00.000Z'),
      unseen('n0'),
    ];
    expect(buildTopicQueue({ cards, now: NOW })).toEqual(['overdue', 'soon', 'later', 'n0', 'n1']);
  });

  it('incluye lo que no vence hoy y las nuevas, a diferencia de la cola del día', () => {
    const cards = [scheduled('far', '2027-01-01T00:00:00.000Z'), unseen('x')];
    expect(buildTopicQueue({ cards, now: NOW })).toEqual(['far', 'x']);
  });

  it('se corta en el tope de la sesión', () => {
    const cards = Array.from({ length: TOPIC_SESSION_LIMIT + 50 }, (_, i) =>
      unseen(`c${String(i).padStart(4, '0')}`),
    );
    expect(buildTopicQueue({ cards, now: NOW })).toHaveLength(TOPIC_SESSION_LIMIT);
    expect(buildTopicQueue({ cards, now: NOW, limit: 3 })).toEqual(['c0000', 'c0001', 'c0002']);
  });

  it('sin tarjetas o con tope cero no arma nada', () => {
    expect(buildTopicQueue({ cards: [], now: NOW })).toEqual([]);
    expect(buildTopicQueue({ cards: [unseen('a')], now: NOW, limit: 0 })).toEqual([]);
  });

  it('es determinista aunque cambie el orden de entrada', () => {
    const cards = [
      scheduled('b', '2026-10-02T00:00:00.000Z'),
      scheduled('a', '2026-10-02T00:00:00.000Z'),
      unseen('z'),
      unseen('y'),
    ];
    const one = buildTopicQueue({ cards, now: NOW });
    expect(buildTopicQueue({ cards: [...cards].reverse(), now: NOW })).toEqual(one);
    expect(one).toEqual(['a', 'b', 'y', 'z']);
  });

  it('una tarjeta con fecha ilegible se trata como nueva y no rompe nada', () => {
    const broken = scheduled('bad', 'no-es-fecha');
    expect(buildTopicQueue({ cards: [broken, unseen('a')], now: NOW })).toEqual(['a', 'bad']);
  });
});
