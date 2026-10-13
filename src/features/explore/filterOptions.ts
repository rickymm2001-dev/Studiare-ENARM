// Las opciones de los filtros de mazo y de tema de Buscar tarjetas, con cuántas tarjetas daría cada
// una con los demás filtros puestos. Sirven igual para los chips de la computadora y para la hoja
// de filtros del teléfono.
import { topicKey } from '@/engines/cardSearch';
import type { TopicNode, TopicOutline } from '@/engines/deckTopics';
import { flattenDeckTree, rollupCounts, type DeckLike } from '@/engines/deckTree';

export interface DeckOption {
  id: string;
  name: string;
  depth: number;
  count: number;
}

/**
 * Los mazos en orden de árbol con sus tarjetas, contando las de los mazos de abajo. own son las
 * tarjetas de cada mazo sin sumar las de abajo
 */
export function deckOptions(
  decks: readonly DeckLike[],
  own: ReadonlyMap<string, number>,
): DeckOption[] {
  const totals = rollupCounts(decks, own);
  return flattenDeckTree(decks).map(({ deck, depth }) => ({
    id: deck.id,
    name: deck.name,
    depth,
    count: totals.get(deck.id) ?? 0,
  }));
}

export interface TopicOption {
  key: string;
  path: readonly string[];
  depth: number;
  count: number;
}

/**
 * Los temas de todas las tarjetas en orden de árbol, de la rama al tema más fino, con su conteo. Un
 * tema sin tarjetas con los filtros de ahora no se ofrece, salvo el que ya está elegido. outline es
 * el árbol de temas de todas las tarjetas, que se arma una vez con buildTopicOutline
 */
export function topicOptions(
  outline: TopicOutline,
  counts: ReadonlyMap<string, number>,
  selectedKey: string | null,
): TopicOption[] {
  const options: TopicOption[] = [];
  const walk = (nodes: readonly TopicNode[], parent: readonly string[]) => {
    for (const node of nodes) {
      const path = [...parent, node.name];
      const key = topicKey(path);
      const count = counts.get(key) ?? 0;
      if (count === 0 && key !== selectedKey) continue;
      options.push({ key, path, depth: parent.length, count });
      walk(node.children, path);
    }
  };
  walk(outline.branches, []);
  return options;
}
