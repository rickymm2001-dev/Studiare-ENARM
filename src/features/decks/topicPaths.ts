// La ruta de temas de cada tarjeta, para que cada mazo diga todos sus temas (B4 del plan del cambio,
// comentario 8) y para el filtro y la columna de tema de Buscar tarjetas. La ruta va de la rama
// hacia el tema más fino, con nombres legibles.
// - Mazos de Paco. Los niveles de la etiqueta de la nota, como Medicina-Interna::Reumatología::AR,
//   que se leen Medicina interna, Reumatología y Artritis reumatoide con la tabla de nombres
// - Mis errores. Las claves de la taxonomía que guarda la nota en su etiqueta topic:, rama y tema
// - Mazos importados y propios. Los submazos debajo del mazo, o si la tarjeta no está en un submazo,
//   los niveles de su etiqueta. La tabla de Paco no se les aplica, porque un nivel suyo que se llame
//   igual, como Neurología::Cefaleas::Primarias, no es Amenorreas primarias. Solo los guiones bajos
//   vuelven a ser espacios
import type { DemoDeckNote } from '@/data/schemas/content';
import type { Card, Deck, Note } from '@/data/schemas/decks';
import { TOPIC_TAG_PREFIX } from '@/data/usecases/errorCards';
import { topicTaxonomy } from '@/demo/content';
import { deckIds, ROOT_DECK_KEY } from '@/demo/content/deckEntities';
import { plainTopicName, topicDisplayName } from '@/demo/content/topicDisplayNames';
import { buildTopicOutline, type TopicOutline } from '@/engines/deckTopics';
import { deckChain, type DeckLike } from '@/engines/deckTree';
import { sanitizeTag, TAG_SEPARATOR, tagSegments } from '@/engines/tagPath';

/** Mazos que solo agrupan, como ENARM 2027. No son la unidad de ningún mazo */
export const CONTAINER_DECKS: ReadonlySet<string> = new Set([deckIds.deck(ROOT_DECK_KEY)]);

/** Rama y tema de la taxonomía de cada clave de tema, para las tarjetas de Mis errores */
const TAXONOMY_PATHS = new Map<string, readonly string[]>(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, [branch.name, topic.name]] as const),
  ),
);

/** Los niveles de una etiqueta de un mazo precargado, con su nombre de la tabla de Paco */
function preloadedTagPath(tag: string): string[] {
  return tagSegments(tag).map(topicDisplayName);
}

/** Los niveles de una etiqueta de un mazo importado o propio, como los escribió el alumno */
function plainTagPath(tag: string): string[] {
  return tagSegments(tag).map(plainTopicName);
}

/** Ruta de temas de una nota del catálogo de mazos precargados, aunque el alumno no lo siga */
export function catalogTopicPath(note: Pick<DemoDeckNote, 'sourceTag'>): string[] {
  const tag = sanitizeTag(note.sourceTag);
  return tag === '' ? [] : preloadedTagPath(tag);
}

/**
 * Ruta de temas de una nota guardada. below son los nombres de los submazos entre el mazo y la
 * tarjeta, sin contar el mazo
 */
export function noteTopicPath(
  note: Pick<Note, 'tags' | 'origin'>,
  below: readonly string[],
): string[] {
  const topicTag = note.tags.find((tag) => tag.startsWith(TOPIC_TAG_PREFIX));
  if (topicTag !== undefined) {
    return [...(TAXONOMY_PATHS.get(topicTag.slice(TOPIC_TAG_PREFIX.length)) ?? [])];
  }
  if (note.origin === 'preloaded') {
    const tag = note.tags[0];
    return tag === undefined ? [] : preloadedTagPath(tag);
  }
  if (below.length > 0) return [...below];
  const tag = note.tags.find((entry) => entry.includes(TAG_SEPARATOR)) ?? note.tags[0];
  return tag === undefined ? [] : plainTagPath(tag);
}

export interface DeckPlace {
  /** El mazo que el alumno elige, la rama de un precargado o un mazo propio de primer nivel */
  unitId: string;
  /** Mazos desde la unidad hasta el de la tarjeta, sin los que solo agrupan */
  chain: readonly string[];
}

/** Dónde vive cada mazo, calculado una vez por mazo */
export function deckPlaces(decks: readonly DeckLike[]): (deckId: string) => DeckPlace {
  const cache = new Map<string, DeckPlace>();
  return (deckId) => {
    const known = cache.get(deckId);
    if (known) return known;
    const chain = deckChain(decks, deckId).filter((deck) => !CONTAINER_DECKS.has(deck.id));
    const place = { unitId: chain[0]?.id ?? deckId, chain: chain.map((deck) => deck.name) };
    cache.set(deckId, place);
    return place;
  };
}

/** El árbol de temas de cada mazo que el alumno elige, con sus tarjetas, por el ID del mazo */
export function deckTopicOutlines(input: {
  decks: readonly Deck[];
  notes: ReadonlyMap<string, Pick<Note, 'tags' | 'origin'>>;
  cards: readonly Pick<Card, 'deckId' | 'noteId'>[];
}): Map<string, TopicOutline> {
  const placeOf = deckPlaces(input.decks);
  const paths = new Map<string, string[][]>();
  for (const card of input.cards) {
    const place = placeOf(card.deckId);
    const note = input.notes.get(card.noteId);
    const path = note ? noteTopicPath(note, place.chain.slice(1)) : [];
    const list = paths.get(place.unitId);
    if (list) list.push(path);
    else paths.set(place.unitId, [path]);
  }
  return new Map([...paths].map(([unitId, list]) => [unitId, buildTopicOutline(list)]));
}

/** El árbol de temas de un mazo del catálogo de precargados */
export function catalogTopicOutline(
  notes: readonly Pick<DemoDeckNote, 'sourceTag'>[],
): TopicOutline {
  return buildTopicOutline(notes.map(catalogTopicPath));
}
