// Etiquetas en ruta (D-085, fila 3). Una etiqueta es una ruta de segmentos separados por :: y nunca
// lleva espacios, como en Anki, para que al exportar no se parta en dos. Entradas, cadenas.
// Salidas, etiquetas limpias y conteos por prefijo para filtrar por ruta en Explorar.

/** Separador de niveles de una etiqueta. Es el mismo que usa Anki */
export const TAG_SEPARATOR = '::';
/** Largo máximo de una etiqueta completa, igual que el esquema de las notas */
export const TAG_MAX_LENGTH = 80;
/** Etiquetas máximas por nota, igual que el esquema de las notas */
export const TAGS_PER_NOTE_MAX = 50;

/**
 * Deja una etiqueta lista para guardar. Los espacios, incluidos los que no se rompen, pasan a guion
 * bajo, los niveles vacíos se quitan y se recortan los guiones bajos de las orillas de cada nivel.
 * Devuelve cadena vacía si no queda nada que guardar
 */
export function sanitizeTag(raw: string): string {
  const segments = raw
    // Primero los espacios de todo tipo, incluidos saltos de línea, y luego lo invisible
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/[\p{Cc}\u200b-\u200d\ufeff]/gu, '')
    .split(TAG_SEPARATOR)
    .map((segment) =>
      segment
        .trim()
        .replace(/ /g, '_')
        .replace(/^_+|_+$/g, ''),
    )
    .filter((segment) => segment !== '');
  // Al cortar por el largo puede quedar un separador a medias, que se quita
  return segments
    .join(TAG_SEPARATOR)
    .slice(0, TAG_MAX_LENGTH)
    .replace(/[:_]+$/, '');
}

/** Etiquetas limpias, sin vacías ni repetidas (sin distinguir mayúsculas) y en su orden */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = sanitizeTag(raw);
    const key = tag.toLowerCase();
    if (tag === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= TAGS_PER_NOTE_MAX) break;
  }
  return result;
}

/** Niveles de una etiqueta. A::B::C da A, B y C */
export function tagSegments(tag: string): string[] {
  return tag.split(TAG_SEPARATOR).filter((segment) => segment !== '');
}

/** Las rutas que contienen a una etiqueta, sin contarla. A::B::C da A y A::B */
export function tagAncestors(tag: string): string[] {
  const segments = tagSegments(tag);
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join(TAG_SEPARATOR));
}

/** Si una etiqueta es la ruta pedida o cuelga de ella. Como en Anki no distingue mayúsculas */
export function tagUnder(tag: string, path: string): boolean {
  const left = tag.toLowerCase();
  const right = path.toLowerCase();
  return left === right || left.startsWith(`${right}${TAG_SEPARATOR}`);
}

/**
 * Cuántas notas hay en cada ruta, contando las que cuelgan de ella. Una nota con dos etiquetas bajo
 * la misma ruta cuenta una sola vez en esa ruta
 */
export function countByPath(notesTags: readonly (readonly string[])[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tags of notesTags) {
    const paths = new Set<string>();
    for (const tag of tags) {
      for (const ancestor of tagAncestors(tag)) paths.add(ancestor);
      paths.add(tag);
    }
    for (const path of paths) counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return counts;
}

export interface TagNode {
  path: string;
  name: string;
  count: number;
  children: TagNode[];
}

/** Árbol de rutas con sus conteos, ordenado por nombre. Para el selector de etiquetas de Explorar */
export function buildTagTree(counts: ReadonlyMap<string, number>): TagNode[] {
  const nodes = new Map<string, TagNode>();
  for (const [path, count] of counts) {
    nodes.set(path, { path, name: tagSegments(path).at(-1) ?? path, count, children: [] });
  }
  const roots: TagNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(tagAncestors(node.path).at(-1) ?? '');
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const byName = (a: TagNode, b: TagNode) => a.name.localeCompare(b.name, 'es');
  const sort = (list: TagNode[]) => {
    list.sort(byName);
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}
