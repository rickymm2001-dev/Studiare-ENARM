// Tarjetas activas por rama para la dona de Inicio (D-150). La rama de una tarjeta sale de su nota
// cuando lleva la etiqueta topic: de Mis errores, o del mazo precargado del que cuelga. Si alguna
// tarjeta no tiene rama resoluble, como las de un mazo importado, todas se agrupan por mazo de
// primer nivel y la tarjeta se titula Tarjetas por mazo. Función pura sobre lo que ya carga Inicio.
import type { Card, Deck, Note } from '@/data/schemas/decks';
import { TOPIC_TAG_PREFIX } from '@/data/usecases/errorCards';
import { topicTaxonomy } from '@/demo/content';
import { deckIds } from '@/demo/content/deckEntities';
import { branchNames } from '@/i18n/features';
import { branchTone, type BranchTone } from '@/ui/branches';
import { deckPlaces } from '../decks/topicPaths';

/**
 * Rama troncal de cada mazo precargado por su clave de catálogo, la misma tabla de
 * src/features/decks/deckBranch.ts, que trabaja con el archivo del mazo y no con el mazo guardado
 */
const CATALOG_BRANCHES: Readonly<Record<string, string>> = {
  'paco-mi': 'internal_medicine',
  'paco-gyo': 'obstetrics_gynecology',
  'paco-urgencias': 'emergency_medicine',
};

const branchByDeckId = new Map(
  Object.entries(CATALOG_BRANCHES).map(([key, branch]) => [deckIds.deck(key), branch]),
);

/** Rama de cada clave de tema, y de subtema, de la taxonomía, para las tarjetas de Mis errores */
const branchByTopic = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.flatMap((topic) => [
      [topic.key, branch.key] as const,
      ...topic.subtopics.map((subtopic) => [subtopic.key, branch.key] as const),
    ]),
  ),
);

export interface CardGroup {
  key: string;
  name: string;
  count: number;
  /** El tono de la rama. neutral cuando el grupo es un mazo */
  tone: BranchTone;
}

export interface CardGroups {
  /** true cuando cada tarjeta tiene rama. false agrupa por mazo */
  byBranch: boolean;
  total: number;
  /** De la más numerosa a la menos */
  groups: CardGroup[];
}

export function cardsByBranch(input: {
  cards: readonly Pick<Card, 'id' | 'deckId' | 'noteId'>[];
  decks: readonly Pick<Deck, 'id' | 'name' | 'parentId'>[];
  /** Las etiquetas de cada nota por su id. Solo hacen falta las de Mis errores */
  noteTags: ReadonlyMap<string, Pick<Note, 'tags'>>;
  activeCardIds: ReadonlySet<string>;
}): CardGroups {
  const placeOf = deckPlaces(input.decks);
  const deckName = new Map(input.decks.map((deck) => [deck.id, deck.name]));
  const byBranch = new Map<string, number>();
  const byDeck = new Map<string, number>();
  let resolved = true;
  let total = 0;
  for (const card of input.cards) {
    if (!input.activeCardIds.has(card.id)) continue;
    total += 1;
    const unitId = placeOf(card.deckId).unitId;
    byDeck.set(unitId, (byDeck.get(unitId) ?? 0) + 1);
    const branch = branchOfCard(card, unitId, input.noteTags);
    if (branch === null) resolved = false;
    else byBranch.set(branch, (byBranch.get(branch) ?? 0) + 1);
  }
  const groups: CardGroup[] = resolved
    ? [...byBranch].map(([key, count]) => ({
        key,
        name: branchNames[key] ?? key,
        count,
        tone: branchTone(key),
      }))
    : [...byDeck].map(([key, count]) => ({
        key,
        name: deckName.get(key) ?? key,
        count,
        tone: 'neutral' as const,
      }));
  groups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  return { byBranch: resolved, total, groups };
}

function branchOfCard(
  card: Pick<Card, 'noteId'>,
  unitId: string,
  noteTags: ReadonlyMap<string, Pick<Note, 'tags'>>,
): string | null {
  const topicTag = noteTags.get(card.noteId)?.tags.find((tag) => tag.startsWith(TOPIC_TAG_PREFIX));
  if (topicTag !== undefined) {
    return branchByTopic.get(topicTag.slice(TOPIC_TAG_PREFIX.length)) ?? null;
  }
  return branchByDeckId.get(unitId) ?? null;
}
