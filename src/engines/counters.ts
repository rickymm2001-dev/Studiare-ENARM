// Contadores del repaso (D-085, fila 8). Como en Anki, tres números que dicen qué falta por hacer.
// Nuevas, las tarjetas que nunca se han visto. Aprendizaje, las que se están aprendiendo o que se
// olvidaron y vuelven a verse. Programadas, los repasos que ya tocaban. Entradas, las tarjetas que
// quedan en la cola con su estado. Salidas, cuántas hay de cada tipo y a cuál pertenece una tarjeta.
import type { FsrsCardState } from '@/data/schemas/common';

export type CounterKind = 'new' | 'learning' | 'review';

export interface DailyCounters {
  new: number;
  learning: number;
  review: number;
}

/** A qué contador cuenta una tarjeta según su estado. Sin estado es nueva */
export function counterKindOf(state: FsrsCardState | null): CounterKind {
  if (state === null || state.state === 'new') return 'new';
  return state.state === 'review' ? 'review' : 'learning';
}

/** Cuántas tarjetas de cada tipo quedan. Cada tarjeta cuenta una sola vez, aunque repita en la cola */
export function remainingCounters(
  remaining: readonly string[],
  stateOf: (cardId: string) => FsrsCardState | null,
): DailyCounters {
  const counters: DailyCounters = { new: 0, learning: 0, review: 0 };
  const seen = new Set<string>();
  for (const cardId of remaining) {
    if (seen.has(cardId)) continue;
    seen.add(cardId);
    counters[counterKindOf(stateOf(cardId))] += 1;
  }
  return counters;
}
