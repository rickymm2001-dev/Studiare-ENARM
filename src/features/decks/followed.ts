// Mazos que sigue el alumno.
import type { Deck } from '@/data/schemas/decks';
import { deckIds } from '@/demo/content/deckEntities';
import type { ReadySession } from '../shared/RequireSession';

/**
 * Los mazos propios del alumno, como Mis errores, siempre cuentan como seguidos. En la demo los
 * mazos sembrados también se consideran seguidos
 */
export function followedDeckIds(
  session: ReadySession,
  stored: readonly Pick<Deck, 'id' | 'ownerId'>[],
): Set<string> {
  if (session.isDemo) return new Set(stored.map((deck) => deck.id));
  const followed = new Set(session.settings.followedDecks.map((key) => deckIds.deck(key)));
  for (const deck of stored) if (deck.ownerId === session.user.id) followed.add(deck.id);
  return followed;
}
