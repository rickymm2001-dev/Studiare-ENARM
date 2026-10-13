/**
 * Volver tarjeta una línea del apunte sin saberse las marcas (B6 del plan del cambio, respuesta 74).
 *
 * Qué hace. Cambia el texto de una línea para que dé el tipo de tarjeta que eligió el alumno con un
 * botón. Pregunta y respuesta (>>), dos sentidos (::), con hueco ({{ }}), respuesta en las líneas de
 * abajo (>>>) o sin tarjeta. Es lo mismo que escribir la marca a mano, así que el apunte, sus
 * tarjetas y su historial siguen las reglas de siempre (D-092). La línea conserva su id porque solo
 * cambia su texto.
 * Entradas. El texto de la línea, la selección dentro de ella y si ya tiene líneas debajo.
 * Salidas. El texto nuevo, dónde queda el cursor y, para >>>, la línea hija que hay que crear.
 * Método
 *   - Una línea que ya es tarjeta se lee como pregunta y respuesta, sin importar su marca, y se
 *     vuelve a escribir con la marca nueva. Respuesta << Pregunta se escribe al derecho
 *   - Una línea sin marca se parte por la selección, si el alumno marcó la respuesta. Si no, en los
 *     primeros dos puntos, signo de interrogación o igual seguidos de texto. Si no, donde está el
 *     cursor, al inicio de su palabra. Si no hay dónde partir, la marca va al final y el cursor queda
 *     listo para escribir la respuesta
 *   - El hueco tapa lo seleccionado o la palabra donde está el cursor. Las etiquetas y los enlaces
 *     nunca quedan dentro de un hueco
 *   - Con >>> la respuesta pasa a una línea hija. Sin líneas debajo se crea una en blanco
 *   - Quitar la tarjeta deja Pregunta: Respuesta, que al volverla tarjeta se parte en el mismo lugar
 * Umbrales. Ninguno. Los topes de largo los revisa el editor.
 */
import { markSpan, maskInline } from './outline';

/** Los tipos que ofrece el botón de la línea */
export type LineCardKind = 'forward' | 'both' | 'cloze' | 'multiline';

/** Lo que la línea es hoy, también al revés (<<) */
export type LineKind = LineCardKind | 'backward' | 'none';

export interface LineSelection {
  /** Posiciones en el texto de la línea, start <= end. Vacía es solo el cursor */
  start: number;
  end: number;
}

export interface LineConversion {
  text: string;
  /** Dónde queda el cursor dentro de la línea */
  cursor: number;
  /** Línea nueva que va como la primera de las que cuelgan, con el cursor en ella */
  child?: { text: string; cursor: number };
}

/** Qué tarjeta da la línea según su marca, aunque le falte escribir un lado */
export function lineKindOf(text: string): LineKind {
  const span = markSpan(text);
  switch (span.type) {
    case 'none':
      return 'none';
    case 'cloze':
      return 'cloze';
    case 'multiline':
      return 'multiline';
    case 'separator':
      if (span.separator === '<<') return 'backward';
      return span.separator === '::' || span.separator === '<>' ? 'both' : 'forward';
  }
}

const SEPARATOR_OF = { forward: '>>', both: '::' } as const;

// Una etiqueta empieza con letra, igual que en el motor de apuntes
const TAG_TOKEN = /(^|\s)(#\p{L}[^\s#]*)/gu;

/** Separa las etiquetas del resto, para que nunca queden dentro de un hueco */
function peelTags(text: string): { body: string; tags: string[] } {
  const tags: string[] = [];
  const body = text.replace(TAG_TOKEN, (_all, lead: string, tag: string) => {
    tags.push(tag);
    return lead;
  });
  return { body: body.replace(/\s+/g, ' ').trim(), tags };
}

const withTags = (text: string, tags: readonly string[]) =>
  [text, ...tags].filter((part) => part !== '').join(' ');

/** Quita las llaves de los huecos y deja su respuesta. {{c2::A::pista}} queda como A */
export function unwrapHoles(text: string): string {
  let current = text;
  // De adentro hacia afuera, así un hueco dentro de otro también se abre
  for (let guard = 0; guard < 20; guard += 1) {
    const next = current.replace(/\{\{(?:c\d+::)?([^{}]*?)\}\}/g, (_all, inner: string) => {
      const cut = inner.indexOf('::');
      return cut === -1 ? inner : inner.slice(0, cut);
    });
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Pregunta y respuesta de una línea que ya tiene una marca con separador */
function sidesOf(text: string, span: { separator: string; start: number; end: number }) {
  const left = text.slice(0, span.start).trim();
  const right = text.slice(span.end).trim();
  return span.separator === '<<'
    ? { question: right, answer: left }
    : { question: left, answer: right };
}

/** Une pregunta y respuesta con la marca pedida */
function joined(question: string, separator: string, answer: string): LineConversion {
  if (answer === '') {
    const text = question === '' ? ` ${separator} ` : `${question} ${separator} `;
    // Sin pregunta el cursor va al inicio, para escribirla antes de la marca
    return { text, cursor: question === '' ? 0 : text.length };
  }
  const text = `${question} ${separator} ${answer}`.trim();
  return { text, cursor: text.length };
}

/** Pregunta: Respuesta, o con un espacio si la pregunta ya cierra con signo */
function asPlain(question: string, answer: string): LineConversion {
  if (answer === '') return { text: question, cursor: question.length };
  const glue = /[?:.!¿]$/.test(question) ? ' ' : ': ';
  const text = `${question}${glue}${answer}`;
  return { text, cursor: text.length };
}

/** Donde se parte una línea sin marca en pregunta y respuesta, o null si no hay dónde */
function splitPoint(text: string, selection: LineSelection | undefined): number | null {
  const length = text.trimEnd().length;
  if (selection && selection.end > selection.start) {
    const start = Math.max(0, Math.min(selection.start, length));
    const end = Math.max(0, Math.min(selection.end, length));
    // Marcó la respuesta, de en medio o del final. Si marcó desde el inicio, marcó la pregunta
    if (start > 0) return start;
    if (end < length) return end;
  }
  // Los dos puntos, el signo de interrogación o el igual seguidos de texto. Fuera de etiquetas,
  // enlaces y huecos, y nunca los :: de una marca
  const masked = maskInline(text);
  const found = /(?<!:):(?!:)\s+\S|\?\s+\S|\s=\s+\S/u.exec(masked);
  if (found) return found.index + (found[0].startsWith('?') ? 1 : 0);
  const caret = selection?.start;
  if (caret !== undefined && caret > 0 && caret < length) {
    // Al inicio de la palabra donde está el cursor, para no partir una palabra
    let start = caret;
    while (start > 0 && !/\s/.test(text[start - 1] ?? '')) start -= 1;
    if (start > 0 && text.slice(0, start).trim() !== '') return start;
  }
  return null;
}

/** Pregunta y respuesta de una línea sin marca, partida donde toca */
function splitPlain(text: string, selection: LineSelection | undefined) {
  const at = splitPoint(text, selection);
  if (at === null) return { question: text.trim(), answer: '' };
  // El signo que separa no pasa a ningún lado, salvo el de interrogación, que es de la pregunta
  const question = text
    .slice(0, at)
    .trim()
    .replace(/\s*[:=]$/, '');
  const answer = text
    .slice(at)
    .replace(/^\s*[:=]?\s*/, '')
    .trim();
  return { question, answer };
}

/** Las zonas del texto donde no se puede abrir un hueco, las de huecos, etiquetas y enlaces */
function blockedRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const pattern of [/\{\{[\s\S]*?(?:\}\}|$)/g, /\[\[[^[\]]+\]\]/g, /#\p{L}[^\s#]*/gu]) {
    for (const match of text.matchAll(pattern)) {
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return ranges;
}

const overlaps = (ranges: readonly [number, number][], start: number, end: number) =>
  ranges.some(([from, to]) => start < to && end > from);

/** La palabra donde está el cursor, sin la puntuación que la rodea */
function wordAt(text: string, caret: number): { start: number; end: number } | null {
  const at = Math.max(0, Math.min(caret, text.length));
  let start = at;
  let end = at;
  while (start > 0 && !/\s/.test(text[start - 1] ?? '')) start -= 1;
  while (end < text.length && !/\s/.test(text[end] ?? '')) end += 1;
  // Si el cursor quedó después de un espacio, la palabra de atrás
  if (start === end) {
    end = at;
    while (end > 0 && /\s/.test(text[end - 1] ?? '')) end -= 1;
    start = end;
    while (start > 0 && !/\s/.test(text[start - 1] ?? '')) start -= 1;
  }
  while (start < end && /[(¿¡"'«[]/.test(text[start] ?? '')) start += 1;
  while (end > start && /[.,;:)?!"'»\]]/.test(text[end - 1] ?? '')) end -= 1;
  return end > start ? { start, end } : null;
}

/** Abre un hueco en la selección o en la palabra del cursor. null si ahí no se puede */
function holeAt(text: string, selection: LineSelection | undefined): LineConversion | null {
  const blocked = blockedRanges(text);
  let range: { start: number; end: number } | null = null;
  if (selection && selection.end > selection.start) {
    let start = Math.max(0, selection.start);
    let end = Math.min(text.length, selection.end);
    while (start < end && /\s/.test(text[start] ?? '')) start += 1;
    while (end > start && /\s/.test(text[end - 1] ?? '')) end -= 1;
    if (end > start) range = { start, end };
  } else {
    range = wordAt(text, selection?.start ?? text.length);
  }
  if (!range || overlaps(blocked, range.start, range.end)) return null;
  const hole = `{{${text.slice(range.start, range.end)}}}`;
  const result = text.slice(0, range.start) + hole + text.slice(range.end);
  return { text: result, cursor: range.start + hole.length };
}

/** Un hueco vacío en el cursor, con el cursor adentro para escribir lo que tapa */
function emptyHole(text: string, caret: number): LineConversion {
  const at = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, at);
  const lead = before === '' || /\s$/.test(before) ? '' : ' ';
  const result = `${before}${lead}{{}}${text.slice(at)}`;
  return { text: result, cursor: before.length + lead.length + 2 };
}

/** Pregunta y respuesta con la respuesta en un hueco y las etiquetas al final */
function clozeOf(question: string, answer: string): LineConversion {
  const q = peelTags(unwrapHoles(question));
  const a = peelTags(unwrapHoles(answer));
  if (a.body === '') {
    const text = withTags(`${q.body} {{}}`.trim(), [...q.tags, ...a.tags]);
    const cursor = text.indexOf('{{}}') + 2;
    return { text, cursor };
  }
  const hole = `{{${a.body}}}`;
  const text = withTags(`${q.body} ${hole}`.trim(), [...q.tags, ...a.tags]);
  return { text, cursor: text.indexOf(hole) + hole.length };
}

/** La línea con >>> y la respuesta, si había, en una línea hija */
function multilineOf(question: string, answer: string, hasChildren: boolean): LineConversion {
  const front = question.trim();
  const text = front === '' ? '>>>' : `${front} >>>`;
  if (answer !== '')
    return { text, cursor: text.length, child: { text: answer, cursor: answer.length } };
  return hasChildren
    ? { text, cursor: front === '' ? 0 : text.length }
    : { text, cursor: text.length, child: { text: '', cursor: 0 } };
}

const unchanged = (text: string): LineConversion => ({ text, cursor: text.length });

/**
 * El texto de la línea con el tipo de tarjeta pedido. Si ya es de ese tipo no cambia nada, salvo un
 * hueco más en una línea que ya tiene huecos
 */
export function convertLine(
  text: string,
  target: LineCardKind | 'none',
  options: { selection?: LineSelection; hasChildren?: boolean } = {},
): LineConversion {
  const { selection } = options;
  const hasChildren = options.hasChildren ?? false;
  const current = lineKindOf(text);
  const span = markSpan(text);

  if (current === target) {
    if (target !== 'cloze') return unchanged(text);
    return holeAt(text, selection) ?? unchanged(text);
  }

  // Ya es tarjeta con separador, se reescribe con la marca nueva
  if (span.type === 'separator') {
    const { question, answer } = sidesOf(text, span);
    switch (target) {
      case 'forward':
      case 'both':
        return joined(question, SEPARATOR_OF[target], answer);
      case 'cloze':
        return clozeOf(question, answer);
      case 'multiline':
        return multilineOf(question, answer, hasChildren);
      case 'none':
        return asPlain(question, answer);
    }
  }

  // Sin separador. Lo que tenga de marca se quita y se parte como una línea sin marca. Con una marca
  // de antes la selección ya no apunta al mismo texto, así que el cursor cuenta como al final
  const marked = span.type !== 'none';
  const plain =
    span.type === 'multiline'
      ? (text.slice(0, span.start) + text.slice(span.end)).trim()
      : span.type === 'cloze'
        ? unwrapHoles(text)
        : text;
  const where = marked ? undefined : selection;

  switch (target) {
    case 'none':
      return unchanged(plain.trim());
    case 'multiline':
      return multilineOf(plain, '', hasChildren);
    case 'cloze': {
      if (plain.trim() === '') return emptyHole('', 0);
      return holeAt(plain, where) ?? emptyHole(plain, where?.start ?? plain.length);
    }
    case 'forward':
    case 'both': {
      const { question, answer } = splitPlain(plain, where);
      return joined(question, SEPARATOR_OF[target], answer);
    }
  }
}
