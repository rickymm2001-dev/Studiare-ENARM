// Importador de esquemas en texto, Markdown y OPML (V4-B4). Con él entran los apuntes de Obsidian,
// Notion, Logseq, Roam y Dynalist, que exportan Markdown o OPML con viñetas anidadas. Un esquema no
// trae tarjetas hechas, así que se toman las líneas que llevan las mismas marcas de Apuntes y de
// Word, Pregunta :: Respuesta, Término ;; Definición, Pregunta >> Respuesta y {{huecos}}. Una línea
// con >>> toma como respuesta las líneas que cuelgan de ella. Los títulos del documento y las líneas
// con hijos que no son tarjeta pasan a etiquetas en ruta, hasta tres niveles, para que las tarjetas
// queden ordenadas por tema. Las líneas que son propiedades de Logseq o de Roam se saltan. El texto
// nunca se interpreta como HTML, y el OPML se lee con un recorrido propio que no expande entidades
// externas, así no hay forma de leer archivos ni de pedir cosas a la red.
import { parseLine } from '../../engines/outline';
import { normalizeTags, sanitizeTag } from '../../engines/tagPath';
import { clozeHoles } from '../content/cloze';
import { decodeText } from './csv';
import { IMPORT_LIMITS, type ImportLimits } from './limits';
import {
  ImportError,
  type ImportWarning,
  type ParsedImport,
  type ParsedNote,
  type RowError,
} from './types';

/** Una línea del esquema con su nivel. heading es un título de Markdown, que marca contexto */
export interface OutlineLine {
  depth: number;
  text: string;
  heading: boolean;
}

/** Hasta cuántos niveles de contexto pasan a la etiqueta en ruta */
const CONTEXT_DEPTH = 3;
/**
 * Propiedades de Logseq y de Roam que van en su propia línea y no son tarjetas. Solo se reconocen
 * las claves reservadas de esos programas, en minúsculas como las escriben ellos, porque cualquier
 * otra Palabra :: Definición es una tarjeta. El valor puede ser de varias palabras, como en
 * tags:: cardio, hta o title:: Mi página
 */
const PROPERTY_KEYS = [
  'id',
  'collapsed',
  'heading',
  'alias',
  'title',
  'type',
  'icon',
  'public',
  'template',
  'filters',
  'tags',
  'tag',
  'source',
  'author',
  'created-at',
  'updated-at',
  'background-color',
  'exclude-from-graph-view',
  'logseq.order-list-type',
  'query-table',
  'query-properties',
  'query-sort-by',
  'query-sort-desc',
];
const PROPERTY = new RegExp(
  `^[\\s-]*(?:${PROPERTY_KEYS.join('|').replace(/\./g, '\\.')})::(?:\\s.*)?$`,
);
/** Macros de Roam y de Logseq, como {{[[TODO]]}} o {{embed: ((id))}}, que no son huecos de cloze */
const MACRO =
  /\{\{\s*(?:\[\[|(?:embed|query|video|youtube|iframe|table|calc|renderer|pdf|audio|tweet|word-count|slider|date-picker|attr-table|mentions|roam\/[\w-]+)\s*(?::|\}\}))/i;
/** Cerca de código de Markdown. Con tres o más acentos graves o tildes */
const FENCE = /^\s*(`{3,}|~{3,})/;
const BULLET = /^(\s*)(?:[-*+]|\d{1,3}[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Largo de la sangría contando cada tabulador como cuatro espacios */
function indentWidth(spaces: string): number {
  let width = 0;
  for (const char of spaces) width += char === '\t' ? 4 : 1;
  return width;
}

/** Lo que se leyó de un Markdown. openFence es true si el archivo termina con una cerca sin cerrar */
export interface MarkdownOutline {
  lines: OutlineLine[];
  openFence: boolean;
}

/**
 * Lee un Markdown a líneas. Salta el encabezado YAML, los bloques de código y los comentarios, que
 * pueden ocupar varias líneas. Una cerca se cierra con el mismo carácter y al menos el mismo largo, y
 * una que nunca se cierra se traga el resto del archivo, como en CommonMark, y se avisa
 */
export function markdownOutline(text: string): MarkdownOutline {
  const lines: OutlineLine[] = [];
  const source = text.split(/\r\n|\n|\r/);
  let index = 0;
  if (source[0]?.trim() === '---') {
    const close = source.findIndex((line, at) => at > 0 && line.trim() === '---');
    if (close > 0) index = close + 1;
  }
  let fence: { char: string; length: number } | null = null;
  let inComment = false;
  // Anchos de sangría abiertos, para que 2, 3 o 4 espacios por nivel den el mismo nivel
  const stack: number[] = [];
  for (; index < source.length; index += 1) {
    let raw = source[index] ?? '';
    if (fence) {
      const close = FENCE.exec(raw);
      const mark = close?.[1] ?? '';
      if (mark.startsWith(fence.char) && mark.length >= fence.length && raw.trim() === mark)
        fence = null;
      continue;
    }
    if (inComment) {
      const end = raw.indexOf('-->');
      if (end === -1) continue;
      inComment = false;
      // Lo que sigue al comentario en esa línea cuenta como texto de la línea
      raw = raw.slice(end + 3);
    }
    const opening = FENCE.exec(raw);
    if (opening) {
      const mark = opening[1] ?? '```';
      fence = { char: mark[0] ?? '`', length: mark.length };
      continue;
    }
    const comment = raw.indexOf('<!--');
    if (comment !== -1 && raw.slice(0, comment).trim() === '') {
      const end = raw.indexOf('-->', comment + 4);
      if (end === -1) {
        inComment = true;
        continue;
      }
      raw = raw.slice(0, comment) + raw.slice(end + 3);
    }
    if (raw.trim() === '' || PROPERTY.test(raw)) continue;
    const heading = HEADING.exec(raw);
    if (heading) {
      stack.length = 0;
      lines.push({
        depth: (heading[1] ?? '#').length - 1,
        text: (heading[2] ?? '').trim(),
        heading: true,
      });
      continue;
    }
    const bullet = BULLET.exec(raw);
    const width = indentWidth(bullet ? (bullet[1] ?? '') : (/^\s*/.exec(raw)?.[0] ?? ''));
    while (stack.length > 0 && (stack.at(-1) ?? 0) > width) stack.pop();
    if (stack.length === 0 || (stack.at(-1) ?? 0) < width) stack.push(width);
    const text = (bullet ? (bullet[2] ?? '') : raw).trim();
    if (text !== '') lines.push({ depth: stack.length - 1, text, heading: false });
  }
  return { lines, openFence: fence !== null };
}

/** Las líneas de un Markdown. Es markdownOutline sin el aviso de la cerca abierta */
export function markdownLines(text: string): OutlineLine[] {
  return markdownOutline(text).lines;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const point =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      // Sin el cero, los sustitutos sueltos de UTF-16 ni lo que pasa del último punto de código
      const valid =
        Number.isInteger(point) &&
        point > 0 &&
        point < 0x110000 &&
        !(point >= 0xd800 && point <= 0xdfff);
      return valid ? String.fromCodePoint(point) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Lee un OPML a líneas. Cada <outline text="..."> es una línea y su profundidad es la de su etiqueta.
 * Recorre el texto una sola vez con indexOf y no con una expresión regular, porque una etiqueta sin
 * cerrar repetida miles de veces vuelve cuadrática a la regular. Las comillas de los atributos se
 * respetan, así un > dentro de un valor no corta la etiqueta, y los comentarios y los CDATA se saltan.
 * Si una etiqueta no se cierra antes de que acabe el archivo, lo que sigue no se lee
 */
export function opmlLines(xml: string): OutlineLine[] {
  const lines: OutlineLine[] = [];
  let depth = 0;
  let at = 0;
  while (at < xml.length) {
    const open = xml.indexOf('<', at);
    if (open === -1) break;
    if (xml.startsWith('<!--', open)) {
      const end = xml.indexOf('-->', open + 4);
      if (end === -1) break;
      at = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', open)) {
      const end = xml.indexOf(']]>', open + 9);
      if (end === -1) break;
      at = end + 3;
      continue;
    }
    let cursor = open + 1;
    let quote = '';
    while (cursor < xml.length) {
      const char = xml.charAt(cursor);
      if (quote !== '') {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
      cursor += 1;
    }
    if (cursor >= xml.length) break;
    const tag = xml.slice(open + 1, cursor);
    at = cursor + 1;

    const closing = tag.startsWith('/');
    const selfClose = tag.endsWith('/');
    const body = tag.slice(closing ? 1 : 0, selfClose ? tag.length - 1 : tag.length);
    const name = /^[^\s/]*/.exec(body)?.[0] ?? '';
    if (name.toLowerCase() !== 'outline') continue;
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    const value = decodeEntities(textAttribute(body.slice(name.length)).replace(/<[^<>]*>/g, ''));
    if (value.trim() !== '') lines.push({ depth, text: value.trim(), heading: false });
    if (!selfClose) depth += 1;
  }
  return lines;
}

/** El valor del atributo text de una etiqueta. Recorre los pares clave valor para no confundir un text= que viva dentro del valor de otro atributo */
function textAttribute(attributes: string): string {
  for (const match of attributes.matchAll(/([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    if (match[1]?.toLowerCase() === 'text') return match[2] ?? match[3] ?? '';
  }
  return '';
}

/** Las tarjetas de una lista de líneas. Es la parte que Markdown y OPML comparten */
export function notesFromOutline(
  lines: readonly OutlineLine[],
  limits: ImportLimits,
): { notes: ParsedNote[]; errors: RowError[] } {
  const notes: ParsedNote[] = [];
  const errors: RowError[] = [];
  // El título o la línea con hijos de cada nivel que está abierta
  const context: string[] = [];
  // Niveles que ocupan los títulos ya vistos. Las viñetas que cuelgan de un título van debajo de él,
  // así una viñeta con hijos no borra el contexto del título
  let base = 0;
  let skipUntilDepth: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as OutlineLine;
    const position = index + 1;
    if (skipUntilDepth !== null) {
      if (!line.heading && line.depth > skipUntilDepth) continue;
      skipUntilDepth = null;
    }
    // Una línea más larga que un campo no es una tarjeta y leerla a fondo cuesta de más
    if (line.text.length > limits.maxFieldChars) {
      errors.push({ position, code: 'too_long' });
      continue;
    }
    if (MACRO.test(line.text)) continue;
    const parsed = parseLine(line.text);
    const following = lines[index + 1];
    const hasChildren =
      following !== undefined && !following.heading && following.depth > line.depth;
    if (line.heading) {
      context.length = line.depth;
      context[line.depth] = parsed.plain;
      base = line.depth + 1;
      continue;
    }
    // El contexto llega hasta el nivel de la línea. Una hermana de un tema ya no es parte de él
    const level = base + line.depth;
    context.length = Math.min(context.length, level);
    let note: Pick<ParsedNote, 'kind' | 'front' | 'back'>;
    switch (parsed.mark.type) {
      case 'forward':
        note = { kind: 'basic', front: parsed.mark.left, back: parsed.mark.right };
        break;
      case 'backward':
        note = { kind: 'basic', front: parsed.mark.right, back: parsed.mark.left };
        break;
      case 'both':
        note = { kind: 'basic_reverse', front: parsed.mark.left, back: parsed.mark.right };
        break;
      case 'cloze':
        if (clozeHoles(parsed.mark.text).length === 0) {
          errors.push({ position, code: 'cloze_without_holes' });
          continue;
        }
        note = { kind: 'cloze', front: parsed.mark.text, back: '' };
        break;
      case 'multiline': {
        // La respuesta son las líneas que cuelgan de la pregunta, que ya no son tarjetas propias
        const answer: string[] = [];
        let next = index + 1;
        while (
          next < lines.length &&
          !lines[next]?.heading &&
          (lines[next]?.depth ?? 0) > line.depth
        ) {
          answer.push(parseLine(lines[next]?.text ?? '').plain);
          next += 1;
        }
        skipUntilDepth = line.depth;
        if (answer.length === 0) {
          errors.push({ position, code: 'empty_back' });
          continue;
        }
        note = { kind: 'basic', front: parsed.mark.front, back: answer.join('; ') };
        break;
      }
      default:
        // Una línea con hijos que no es tarjeta es un tema que da contexto a lo que cuelga de ella
        if (hasChildren) context[level] = parsed.plain;
        continue;
    }
    const path = context.slice(0, CONTEXT_DEPTH).filter((name) => name !== '');
    const contextTag = path.length > 0 ? sanitizeTag(path.join('::')) : '';
    if (notes.length >= limits.maxNotes) {
      errors.push({ position, code: 'too_many_notes' });
      break;
    }
    notes.push({
      guid: null,
      ...note,
      html: false,
      tags: normalizeTags([...(contextTag ? [contextTag] : []), ...parsed.tags]),
      deckPath: [],
      position,
    });
  }
  return { notes, errors };
}

function finish(
  source: 'markdown' | 'opml',
  fileName: string,
  lines: OutlineLine[],
  limits: ImportLimits,
  warnings: ImportWarning[] = [],
): ParsedImport {
  if (lines.length === 0) throw new ImportError('empty');
  const { notes, errors } = notesFromOutline(lines, limits);
  if (notes.length === 0 && errors.length === 0) throw new ImportError('empty');
  return { source, format: source, fileName, notes, warnings, errors };
}

export function parseMarkdown(
  bytes: Uint8Array,
  fileName: string,
  limits: ImportLimits = IMPORT_LIMITS,
): ParsedImport {
  if (bytes.length > limits.maxDocumentBytes) throw new ImportError('too_large');
  const { lines, openFence } = markdownOutline(decodeText(bytes));
  return finish(
    'markdown',
    fileName,
    lines,
    limits,
    openFence ? [{ code: 'unclosed_code_fence', count: 1 }] : [],
  );
}

export function parseOpml(
  bytes: Uint8Array,
  fileName: string,
  limits: ImportLimits = IMPORT_LIMITS,
): ParsedImport {
  if (bytes.length > limits.maxDocumentBytes) throw new ImportError('too_large');
  const xml = decodeText(bytes);
  if (!/<opml\b/i.test(xml)) throw new ImportError('corrupt');
  return finish('opml', fileName, opmlLines(xml), limits);
}

/** Si el archivo es un OPML, por su contenido. Lo que se parece a un CSV sigue siendo un CSV */
export function looksLikeOpml(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 512));
  return /<opml\b/i.test(head);
}

/** Si el nombre es el de un archivo de Markdown */
export function isMarkdownName(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
}
