/**
 * Buscar en todos los apuntes y ver el esquema de uno (B6 del plan del cambio, respuesta 74).
 *
 * Qué hace. Encuentra las líneas de todos los apuntes que tienen las palabras buscadas, sin importar
 * mayúsculas ni acentos, y arma el esquema de un apunte, que son sus líneas con líneas debajo, para
 * saltar a una sección.
 * Entradas. Los apuntes con su título y su árbol de líneas, y lo que escribió el alumno.
 * Salidas. Por apunte, si coincide el título y las líneas que coinciden con su ruta. El esquema es un
 * árbol de secciones con el id de su línea.
 * Método. Cada palabra de la búsqueda tiene que estar en el título o en una misma línea, en cualquier
 * orden. La línea se busca con sus etiquetas y sus marcas, y se muestra sin etiquetas. El esquema toma
 * las líneas que tienen líneas debajo, hasta tres niveles, con el texto de la pregunta si es tarjeta.
 * Umbrales. Hasta 3 líneas por apunte en los resultados y 3 niveles en el esquema, de diseño (J).
 */
import { normalizeTitle, parseLine, type OutlineNode } from './outline';

export interface SearchableOutline {
  id: string;
  title: string;
  nodes: readonly OutlineNode[];
}

export interface LineHit {
  nodeId: string;
  /** La línea sin etiquetas, como la ve el alumno */
  text: string;
  /** Las líneas de arriba de las que cuelga, de la más alta a la más cercana */
  path: string[];
}

export interface OutlineHit {
  outlineId: string;
  titleMatch: boolean;
  /** Las primeras líneas que coinciden, en el orden del apunte */
  lines: LineHit[];
  /** Cuántas líneas coinciden en total */
  lineCount: number;
}

export const SEARCH_LINES_PER_OUTLINE = 3;
export const STRUCTURE_MAX_DEPTH = 3;

/** Las palabras de la búsqueda, comparables y sin repetir */
export function searchTerms(query: string): string[] {
  return [...new Set(normalizeTitle(query).split(' '))].filter((term) => term !== '');
}

const hasAll = (haystack: string, terms: readonly string[]) =>
  terms.every((term) => haystack.includes(term));

/** Lo que se muestra de una línea. Con marca, el lado de la pregunta basta para ubicarla */
function shownText(text: string): string {
  const parsed = parseLine(text);
  return parsed.plain;
}

/**
 * Los apuntes donde aparece lo buscado, en el orden en que llegan. Sin palabras no hay resultados.
 * Un apunte entra si su título tiene todas las palabras o si alguna de sus líneas las tiene
 */
export function searchOutlines(
  outlines: readonly SearchableOutline[],
  query: string,
  maxLines: number = SEARCH_LINES_PER_OUTLINE,
): OutlineHit[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  const hits: OutlineHit[] = [];
  for (const outline of outlines) {
    const lines: LineHit[] = [];
    let lineCount = 0;
    const walk = (nodes: readonly OutlineNode[], path: readonly string[]) => {
      for (const node of nodes) {
        const shown = shownText(node.text);
        if (node.text.trim() !== '' && hasAll(normalizeTitle(node.text), terms)) {
          lineCount += 1;
          if (lines.length < maxLines)
            lines.push({ nodeId: node.id, text: shown, path: [...path] });
        }
        walk(node.children, shown === '' ? path : [...path, shown]);
      }
    };
    walk(outline.nodes, []);
    const titleMatch = hasAll(normalizeTitle(outline.title), terms);
    if (titleMatch || lineCount > 0) {
      hits.push({ outlineId: outline.id, titleMatch, lines, lineCount });
    }
  }
  return hits;
}

export interface StructureEntry {
  nodeId: string;
  text: string;
  children: StructureEntry[];
}

/** El texto de una sección. Si la línea es tarjeta, su pregunta */
function sectionText(text: string): string {
  const { mark, plain } = parseLine(text);
  if (mark.type === 'forward' || mark.type === 'both') return mark.left;
  if (mark.type === 'backward') return mark.right;
  if (mark.type === 'multiline') return mark.front;
  return plain;
}

/**
 * El esquema del apunte. Las líneas con líneas debajo son sus secciones, hasta tres niveles. Una
 * sección sin texto no se lista, pero las de abajo sí
 */
export function outlineStructure(
  nodes: readonly OutlineNode[],
  maxDepth: number = STRUCTURE_MAX_DEPTH,
): StructureEntry[] {
  const build = (list: readonly OutlineNode[], depth: number): StructureEntry[] =>
    list.flatMap((node): StructureEntry[] => {
      if (node.children.length === 0) return [];
      const children = depth < maxDepth ? build(node.children, depth + 1) : [];
      const text = sectionText(node.text);
      return text === '' ? children : [{ nodeId: node.id, text, children }];
    });
  return build(nodes, 1);
}

/** Cuántas secciones tiene el esquema, contando las de todos los niveles */
export function countSections(entries: readonly StructureEntry[]): number {
  return entries.reduce((total, entry) => total + 1 + countSections(entry.children), 0);
}
