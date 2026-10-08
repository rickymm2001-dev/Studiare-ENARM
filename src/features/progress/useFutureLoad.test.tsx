// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Card, Deck } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { makeUser, newId } from '@/data/testing/fixtures';
import type { ReadySession } from '../shared/RequireSession';
import { event, minute, state } from '../tutor/testing/fixtures';
import { LOAD_HORIZONS } from './futureLoad';
import { useFutureLoad } from './useFutureLoad';

const user = makeUser();
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: false };
const NOW = '2026-10-01T15:00:00.000Z';

const deck: Deck = {
  id: newId(),
  name: 'Mío',
  description: '',
  ownerId: user.id,
  origin: 'manual',
  visibility: 'private',
  isDemo: false,
  createdAt: NOW,
};
const cards: Card[] = [newId(), newId()].map((id) => ({
  id,
  noteId: newId(),
  deckId: deck.id,
  ordinal: 0,
  createdAt: NOW,
}));

const reviewed = (card: Card): AppEvent =>
  event(
    'card_reviewed',
    {
      cardId: card.id,
      deckId: deck.id,
      source: 'card',
      rating: 'good',
      confidence: null,
      msToReveal: 1000,
      msToRate: 1000,
      stateBefore: null,
      stateAfter: state({ due: new Date(Date.now() + 3 * 86_400_000).toISOString() }),
    },
    minute(5),
  );

describe('carga futura con tarjetas suspendidas', () => {
  const content = { decks: [deck], cards };
  const horizon = LOAD_HORIZONS[0];

  it('proyecta con todas las tarjetas y deja fuera las suspendidas', () => {
    const events = cards.map(reviewed);
    const all = renderHook(() => useFutureLoad(session, events, content, horizon));
    expect(all.result.current?.cardCount).toBe(2);

    const suspended = [
      ...events,
      event('cards_suspended', { cardIds: [cards[0]?.id ?? ''], reason: 'manual' }, minute(10)),
    ];
    const some = renderHook(() => useFutureLoad(session, suspended, content, horizon));
    expect(some.result.current?.cardCount).toBe(1);

    const both = [
      ...suspended,
      event('cards_suspended', { cardIds: [cards[1]?.id ?? ''], reason: 'manual' }, minute(11)),
    ];
    // Sin tarjetas que proyectar no hay carga
    expect(
      renderHook(() => useFutureLoad(session, both, content, horizon)).result.current,
    ).toBeNull();
  });
});
