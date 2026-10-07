// Árbol de mazos (D-085, fila 3). Cada mazo puede colgar de otro con parentId. Entradas, la lista de
// mazos con su id, nombre y padre. Salidas, el árbol, las rutas, los descendientes, si un mazo se
// puede mover y los conteos acumulados. Un padre que no existe o un ciclo nunca rompe nada, esos
// mazos se tratan como de primer nivel.

export interface DeckLike {
  id: string;
  name: string;
  parentId?: string | null | undefined;
}

export interface DeckNode<T extends DeckLike> {
  deck: T;
  /** 0 es un mazo de primer nivel */
  depth: number;
  children: DeckNode<T>[];
}

/** Niveles máximos de un árbol de mazos, contando el primero */
export const MAX_DECK_DEPTH = 8;

const byName = (a: DeckLike, b: DeckLike) => a.name.localeCompare(b.name, 'es');

/** Los mazos que cuelgan de cada uno. Se ignoran los padres que no existen y los que son él mismo */
function childrenIndex<T extends DeckLike>(decks: readonly T[]): Map<string | null, T[]> {
  const ids = new Set(decks.map((deck) => deck.id));
  const index = new Map<string | null, T[]>();
  for (const deck of decks) {
    const parent =
      deck.parentId && deck.parentId !== deck.id && ids.has(deck.parentId) ? deck.parentId : null;
    index.set(parent, [...(index.get(parent) ?? []), deck]);
  }
  for (const list of index.values()) list.sort(byName);
  return index;
}

/** El árbol completo, ordenado por nombre. Todos los mazos aparecen, incluso los de un ciclo */
export function buildDeckTree<T extends DeckLike>(decks: readonly T[]): DeckNode<T>[] {
  const index = childrenIndex(decks);
  const seen = new Set<string>();
  const grow = (deck: T, depth: number): DeckNode<T> => {
    seen.add(deck.id);
    const children = (index.get(deck.id) ?? [])
      .filter((child) => !seen.has(child.id))
      .map((child) => grow(child, depth + 1));
    return { deck, depth, children };
  };
  const roots = (index.get(null) ?? []).map((deck) => grow(deck, 0));
  // Lo que queda sin visitar cuelga de un ciclo. Se rompe el ciclo en el primero por nombre
  for (const deck of [...decks].sort(byName)) {
    if (!seen.has(deck.id)) roots.push(grow(deck, 0));
  }
  return roots.sort((a, b) => byName(a.deck, b.deck));
}

/** El mazo y todos los que cuelgan de él, a cualquier nivel */
export function descendantIds(decks: readonly DeckLike[], id: string): Set<string> {
  const index = childrenIndex(decks);
  const found = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const child of index.get(current) ?? []) {
      if (found.has(child.id)) continue;
      found.add(child.id);
      queue.push(child.id);
    }
  }
  return found;
}

/** Cadena de mazos desde el de primer nivel hasta el pedido. Vacía si el mazo no existe */
export function deckChain<T extends DeckLike>(decks: readonly T[], id: string): T[] {
  const byId = new Map(decks.map((deck) => [deck.id, deck]));
  const chain: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/** Nombres de la cadena, por ejemplo ENARM 2027, Medicina interna, Infectología */
export function deckPath(decks: readonly DeckLike[], id: string): string[] {
  return deckChain(decks, id).map((deck) => deck.name);
}

/** Cuántos mazos hay sobre este, es decir 0 para uno de primer nivel */
export function deckDepth(decks: readonly DeckLike[], id: string): number {
  return Math.max(0, deckChain(decks, id).length - 1);
}

/** Niveles que ocupa el mazo con todo lo que cuelga de él, contando el suyo */
function subtreeHeight(decks: readonly DeckLike[], id: string): number {
  const index = childrenIndex(decks);
  const seen = new Set<string>();
  const height = (current: string): number => {
    if (seen.has(current)) return 0;
    seen.add(current);
    const below = (index.get(current) ?? []).map((child) => height(child.id));
    return 1 + Math.max(0, ...below);
  };
  return height(id);
}

export type MoveCheck = 'ok' | 'missing' | 'self' | 'cycle' | 'too_deep';

/** Si un mazo se puede pasar bajo otro, o a primer nivel con null */
export function canMoveDeck(
  decks: readonly DeckLike[],
  id: string,
  newParentId: string | null,
): MoveCheck {
  if (!decks.some((deck) => deck.id === id)) return 'missing';
  if (newParentId === null) return 'ok';
  if (newParentId === id) return 'self';
  if (!decks.some((deck) => deck.id === newParentId)) return 'missing';
  if (descendantIds(decks, id).has(newParentId)) return 'cycle';
  const levels = deckChain(decks, newParentId).length + subtreeHeight(decks, id);
  return levels > MAX_DECK_DEPTH ? 'too_deep' : 'ok';
}

/**
 * La unidad que el alumno marca al elegir qué repasar. Un mazo de primer nivel es su propia unidad
 * y uno más abajo cuenta como el mazo del segundo nivel al que pertenece. Así ENARM 2027 con sus
 * ramas y materias se elige por rama y no por cada materia
 */
export function selectionUnitId(decks: readonly DeckLike[], id: string): string {
  const chain = deckChain(decks, id);
  return (chain[1] ?? chain[0])?.id ?? id;
}

/** Cuántos elementos hay en cada mazo contando los de los mazos que cuelgan de él */
export function rollupCounts(
  decks: readonly DeckLike[],
  own: ReadonlyMap<string, number>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const deck of decks) {
    let total = 0;
    for (const id of descendantIds(decks, deck.id)) total += own.get(id) ?? 0;
    totals.set(deck.id, total);
  }
  return totals;
}
