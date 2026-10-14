// Direcciones y opciones que comparten las piezas de Apuntes (B6 del plan del cambio).
import { screenPath } from '@/app/screens';
import { isEditableDeck, type Deck } from '@/data/schemas/decks';
import { deckPath } from '@/engines/deckTree';

/** La dirección de un apunte, con la línea donde queda el cursor y el modo clase si toca */
export function outlineHref(
  id: string,
  options: { line?: string | null; classMode?: boolean } = {},
): string {
  const params = new URLSearchParams({ apunte: id });
  if (options.classMode) params.set('modo', 'clase');
  if (options.line) params.set('linea', options.line);
  return `${screenPath('outlines')}?${params.toString()}`;
}

/** Los mazos que el alumno puede elegir para las tarjetas de un apunte, con su ruta */
export function ownDeckOptions(
  decks: readonly Deck[],
  userId: string,
): { value: string; label: string }[] {
  return decks
    .filter((deck) => isEditableDeck(deck, userId))
    .map((deck) => ({ value: deck.id, label: deckPath(decks, deck.id).join(' › ') }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
