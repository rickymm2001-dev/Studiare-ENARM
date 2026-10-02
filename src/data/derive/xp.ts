// Derivación de ejemplo de la Fase A. xpCache suma los eventos xp_awarded de cada alumno.
// Es un reductor puro. La misma función sirve para actualizar al agregar y para reconstruir.
// El motor de XP con niveles, títulos y topes llega en la Fase B (9.5).
import type { XpCache } from '../schemas/caches';
import type { Id } from '../schemas/common';
import type { AppEvent } from '../schemas/events';

export function emptyXpCache(userId: Id): XpCache {
  return { userId, totalXp: 0, awards: 0, lastEventId: null, lastEventAt: null };
}

export function reduceXp(state: XpCache, event: AppEvent): XpCache {
  if (event.type !== 'xp_awarded' || event.userId !== state.userId) return state;
  return {
    userId: state.userId,
    totalXp: state.totalXp + event.payload.amount,
    awards: state.awards + 1,
    lastEventId: event.id,
    lastEventAt: event.at,
  };
}
