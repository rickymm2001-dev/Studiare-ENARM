// Mazos que sigue el alumno.
import type { Deck } from '@/data/schemas/decks';
import { deckIds } from '@/demo/content/deckEntities';
import { descendantIds } from '@/engines/deckTree';

/**
 * Los mazos propios del alumno, como Mis errores, siempre cuentan como seguidos. En la demo los
 * mazos sembrados también se consideran seguidos. Seguir un mazo trae también los que cuelgan de él,
 * como las materias de un mazo de Paco (D-085)
 */
export function followedDeckIds(
  session: {
    isDemo: boolean;
    user: { id: string };
    settings: { followedDecks: readonly string[] };
  },
  stored: readonly Pick<Deck, 'id' | 'name' | 'ownerId' | 'parentId'>[],
): Set<string> {
  if (session.isDemo) return new Set(stored.map((deck) => deck.id));
  const followed = new Set<string>();
  const add = (id: string) => {
    for (const member of descendantIds(stored, id)) followed.add(member);
  };
  for (const key of session.settings.followedDecks) add(deckIds.deck(key));
  for (const deck of stored) if (deck.ownerId === session.user.id) add(deck.id);
  return followed;
}
