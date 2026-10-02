// Mazos que sigue el alumno.
import { deckIds } from '@/demo/content/deckEntities';
import type { ReadySession } from '../shared/RequireSession';

/** En la demo los mazos sembrados se consideran seguidos */
export function followedDeckIds(
  session: ReadySession,
  storedDeckIds: readonly string[],
): Set<string> {
  if (session.isDemo) return new Set(storedDeckIds);
  return new Set(session.settings.followedDecks.map((key) => deckIds.deck(key)));
}
