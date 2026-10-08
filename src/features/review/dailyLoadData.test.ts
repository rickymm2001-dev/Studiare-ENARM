import { describe, expect, it } from 'vitest';
import { newId } from '@/data/testing/fixtures';
import { event, minute, state } from '../tutor/testing/fixtures';
import { queueCardsOf, timeSamplesOf } from './dailyLoadData';

describe('datos de carga diaria', () => {
  it('une cada tarjeta con su estado y deja null a las que no tienen repasos', () => {
    const seen = { id: newId(), noteId: newId() };
    const fresh = { id: newId(), noteId: newId() };
    const result = queueCardsOf([seen, fresh], new Map([[seen.id, state()]]));
    expect(result).toEqual([
      { cardId: seen.id, noteId: seen.noteId, state: state() },
      { cardId: fresh.id, noteId: fresh.noteId, state: null },
    ]);
  });

  it('saca el tiempo de cada repaso y marca los de tarjetas nuevas', () => {
    const review = (stateBefore: ReturnType<typeof state> | null, ms: number) =>
      event(
        'card_reviewed',
        {
          cardId: newId(),
          deckId: newId(),
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: ms,
          msToRate: 500,
          stateBefore,
          stateAfter: state(),
        },
        minute(1),
      );
    const samples = timeSamplesOf([
      review(null, 3000),
      review(state({ state: 'new' }), 4000),
      review(state(), 2000),
      event('cards_suspended', { cardIds: [newId()], reason: 'manual' }, minute(2)),
    ]);
    expect(samples).toEqual([
      { msToReveal: 3000, msToRate: 500, isNew: true },
      { msToReveal: 4000, msToRate: 500, isNew: true },
      { msToReveal: 2000, msToRate: 500, isNew: false },
    ]);
  });
});
