// Lo que se puede hacer con un mazo desde su pantalla (V4-B3). Repasar y Estudiar un tema abren Repasar
// con el mazo ya elegido, para que el alumno solo confirme. La selección de Repasar vive en este
// dispositivo (D-072), así que basta dejarla puesta antes de ir. Buscar tarjetas recibe el mazo por la
// dirección, con ?mazo=.
import { screenPath } from '@/app/screens';
import type { Deck } from '@/data/schemas/decks';
import { selectionUnitId } from '@/engines/deckTree';
import { saveSelection, type ReviewMode } from '../review/selection';
import { ALL_TOPICS } from '../shared/topics';
import { CONTAINER_DECKS } from './topicPaths';

/**
 * Deja en Repasar solo este mazo elegido y el modo pedido, con todos sus temas. unitId es el mazo
 * por el que Repasar elige y cuenta, la rama de un precargado o un mazo propio, y allUnitIds todos
 * los que hay, para que Repasar sepa que los demás ya existían y los deje sin marcar
 */
export function presetReviewSelection(
  mode: ReviewMode,
  unitId: string,
  allUnitIds: readonly string[],
): void {
  saveSelection(
    { mode, decks: new Set([unitId]), topics: new Set(ALL_TOPICS), includeUntagged: true },
    allUnitIds,
  );
}

/** La dirección de Buscar tarjetas con el mazo puesto, y si se pide con solo las sanguijuelas */
export function searchPathOfDeck(unitId: string, options: { leechesOnly?: boolean } = {}): string {
  const params = new URLSearchParams({ mazo: unitId });
  if (options.leechesOnly) params.set('estado', 'sanguijuelas');
  return `${screenPath('explore')}?${params.toString()}`;
}

/** Los mazos por los que Repasar elige y cuenta, sin repetir y en el orden en que están guardados */
export function unitIdsOf(decks: readonly Pick<Deck, 'id' | 'name' | 'parentId'>[]): string[] {
  const units = decks.map((deck) => selectionUnitId(decks, deck.id, CONTAINER_DECKS));
  // La raíz que agrupa a los precargados no es un mazo que se elija, solo los contiene
  return [...new Set(units)].filter((id) => !CONTAINER_DECKS.has(id));
}
