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
import { ImportError, type ParsedImport, type ParsedNote, type RowError } from './types';

/** Una línea del esquema con su nivel. heading es un título de Markdown, que marca contexto */
export interface OutlineLine {
  depth: number;
  text: string;
  heading: boolean;
}

/** Hasta cuántos niveles de contexto pasan a la etiqueta en ruta */
const CONTEXT_DEPTH = 3;
/** Propiedades de Logseq y de Roam que van en su propia línea y no son tarjetas */
const PROPERTY =
  /^[\s-]*(?:id|collapsed|heading|alias|title|type|icon|public|template|filters)::\s*\S*$/i;
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

/** Lee un Markdown a líneas. Salta el encabezado YAML, los bloques de código y los comentarios */
export function markdownLines(text: string): OutlineLine[] {
  const lines: OutlineLine[] = [];
  const source = text.split(/\r\n|\n|\r/);
  let index = 0;
  if (source[0]?.trim() === '---') {
    const close = source.findIndex((line, at) => at > 0 && line.trim() === '---');
    if (close > 0) index = close + 1;
  }
  let inCode = false;
  // Anchos de sangría abiertos, para que 2, 3 o 4 espacios por nivel den el mismo nivel
  const stack: number[] = [];
  for (; index < source.length; index += 1) {
    const raw = source[index] ?? '';
    if (/^\s*(```|~~~)/.test(raw)) {
      inCode = !inCode;
      continue;
    }
    if (inCode || raw.trim() === '' || /^\s*<!--.*-->\s*$/.test(raw) || PROPERTY.test(raw))
      continue;
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
  return lines;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const point =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isInteger(point) && point > 0 && point < 0x110000
        ? String.fromCodePoint(point)
        : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Lee un OPML a líneas. Cada <outline text="..."> es una línea y su profundidad es la de su etiqueta */
export function opmlLines(xml: string): OutlineLine[] {
  const lines: OutlineLine[] = [];
  let depth = 0;
  for (const match of xml.matchAll(/<(\/?)outline\b([^>]*?)(\/?)>/gi)) {
    const [, close, attributes = '', selfClose] = match;
    if (close) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    const text = /\btext\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
    const value = decodeEntities((text?.[1] ?? text?.[2] ?? '').replace(/<[^>]*>/g, '')).trim();
    if (value !== '') lines.push({ depth, text: value, heading: false });
    if (!selfClose) depth += 1;
  }
  return lines;
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
  let skipUntilDepth: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as OutlineLine;
    const position = index + 1;
    if (skipUntilDepth !== null) {
      if (line.depth > skipUntilDepth) continue;
      skipUntilDepth = null;
    }
    const parsed = parseLine(line.text);
    const hasChildren = (lines[index + 1]?.depth ?? 0) > line.depth && !line.heading;
    if (line.heading) {
      context.length = line.depth;
      context[line.depth] = parsed.plain;
      continue;
    }
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
        while (next < lines.length && (lines[next]?.depth ?? 0) > line.depth) {
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
        if (hasChildren) {
          context.length = line.depth;
          context[line.depth] = parsed.plain;
        }
        continue;
    }
    const path = context.slice(0, CONTEXT_DEPTH).filter((name) => name !== '');
    const contextTag = path.length > 0 ? sanitizeTag(path.join('::')) : '';
    notes.push({
      guid: null,
      ...note,
      html: false,
      tags: normalizeTags([...(contextTag ? [contextTag] : []), ...parsed.tags]),
      deckPath: [],
      position,
    });
    if (notes.length > limits.maxNotes) {
      errors.push({ position, code: 'too_many_notes' });
      break;
    }
  }
  return { notes, errors };
}

function finish(
  source: 'markdown' | 'opml',
  fileName: string,
  lines: OutlineLine[],
  limits: ImportLimits,
): ParsedImport {
  if (lines.length === 0) throw new ImportError('empty');
  const { notes, errors } = notesFromOutline(lines, limits);
  if (notes.length === 0 && errors.length === 0) throw new ImportError('empty');
  return { source, format: source, fileName, notes, warnings: [], errors };
}

export function parseMarkdown(
  bytes: Uint8Array,
  fileName: string,
  limits: ImportLimits = IMPORT_LIMITS,
): ParsedImport {
  if (bytes.length > limits.maxDocumentBytes) throw new ImportError('too_large');
  return finish('markdown', fileName, markdownLines(decodeText(bytes)), limits);
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
