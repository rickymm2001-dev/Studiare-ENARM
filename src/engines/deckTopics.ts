// Temas de cada mazo (B4 del plan del cambio, comentario 8). Cada mazo dice todos los temas que
// contiene, agrupados por rama y en orden alfabético del español, sin repetidos y sin recortes.
// Entradas, la ruta de temas de cada tarjeta, ya con nombres legibles, de la rama hacia el tema más
// fino, por ejemplo Medicina interna, Reumatología, Artritis reumatoide. Una ruta vacía es una
// tarjeta sin tema. Salidas, el árbol de temas del mazo con cuántas tarjetas caen en cada uno.
// El orden es el de Intl.Collator con es-MX y sensibilidad base, así que no distingue acentos ni
// mayúsculas, y la ñ va después de la n. Dos nombres que solo cambian en acentos o mayúsculas son
// el mismo tema y se muestra el que lleva acentos.

/** Profundidad que se muestra. Rama, materia y tema */
export const TOPIC_OUTLINE_DEPTH = 3;

const collator = new Intl.Collator('es-MX', { sensitivity: 'base' });

/** Compara dos nombres de tema como el español, sin distinguir acentos ni mayúsculas */
export function compareTopicNames(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Cuántas marcas de acento o diéresis lleva un nombre */
function diacritics(name: string): number {
  return name.normalize('NFD').replace(/[^\u0300-\u036f]/g, '').length;
}

/**
 * Qué tan lejos está un nombre de como se escribe un título en español, con mayúscula inicial y lo
 * demás en minúsculas. Menos es mejor
 */
function caseScore(name: string): number {
  const startsLower = /^\p{Ll}/u.test(name) ? 1000 : 0;
  return startsLower + name.slice(1).replace(/[^\p{Lu}]/gu, '').length;
}

/**
 * Entre dos nombres del mismo tema, el que se muestra. Gana el que lleva más acentos, luego el que
 * se escribe como título en español, y al final el primero en orden de código, para que el
 * resultado no dependa del orden de las tarjetas
 */
function preferredName(current: string, candidate: string): string {
  const accents = diacritics(candidate) - diacritics(current);
  if (accents !== 0) return accents > 0 ? candidate : current;
  const casing = caseScore(candidate) - caseScore(current);
  if (casing !== 0) return casing < 0 ? candidate : current;
  return candidate < current ? candidate : current;
}

/**
 * Clave de un nombre para juntar los que el colador considera iguales. Sin acentos ni mayúsculas,
 * pero la ñ se queda, porque en español es otra letra
 */
function keyOf(name: string): string {
  return name
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/n\u0303/g, '\u00f1')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Nombres sin repetidos y en orden alfabético del español */
export function sortTopicNames(names: Iterable<string>): string[] {
  const kept = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    if (name === '') continue;
    const key = keyOf(name);
    const current = kept.get(key);
    kept.set(key, current === undefined ? name : preferredName(current, name));
  }
  return [...kept.values()].sort(compareTopicNames);
}

export interface TopicNode {
  name: string;
  /** Tarjetas que caen en este tema o debajo de él */
  cards: number;
  children: TopicNode[];
}

export interface TopicOutline {
  /** Las ramas del mazo, cada una con sus temas debajo */
  branches: TopicNode[];
  /** Temas sin nada debajo, es decir los más finos que se muestran */
  leaves: number;
  /** Tarjetas sin ningún tema */
  untagged: number;
  /** Todas las tarjetas que se contaron */
  cards: number;
}

interface Draft {
  name: string;
  cards: number;
  children: Map<string, Draft>;
}

/**
 * El árbol de temas de un mazo con las rutas de sus tarjetas. Cada nivel va en orden alfabético del
 * español y los repetidos se juntan. Solo cuentan los primeros depth niveles de cada ruta. Los
 * niveles vacíos de una ruta se ignoran
 */
export function buildTopicOutline(
  paths: Iterable<readonly string[]>,
  depth: number = TOPIC_OUTLINE_DEPTH,
): TopicOutline {
  const root = new Map<string, Draft>();
  let untagged = 0;
  let cards = 0;
  for (const path of paths) {
    cards += 1;
    const names = path
      .map((name) => name.trim())
      .filter((name) => name !== '')
      .slice(0, depth);
    if (names.length === 0) {
      untagged += 1;
      continue;
    }
    let level = root;
    for (const name of names) {
      const key = keyOf(name);
      let node = level.get(key);
      if (!node) {
        node = { name, cards: 0, children: new Map() };
        level.set(key, node);
      } else {
        node.name = preferredName(node.name, name);
      }
      node.cards += 1;
      level = node.children;
    }
  }
  let leaves = 0;
  const finish = (level: Map<string, Draft>): TopicNode[] =>
    [...level.values()]
      .map((draft) => {
        const children = finish(draft.children);
        if (children.length === 0) leaves += 1;
        return { name: draft.name, cards: draft.cards, children };
      })
      .sort((a, b) => compareTopicNames(a.name, b.name));
  const branches = finish(root);
  return { branches, leaves, untagged, cards };
}

/** Todos los nombres de un nivel del árbol, por ejemplo los temas finos, en orden y sin repetidos */
export function topicNamesAt(outline: TopicOutline, level: number): string[] {
  const names: string[] = [];
  const walk = (nodes: readonly TopicNode[], current: number) => {
    for (const node of nodes) {
      if (current === level) names.push(node.name);
      else walk(node.children, current + 1);
    }
  };
  walk(outline.branches, 0);
  return sortTopicNames(names);
}
