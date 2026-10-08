// Apuntes en esquema tipo RemNote (D-085, fila 2). Un apunte es una lista de líneas con sangría y
// cada línea puede volverse una tarjeta con solo escribir una marca. Este motor es puro. Lee las
// líneas, entiende sus marcas y dice qué tarjetas salen, qué línea tiene un problema y cómo queda
// la lista al sangrar, mover o borrar. Guardar las tarjetas es trabajo de la capa de datos.
//
// Marcas de una línea.
// - Pregunta :: Respuesta         tarjeta básica, una carta
// - Término ;; Definición         básica con tarjeta inversa, dos cartas
// - La {{metformina}} baja ...    cloze, un hueco por cada llave. También vale {{c1::texto}} y los
//                                 huecos dentro de otros, con las mismas reglas que Anki
// - #tema::subtema                etiqueta en ruta. Las líneas hijas la heredan
// - [[Otro apunte]]               enlace a otro apunte por su título
// Los marcadores :: y ;; llevan espacio a los dos lados para no chocar con las etiquetas en ruta ni
// con los huecos. Si una línea tiene huecos y también ::, manda el hueco.
//
// Una línea con marca pero incompleta, por ejemplo una pregunta sin respuesta todavía, no genera
// tarjeta nueva y se marca con su problema. Quien guarda conserva la última tarjeta buena.
import { clozeHoles, clozeOpenings } from './cloze';
import { normalizeTags, sanitizeTag } from './tagPath';

export const OUTLINE_MAX_DEPTH = 8;
export const OUTLINE_LINE_MAX = 1000;
export const OUTLINE_LINES_MAX = 2000;
/** Largo máximo de cada campo de una tarjeta, igual que el editor de tarjetas a mano */
const FIELD_MAX = 3000;

export interface OutlineLineLike {
  readonly id: string;
  /** Nivel de sangría. 0 es el nivel de arriba */
  readonly depth: number;
  readonly text: string;
}

export type LineMark = 'none' | 'basic' | 'basic_reverse' | 'cloze';
export type LineError = 'empty_front' | 'empty_back' | 'no_cloze' | 'unclosed_cloze' | 'too_long';

export interface ParsedLine {
  mark: LineMark;
  /** El texto sin etiquetas y con los enlaces aplanados */
  clean: string;
  front: string;
  back: string;
  /** El texto con huecos ya numerados, solo en cloze */
  cloze: string;
  tags: string[];
  /** Títulos enlazados con [[ ]], sin repetir */
  links: string[];
  error: LineError | null;
}

const TAG_PATTERN = /(^|\s)#([^\s#]+)/g;
const LINK_PATTERN = /\[\[([^[\]\n]+?)\]\]/g;
const MARKER_PATTERN = /\s(::|;;)(?:\s|$)/;
/** Un hueco sin número, {{texto}}. Los que ya traen cN:: se dejan como están */
const PLAIN_HOLE_PATTERN = /\{\{(?!c\d+::)([^{}]+?)\}\}/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Clave para comparar títulos sin importar mayúsculas, acentos ni espacios de más */
export function titleKey(title: string): string {
  return collapse(title).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Numera los huecos sin número a partir del mayor que ya existe, uno por hueco */
function numberPlainHoles(text: string): string {
  let highest = 0;
  for (const match of text.matchAll(/\{\{c(\d+)::/g)) highest = Math.max(highest, Number(match[1]));
  return text.replace(PLAIN_HOLE_PATTERN, (_all, inner: string) => {
    highest += 1;
    return `{{c${highest}::${inner}}}`;
  });
}

/** Lee una línea y dice qué marca tiene, qué etiquetas y enlaces trae y si está completa */
export function parseLine(raw: string): ParsedLine {
  const tags: string[] = [];
  const withoutTags = raw.replace(TAG_PATTERN, (_all, lead: string, tag: string) => {
    const clean = sanitizeTag(tag.replace(TRAILING_PUNCTUATION, ''));
    if (clean !== '') tags.push(clean);
    return lead;
  });
  const links: string[] = [];
  const linked = withoutTags.replace(LINK_PATTERN, (_all, title: string) => {
    const name = collapse(title);
    if (name !== '' && !links.some((known) => titleKey(known) === titleKey(name))) links.push(name);
    return name;
  });
  const clean = collapse(linked);
  const result: ParsedLine = {
    mark: 'none',
    clean,
    front: '',
    back: '',
    cloze: '',
    tags: normalizeTags(tags),
    links,
    error: null,
  };
  if (clean === '') return result;

  if (clean.includes('{{')) {
    const text = numberPlainHoles(clean);
    result.mark = 'cloze';
    result.cloze = text;
    if (text.length > FIELD_MAX) result.error = 'too_long';
    else if (clozeOpenings(text) === 0) result.error = 'no_cloze';
    else {
      // Un hueco sin cerrar o sin respuesta dejaría la respuesta a la vista en la tarjeta
      const usable = clozeHoles(text).filter(
        (hole) => hole.ordinal >= 1 && hole.ordinal <= 100 && hole.answer.trim() !== '',
      );
      if (usable.length !== clozeOpenings(text)) result.error = 'unclosed_cloze';
    }
    return result;
  }

  const marker = MARKER_PATTERN.exec(clean);
  if (!marker) return result;
  const front = clean.slice(0, marker.index).trim();
  const back = clean.slice(marker.index + marker[0].length).trim();
  result.mark = marker[1] === ';;' ? 'basic_reverse' : 'basic';
  result.front = front;
  result.back = back;
  if (front === '') result.error = 'empty_front';
  else if (back === '') result.error = 'empty_back';
  else if (front.length > FIELD_MAX || back.length > FIELD_MAX) result.error = 'too_long';
  return result;
}

export type PlannedDraft =
  | { kind: 'basic'; front: string; back: string }
  | { kind: 'basic_reverse'; front: string; back: string }
  | { kind: 'cloze'; text: string; extra: string };

export interface PlannedCard {
  lineId: string;
  draft: PlannedDraft;
  /** Etiquetas de la línea, las heredadas de las líneas de arriba y las del apunte */
  tags: string[];
  /** Cuántas cartas da esta línea */
  cards: number;
}

export interface LineAnalysis {
  lineId: string;
  parsed: ParsedLine;
  /** Las líneas de arriba, de la raíz a la más cercana, como texto limpio */
  breadcrumb: string[];
  tags: string[];
}

export interface OutlinePlan {
  lines: LineAnalysis[];
  cards: PlannedCard[];
  /** Líneas con una marca incompleta */
  problems: { lineId: string; error: LineError }[];
  /** Líneas que ya no tienen ninguna marca */
  unmarked: string[];
  links: string[];
}

/** Cartas que da una línea ya leída */
function cardsOf(parsed: ParsedLine): number {
  if (parsed.mark === 'basic') return 1;
  if (parsed.mark === 'basic_reverse') return 2;
  if (parsed.mark !== 'cloze') return 0;
  return new Set(clozeHoles(parsed.cloze).map((hole) => hole.ordinal)).size;
}

/**
 * Lee todo el apunte. Cada línea hereda las etiquetas de las que tiene arriba y las del apunte, y una
 * tarjeta cloze lleva de contexto el camino de líneas que la contienen
 */
export function analyzeOutline(
  lines: readonly OutlineLineLike[],
  pageTags: readonly string[] = [],
): OutlinePlan {
  const base = normalizeTags(pageTags);
  const stack: { depth: number; clean: string; tags: string[] }[] = [];
  const analysis: LineAnalysis[] = [];
  const cards: PlannedCard[] = [];
  const problems: OutlinePlan['problems'] = [];
  const unmarked: string[] = [];
  const links: string[] = [];

  for (const line of lines) {
    while (stack.length > 0 && (stack.at(-1)?.depth ?? 0) >= line.depth) stack.pop();
    const parsed = parseLine(line.text);
    const inherited = stack.flatMap((entry) => entry.tags);
    const tags = normalizeTags([...base, ...inherited, ...parsed.tags]);
    const breadcrumb = stack.map((entry) => entry.clean).filter((text) => text !== '');
    analysis.push({ lineId: line.id, parsed, breadcrumb, tags });
    stack.push({ depth: line.depth, clean: parsed.clean, tags: parsed.tags });
    for (const title of parsed.links)
      if (!links.some((known) => titleKey(known) === titleKey(title))) links.push(title);

    if (parsed.mark === 'none') {
      unmarked.push(line.id);
      continue;
    }
    if (parsed.error) {
      problems.push({ lineId: line.id, error: parsed.error });
      continue;
    }
    const draft: PlannedDraft =
      parsed.mark === 'cloze'
        ? { kind: 'cloze', text: parsed.cloze, extra: breadcrumb.join(' › ').slice(0, FIELD_MAX) }
        : { kind: parsed.mark, front: parsed.front, back: parsed.back };
    cards.push({ lineId: line.id, draft, tags, cards: cardsOf(parsed) });
  }
  return { lines: analysis, cards, problems, unmarked, links };
}

// ---------------------------------------------------------------------------------------------
// Estructura de la lista

/** Una línea nunca queda más de un nivel por debajo de la de arriba ni pasa del tope */
export function normalizeDepths<T extends OutlineLineLike>(lines: readonly T[]): T[] {
  let previous = -1;
  return lines.map((line) => {
    const depth = Math.max(0, Math.min(line.depth, previous + 1, OUTLINE_MAX_DEPTH));
    previous = depth;
    return depth === line.depth ? line : { ...line, depth };
  });
}

/** Dónde acaba, sin incluirla, la rama que empieza en esta línea */
export function subtreeEnd(lines: readonly OutlineLineLike[], index: number): number {
  const depth = lines[index]?.depth ?? 0;
  let end = index + 1;
  while (end < lines.length && (lines[end]?.depth ?? 0) > depth) end += 1;
  return end;
}

export function hasChildren(lines: readonly OutlineLineLike[], index: number): boolean {
  return subtreeEnd(lines, index) > index + 1;
}

const shift = <T extends OutlineLineLike>(line: T, delta: number): T => ({
  ...line,
  depth: line.depth + delta,
});

/** Mete la línea y lo que cuelga de ella un nivel. No puede quedar más hondo que la de arriba + 1 */
export function indentLine<T extends OutlineLineLike>(lines: readonly T[], index: number): T[] {
  const line = lines[index];
  const previous = lines[index - 1];
  if (!line || !previous) return [...lines];
  if (line.depth >= previous.depth + 1 || line.depth >= OUTLINE_MAX_DEPTH) return [...lines];
  const end = subtreeEnd(lines, index);
  return lines.map((entry, position) =>
    position >= index && position < end ? shift(entry, 1) : entry,
  );
}

/** Saca la línea y lo que cuelga de ella un nivel. En el nivel 0 no hace nada */
export function outdentLine<T extends OutlineLineLike>(lines: readonly T[], index: number): T[] {
  const line = lines[index];
  if (!line || line.depth === 0) return [...lines];
  const end = subtreeEnd(lines, index);
  const moved = lines.map((entry, position) =>
    position >= index && position < end ? shift(entry, -1) : entry,
  );
  return normalizeDepths(moved);
}

/**
 * Mueve la rama de una línea sobre su hermana anterior (-1) o siguiente (1). Si no tiene hermana en
 * esa dirección no pasa nada. Devuelve la lista y dónde quedó la línea
 */
export function moveLine<T extends OutlineLineLike>(
  lines: readonly T[],
  index: number,
  direction: -1 | 1,
): { lines: T[]; index: number } {
  const line = lines[index];
  if (!line) return { lines: [...lines], index };
  const end = subtreeEnd(lines, index);
  const block = lines.slice(index, end);
  if (direction === -1) {
    // La hermana de arriba es la línea previa más cercana con la misma sangría
    let sibling = index - 1;
    while (sibling >= 0 && (lines[sibling]?.depth ?? 0) > line.depth) sibling -= 1;
    if (sibling < 0 || (lines[sibling]?.depth ?? 0) < line.depth)
      return { lines: [...lines], index };
    return {
      lines: [
        ...lines.slice(0, sibling),
        ...block,
        ...lines.slice(sibling, index),
        ...lines.slice(end),
      ],
      index: sibling,
    };
  }
  const next = lines[end];
  if (!next || next.depth !== line.depth) return { lines: [...lines], index };
  const nextEnd = subtreeEnd(lines, end);
  return {
    lines: [
      ...lines.slice(0, index),
      ...lines.slice(end, nextEnd),
      ...block,
      ...lines.slice(nextEnd),
    ],
    index: index + (nextEnd - end),
  };
}

/**
 * Agrega una línea nueva debajo de la actual. Si la actual tiene hijas la nueva entra de primera
 * hija, para que las hijas no se vuelvan suyas. Si no, queda al mismo nivel
 */
export function insertLineBelow<T extends OutlineLineLike>(
  lines: readonly T[],
  index: number,
  make: (depth: number) => T,
): { lines: T[]; index: number } {
  const current = lines[index];
  if (!current) return { lines: [...lines, make(0)], index: lines.length };
  const depth = hasChildren(lines, index)
    ? Math.min(current.depth + 1, OUTLINE_MAX_DEPTH)
    : current.depth;
  return {
    lines: [...lines.slice(0, index + 1), make(depth), ...lines.slice(index + 1)],
    index: index + 1,
  };
}

/**
 * Quita solo esa línea. Las que cuelgan de ella suben un nivel y siguen colgando de la de arriba, así
 * no se pierde nada por accidente
 */
export function removeLine<T extends OutlineLineLike>(lines: readonly T[], index: number): T[] {
  const line = lines[index];
  if (!line) return [...lines];
  const end = subtreeEnd(lines, index);
  const promoted = lines.slice(index + 1, end).map((entry) => shift(entry, -1));
  return normalizeDepths([...lines.slice(0, index), ...promoted, ...lines.slice(end)]);
}

/** Las líneas que se ven cuando algunas ramas están plegadas */
export function visibleIndexes(
  lines: readonly OutlineLineLike[],
  collapsed: ReadonlySet<string>,
): number[] {
  const visible: number[] = [];
  let hiddenBelow = Infinity;
  lines.forEach((line, index) => {
    if (line.depth > hiddenBelow) return;
    hiddenBelow = Infinity;
    visible.push(index);
    if (collapsed.has(line.id) && hasChildren(lines, index)) hiddenBelow = line.depth;
  });
  return visible;
}

// ---------------------------------------------------------------------------------------------
// Enlaces entre apuntes

export interface TitledPage {
  readonly id: string;
  readonly title: string;
}

/** A qué apunte lleva cada título enlazado. Los que no existen quedan en null */
export function resolveLinks<T extends TitledPage>(
  pages: readonly T[],
  titles: readonly string[],
): Map<string, T | null> {
  const byKey = new Map(pages.map((page) => [titleKey(page.title), page] as const));
  return new Map(titles.map((title) => [title, byKey.get(titleKey(title)) ?? null] as const));
}

/** Los apuntes que enlazan a este título, sin contarse a sí mismo */
export function backlinks<T extends TitledPage & { readonly lines: readonly OutlineLineLike[] }>(
  pages: readonly T[],
  target: TitledPage,
): T[] {
  const key = titleKey(target.title);
  return pages.filter(
    (page) =>
      page.id !== target.id &&
      page.lines.some((line) =>
        parseLine(line.text).links.some((title) => titleKey(title) === key),
      ),
  );
}

// ---------------------------------------------------------------------------------------------
// Marcas con un botón

export type MarkKind = 'card' | 'reverse' | 'hole' | 'link' | 'tag';

/**
 * Pone una marca en el texto de una línea según donde está el cursor o la selección. Los botones de
 * la barra la usan, para que quien no tiene teclado de computadora también pueda escribir marcas.
 * Devuelve el texto nuevo y dónde queda el cursor
 */
export function applyMark(
  text: string,
  start: number,
  end: number,
  mark: MarkKind,
): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.max(from, Math.min(Math.max(start, end), text.length));
  const before = text.slice(0, from);
  const selected = text.slice(from, to);
  const after = text.slice(to);

  if (mark === 'hole' || mark === 'link') {
    const [open, close] = mark === 'hole' ? ['{{', '}}'] : ['[[', ']]'];
    const next = `${before}${open}${selected}${close}${after}`;
    // Con selección el cursor queda después del cierre. Sin ella, adentro para escribir
    return {
      text: next,
      caret: from + open.length + (selected === '' ? 0 : selected.length + close.length),
    };
  }
  if (mark === 'tag') {
    const lead = before === '' || /\s$/.test(before) ? '' : ' ';
    return { text: `${before}${lead}#${after}`, caret: before.length + lead.length + 1 };
  }
  // La marca va después de lo seleccionado, con un espacio a cada lado sin duplicar los que ya hay
  const marker = mark === 'card' ? '::' : ';;';
  const head = `${before}${selected}`;
  const lead = head === '' || /\s$/.test(head) ? '' : ' ';
  const tail = after.startsWith(' ') ? '' : ' ';
  return {
    text: `${head}${lead}${marker}${tail}${after}`,
    caret: head.length + lead.length + marker.length + 1,
  };
}
