import { describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import { counterKindOf, remainingCounters } from './counters';

const state = (value: FsrsCardState['state']): FsrsCardState => ({
  due: '2026-10-08T12:00:00.000Z',
  stability: 3,
  difficulty: 5,
  scheduledDays: 1,
  learningSteps: 0,
  reps: 2,
  lapses: 0,
  state: value,
  lastReview: null,
});

describe('contadores del repaso', () => {
  it('clasifica por estado, sin estado es nueva', () => {
    expect(counterKindOf(null)).toBe('new');
    expect(counterKindOf(state('new'))).toBe('new');
    expect(counterKindOf(state('learning'))).toBe('learning');
    expect(counterKindOf(state('relearning'))).toBe('learning');
    expect(counterKindOf(state('review'))).toBe('review');
  });

  it('cuenta lo que queda y una tarjeta repetida en la cola cuenta una vez', () => {
    const states = new Map<string, FsrsCardState>([
      ['a', state('review')],
      ['b', state('review')],
      ['c', state('relearning')],
      ['d', state('learning')],
    ]);
    // e no tiene estado, así que es nueva. c repite porque falló y volvió al final de la cola
    const queue = ['a', 'b', 'e', 'c', 'd', 'c'];
    expect(remainingCounters(queue, (id) => states.get(id) ?? null)).toEqual({
      new: 1,
      learning: 2,
      review: 2,
    });
  });

  it('una cola vacía deja todo en cero', () => {
    expect(remainingCounters([], () => null)).toEqual({ new: 0, learning: 0, review: 0 });
  });
});
