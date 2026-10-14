// Los mazos que el alumno puede elegir para la tarjeta de una pregunta (B5, comentario 1). Sus
// mazos, los precargados que sigue y Nuevo mazo. Mis errores no se ofrece porque lo arma la app, y la
// capa del alumno en un precargado tampoco, porque se elige con el propio precargado. Sin React.
import { isEditableDeck, isLive, type Deck } from '@/data/schemas/decks';
import { isLayerDeck } from '@/data/usecases/questionCards';
import { deckIndent, flattenDeckTree } from '@/engines/deckTree';

/** El valor del selector para crear un mazo nuevo. No es un ULID, así que no choca con un mazo */
export const NEW_DECK = 'nuevo';

export interface DeckChoice {
  deckId: string;
  /** Con sangría de su nivel en el árbol */
  label: string;
  group: 'own' | 'preloaded';
}

export function questionCardChoices(input: {
  decks: readonly Deck[];
  userId: string;
  /** Los mazos que sigue, con los que cuelgan de ellos */
  followed: ReadonlySet<string>;
  /** Mazos que solo agrupan, como ENARM 2027, que no reciben tarjetas */
  containers: ReadonlySet<string>;
}): DeckChoice[] {
  const live = input.decks.filter(isLive);
  const byId = new Map(live.map((deck) => [deck.id, deck]));
  const own = live.filter(
    (deck) => isEditableDeck(deck, input.userId) && !isLayerDeck(deck, byId, input.userId),
  );
  const preloaded = live.filter(
    (deck) =>
      deck.origin === 'preloaded' && input.followed.has(deck.id) && !input.containers.has(deck.id),
  );
  const rows = (decks: readonly Deck[], group: DeckChoice['group']) =>
    flattenDeckTree(decks).map(({ deck, depth }) => ({
      deckId: deck.id,
      label: `${deckIndent(depth)}${deck.name}`,
      group,
    }));
  return [...rows(own, 'own'), ...rows(preloaded, 'preloaded')];
}
