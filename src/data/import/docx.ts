// Importador de documentos de Word (D-093). Un .docx es un zip con word/document.xml, y para sacar
// tarjetas basta recorrer ese XML. No hace falta convertir a HTML ni tener DOM, así corre en el
// Worker. Hay dos fuentes de tarjetas. Las tablas, cada fila con dos columnas o más es una tarjeta,
// como en una hoja de Excel. Y los párrafos con las mismas marcas de Apuntes, Pregunta :: Respuesta,
// Término ;; Definición y {{huecos}}. Los títulos del documento pasan a etiquetas en ruta para que
// las tarjetas queden ordenadas por tema. Se conservan negritas, cursivas y subrayado. Las imágenes
// no se importan todavía. El XML se lee con un recorrido propio y nunca se expanden entidades
// externas, así no hay forma de leer archivos ni de pedir cosas a la red.
import { parseLine } from '../../engines/outline';
import { normalizeTags, sanitizeTag } from '../../engines/tagPath';
import { clozeHoles } from '../content/cloze';
import { escapeHtml } from '../content/plainText';
import { IMPORT_LIMITS, type ImportLimits } from './limits';
import { notesFromRows } from './rows';
import { ImportError, WarningTally, type ParsedImport, type ParsedNote } from './types';
import { readZip } from './zip';

/**
 * Una pieza del XML. O una etiqueta, con su diagonal de cierre, su nombre, sus atributos y su diagonal
 * de autocierre, o un texto
 */
type XmlToken = readonly [
  whole: string,
  closing: string | undefined,
  name: string | undefined,
  attributes: string | undefined,
  selfClosing: string | undefined,
  text: string | undefined,
];

const TAG_NAME = /^[A-Za-z0-9:_-]+/;

/**
 * Recorre el XML una sola vez con indexOf, en lugar de una expresión regular con atributos perezosos,
 * que con miles de etiquetas sin cerrar se vuelve cuadrática. Lo que no es una etiqueta completa se
 * entrega como texto, y si un < nunca encuentra su > lo que queda es texto suelto
 */
function* xmlTokens(xml: string): Generator<XmlToken> {
  let at = 0;
  while (at < xml.length) {
    if (xml.charAt(at) !== '<') {
      const next = xml.indexOf('<', at);
      const end = next === -1 ? xml.length : next;
      yield [xml.slice(at, end), undefined, undefined, undefined, undefined, xml.slice(at, end)];
      at = end;
      continue;
    }
    const close = xml.indexOf('>', at + 1);
    if (close === -1) {
      yield [xml.slice(at), undefined, undefined, undefined, undefined, xml.slice(at + 1)];
      return;
    }
    const inner = xml.slice(at + 1, close);
    const closing = inner.startsWith('/') ? '/' : '';
    const name = TAG_NAME.exec(inner.slice(closing.length))?.[0];
    const rest = name === undefined ? '' : inner.slice(closing.length + name.length);
    const selfClosing = rest.endsWith('/') ? '/' : '';
    const attributes = selfClosing ? rest.slice(0, -1) : rest;
    if (name !== undefined && (attributes === '' || /^\s/.test(attributes))) {
      yield [xml.slice(at, close + 1), closing, name, attributes, selfClosing, undefined];
      at = close + 1;
      continue;
    }
    // No es una etiqueta. Lo que sigue al < hasta el siguiente < es texto
    const next = xml.indexOf('<', at + 1);
    const end = next === -1 ? xml.length : next;
    yield [xml.slice(at, end), undefined, undefined, undefined, undefined, xml.slice(at + 1, end)];
    at = end;
  }
}
const HEADING = /^(?:Heading|T[íi]tulo|Ttulo|Titre|Titel)\s*([1-3])$/i;

const decodeEntities = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_all, code: string) =>
      String.fromCodePoint(Math.min(0x10ffff, Number.parseInt(code, 16))),
    )
    .replace(/&#(\d+);/g, (_all, code: string) =>
      String.fromCodePoint(Math.min(0x10ffff, Number(code))),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

interface Paragraph {
  html: string;
  plain: string;
  heading: number | null;
}

type Block = { type: 'paragraph'; paragraph: Paragraph } | { type: 'table'; rows: string[][] };

const attr = (attributes: string, name: string): string | null => {
  const found = new RegExp(`${name}="([^"]*)"`).exec(attributes);
  return found ? (found[1] ?? '') : null;
};

/** Un formato de run está activo si aparece y no está apagado con val 0 o false */
const on = (attributes: string) => {
  const value = attr(attributes, 'w:val');
  return value === null || !/^(0|false|none)$/i.test(value);
};

function readBlocks(xml: string): { blocks: Block[]; drawings: number } {
  const blocks: Block[] = [];
  let drawings = 0;
  // Una pila de tablas permite tablas dentro de celdas, aunque sus filas se aplanan en la de afuera
  const tables: { rows: string[][]; row: string[] | null; cell: string[] | null }[] = [];
  let paragraph: { html: string; plain: string; style: string | null } | null = null;
  let run: { bold: boolean; italic: boolean; underline: boolean; text: string } | null = null;
  let inText = false;
  let inRunProperties = false;

  const closeRun = () => {
    if (!run || !paragraph) return;
    let html = escapeHtml(run.text);
    if (html !== '') {
      if (run.underline) html = `<u>${html}</u>`;
      if (run.italic) html = `<i>${html}</i>`;
      if (run.bold) html = `<b>${html}</b>`;
      paragraph.html += html;
      paragraph.plain += run.text;
    }
    run = null;
  };
  const closeParagraph = () => {
    if (!paragraph) return;
    const heading = HEADING.exec(paragraph.style ?? '');
    const done: Paragraph = {
      html: paragraph.html,
      plain: paragraph.plain.trim(),
      heading: heading ? Number(heading[1]) : null,
    };
    paragraph = null;
    const table = tables.at(-1);
    if (table?.cell) {
      if (done.plain !== '') table.cell.push(done.html.trim());
      return;
    }
    if (done.plain !== '') blocks.push({ type: 'paragraph', paragraph: done });
  };

  for (const [, closing, name, attributes = '', selfClosing, text] of xmlTokens(xml)) {
    if (text !== undefined) {
      if (inText && run) run.text += decodeEntities(text);
      continue;
    }
    if (!name) continue;
    const close = closing === '/';
    switch (name) {
      case 'w:tbl':
        if (!close) tables.push({ rows: [], row: null, cell: null });
        else {
          const done = tables.pop();
          if (done && tables.length === 0) blocks.push({ type: 'table', rows: done.rows });
        }
        break;
      case 'w:tr': {
        const table = tables.at(-1);
        if (!table) break;
        if (!close) table.row = [];
        else if (table.row) {
          table.rows.push(table.row);
          table.row = null;
        }
        break;
      }
      case 'w:tc': {
        const table = tables.at(-1);
        if (!table) break;
        if (!close) table.cell = [];
        else if (table.cell) {
          table.row?.push(table.cell.join('<br>'));
          table.cell = null;
        }
        break;
      }
      case 'w:p':
        if (!close && selfClosing !== '/') paragraph = { html: '', plain: '', style: null };
        else if (close) closeParagraph();
        break;
      case 'w:pStyle':
        if (paragraph) paragraph.style = attr(attributes, 'w:val');
        break;
      case 'w:r':
        if (!close && selfClosing !== '/')
          run = { bold: false, italic: false, underline: false, text: '' };
        else if (close) closeRun();
        break;
      case 'w:rPr':
        inRunProperties = !close && selfClosing !== '/';
        break;
      case 'w:b':
        if (run && inRunProperties) run.bold = on(attributes);
        break;
      case 'w:i':
        if (run && inRunProperties) run.italic = on(attributes);
        break;
      case 'w:u':
        if (run && inRunProperties) run.underline = on(attributes);
        break;
      case 'w:t':
        inText = !close && selfClosing !== '/';
        break;
      case 'w:tab':
        if (run && !close) run.text += ' ';
        break;
      case 'w:br':
      case 'w:cr':
        if (run && !close) run.text += ' ';
        break;
      case 'w:drawing':
      case 'w:pict':
        if (!close) drawings += 1;
        break;
    }
  }
  return { blocks, drawings };
}

export function parseDocx(
  bytes: Uint8Array,
  fileName: string,
  limits: ImportLimits = IMPORT_LIMITS,
): ParsedImport {
  if (bytes.length > limits.maxDocumentBytes) throw new ImportError('too_large');
  const entries = readZip(
    bytes,
    { ...limits, maxUnpackedBytes: limits.maxDocumentBytes * 4 },
    (info) => info.name === 'word/document.xml',
  );
  const document = entries['word/document.xml'];
  if (!document) throw new ImportError('unsupported');
  if (document.length > limits.maxDocumentBytes) throw new ImportError('too_large');
  const { blocks, drawings } = readBlocks(new TextDecoder('utf-8').decode(document));
  if (blocks.length === 0) throw new ImportError('empty');

  const warnings = new WarningTally();
  warnings.add('media_skipped', drawings);
  const notes: ParsedNote[] = [];
  const errors: ParsedImport['errors'] = [];
  const headings: string[] = [];
  let position = 0;

  for (const block of blocks) {
    position += 1;
    const context = headings.length > 0 ? sanitizeTag(headings.join('::')) : '';
    if (block.type === 'table') {
      const result = notesFromRows(block.rows, { html: true }, limits);
      for (const note of result.notes) {
        notes.push({
          ...note,
          tags: normalizeTags([...(context ? [context] : []), ...note.tags]),
          position,
        });
      }
      errors.push(...result.errors.map((error) => ({ ...error, position })));
      for (const warning of result.warnings) warnings.add(warning.code, warning.count);
      continue;
    }
    const { paragraph } = block;
    if (paragraph.heading !== null) {
      headings.length = paragraph.heading - 1;
      headings[paragraph.heading - 1] = paragraph.plain;
      continue;
    }
    // Párrafos con las marcas de Apuntes. Las líneas que piden respuesta en las líneas de abajo
    // necesitan un apunte con niveles, y un párrafo suelto no los tiene, así que se saltan
    const { mark, tags: lineTags } = parseLine(paragraph.plain);
    let note: Pick<ParsedNote, 'kind' | 'front' | 'back'> | null = null;
    switch (mark.type) {
      case 'forward':
        note = { kind: 'basic', front: mark.left, back: mark.right };
        break;
      case 'backward':
        note = { kind: 'basic', front: mark.right, back: mark.left };
        break;
      case 'both':
        note = { kind: 'basic_reverse', front: mark.left, back: mark.right };
        break;
      case 'cloze':
        if (clozeHoles(mark.text).length === 0) {
          errors.push({ position, code: 'cloze_without_holes' });
          continue;
        }
        note = { kind: 'cloze', front: mark.text, back: '' };
        break;
      default:
        break;
    }
    if (!note) continue;
    notes.push({
      guid: null,
      ...note,
      html: false,
      tags: normalizeTags([...(context ? [context] : []), ...lineTags]),
      deckPath: [],
      position,
    });
  }
  if (notes.length === 0 && errors.length === 0) throw new ImportError('empty');
  return { source: 'docx', format: 'docx', fileName, notes, warnings: warnings.toList(), errors };
}
