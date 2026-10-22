/**
 * Apuntes en esquema (Fase C2, Etapa 3, D-085 fila 2 y D-092).
 *
 * Qué hace. Un apunte es un árbol de líneas, como en RemNote. Escribir una marca en una línea la
 * vuelve tarjeta. Este motor lee las marcas, arma el plan de tarjetas de todo el apunte, convierte
 * el árbol a la forma que usa el editor y de vuelta, y resuelve los enlaces entre apuntes. No sabe
 * nada de React, de TipTap ni de la base de datos.
 * Entradas. El árbol de líneas (OutlineNode), con un id estable por línea, y una función que da ids
 * nuevos cuando hacen falta.
 * Salidas. Para cada línea con marca, una tarjeta propuesta (CardPlan) con el id de la línea, las
 * etiquetas que le tocan y los problemas encontrados (PlanIssue). El id de la línea es lo que une la
 * línea con su nota, así editar el texto conserva las cartas y con ellas su historial de repaso.
 * Marcas, tomadas del centro de ayuda de RemNote (solo las ideas, no su código)
 *   - Pregunta >> Respuesta, tarjeta que pregunta el frente
 *   - Respuesta << Pregunta, tarjeta que pregunta lo que está a la derecha
 *   - Pregunta <> Respuesta, y Concepto :: Definición, dos tarjetas, una por lado
 *   - Término ;; Descriptor, una tarjeta hacia delante
 *   - Pregunta >>> al final de la línea, la respuesta son las líneas que cuelgan de ella
 *   - {{texto}} o {{c2::texto}}, hueco de tarjeta cloze. Los huecos sin número se numeran en orden
 *   - #etiqueta o #Ruta::subruta, etiqueta que pasa a las tarjetas de la línea y de todo lo que
 *     cuelga de ella. [[Título]], enlace a otro apunte
 * Método
 *   - Primero se enmascaran los huecos, las etiquetas y los enlaces para que los :: de una ruta de
 *     etiqueta o de {{c1::...}} no se confundan con una marca
 *   - Una línea con separador no es cloze, y sus llaves dobles quedan como texto
 *   - Solo la primera marca de la línea cuenta. Las líneas que cuelgan de una con >>> son su
 *     respuesta y no generan tarjetas propias, y el plan avisa si traían una marca
 * Umbrales. Hasta 2,000 líneas por apunte, 8 niveles, 3,000 caracteres por campo y 500 tarjetas. Son
 * topes de seguridad de la interfaz y de la base, no de enseñanza (J).
 * De qué es el apunte (B6 del plan del cambio). Un tema del ENARM le pone a cada tarjeta la etiqueta
 * topic: con su clave, la misma que usan Mis errores, Repasar y el tutor. Una materia libre, como las
 * de la carrera, solo le pone Materia::Nombre, así no entra a las estadísticas por tema del ENARM ni
 * a Conócete (isFreeSubjectNote). Sí cuenta en el tiempo de estudio, la racha y la meta del día.
 */
import { clozeHoles, parseCloze } from './cloze';
import {
  countNodes,
  FREE_SUBJECT_MAX_LENGTH,
  OUTLINE_LIMITS,
  outlineDepth,
  type OutlineNode,
} from './outlineLimits';
import { normalizeTags, sanitizeTag, TAG_MAX_LENGTH, TAG_SEPARATOR } from './tagPath';

// Los topes y el tipo del árbol viven en outlineLimits.ts, que el esquema de apuntes usa sin cargar
// este motor en el JavaScript inicial. Se reexportan para que nada más cambie
export { countNodes, FREE_SUBJECT_MAX_LENGTH, OUTLINE_LIMITS, outlineDepth };
export type { OutlineNode };

export type LineMark =
  | { type: 'none' }
  /** Dos tarjetas o una según la dirección. El separador queda para mostrarlo */
  | {
      type: 'forward' | 'backward' | 'both';
      separator: '>>' | '<<' | '<>' | '::' | ';;';
      left: string;
      right: string;
    }
  | { type: 'multiline'; front: string }
  | { type: 'cloze'; text: string };

export interface ParsedLine {
  mark: LineMark;
  /** Etiquetas de la línea, ya saneadas */
  tags: string[];
  /** Títulos de los apuntes que enlaza, sin repetir */
  links: string[];
  /** El texto sin etiquetas y con los enlaces sin corchetes. Es lo que se ve en la tarjeta */
  plain: string;
}

// La etiqueta empieza con una letra. Así "Causa #1 de muerte" no se come el número
const TAG_PATTERN = /(^|\s)#(\p{L}[^\s#]*)/gu;
const LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;

/** Puntuación que se pega al final de una etiqueta al escribir una frase */
const TAG_TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', ')', ']']);

/**
 * Quita la puntuación que se pega al final de una etiqueta al escribir una frase. Se recorta con un
 * ciclo y no con una expresión regular anclada al final, que con miles de signos seguidos se
 * vuelve cuadrática
 */
function cleanTag(raw: string): string {
  let end = raw.length;
  while (end > 0 && TAG_TRAILING_PUNCTUATION.has(raw.charAt(end - 1))) end -= 1;
  return sanitizeTag(raw.slice(0, end));
}

/** Etiquetas y enlaces de una línea, y el texto limpio. No decide nada sobre las marcas */
function extractInline(text: string): Pick<ParsedLine, 'tags' | 'links' | 'plain'> {
  const tags: string[] = [];
  const links: string[] = [];
  const withoutLinks = text.replace(LINK_PATTERN, (_all, title: string) => {
    const clean = title.trim();
    if (clean !== '' && !links.includes(clean)) links.push(clean);
    return clean;
  });
  const withoutTags = withoutLinks.replace(TAG_PATTERN, (_all, lead: string, raw: string) => {
    const tag = cleanTag(raw);
    if (tag !== '' && tag.length <= TAG_MAX_LENGTH) tags.push(tag);
    return lead;
  });
  return {
    tags: normalizeTags(tags),
    links,
    plain: withoutTags.replace(/[^\S\n]+/g, ' ').trim(),
  };
}

/** El texto con huecos, etiquetas y enlaces tapados, para buscar marcas sin falsos positivos */
function maskedForMarks(text: string): string {
  let masked = text;
  // Un hueco sin cerrar tapa hasta el final, así su :: no se toma por una marca. Cada región se
  // cambia por un relleno del mismo largo para no mover los índices, y todas las de un patrón en una
  // sola pasada, porque rehacer la cadena por cada región es cuadrático en líneas con miles de etiquetas
  for (const pattern of [/\{\{[\s\S]*?(?:\}\}|$)/g, LINK_PATTERN, /(^|\s)#[^\s#]+/g]) {
    masked = masked.replace(pattern, (region) => '\u0000'.repeat(region.length));
  }
  return masked;
}

const SEPARATORS = ['<>', '>>', '<<', '::', ';;'] as const;
export type Separator = (typeof SEPARATORS)[number];

function findSeparator(masked: string): { index: number; separator: Separator } | null {
  for (let index = 0; index < masked.length; index += 1) {
    // Tres signos seguidos no son una marca a mitad de línea, la de varias líneas va al final
    if (masked.startsWith('>>>', index) || masked.startsWith('<<<', index)) {
      index += 2;
      continue;
    }
    for (const separator of SEPARATORS) {
      if (masked.startsWith(separator, index)) return { index, separator };
    }
  }
  return null;
}

const MARK_TYPE: Record<Separator, 'forward' | 'backward' | 'both'> = {
  '>>': 'forward',
  '<<': 'backward',
  '<>': 'both',
  '::': 'both',
  ';;': 'forward',
};

/**
 * Numera los huecos {{texto}} que no traen número, en orden y sin repetir los que ya se usaron.
 * Devuelve el texto con huecos al estilo Anki, {{c1::texto}}, o null si no hay ninguno
 */
export function numberClozeHoles(text: string): string | null {
  // Sin ninguna llave de cierre no hay hueco, y buscar cada {{ hasta el final es cuadrático
  if (!text.includes('}}')) return null;
  const blocks = [...text.matchAll(/\{\{([\s\S]*?)\}\}/g)];
  if (blocks.length === 0) return null;
  const used = new Set<number>();
  for (const block of blocks) {
    const explicit = /^c(\d+)::/.exec(block[1] ?? '');
    if (explicit) used.add(Number(explicit[1]));
  }
  let next = 1;
  let result = '';
  let cursor = 0;
  let any = false;
  for (const block of blocks) {
    const inner = block[1] ?? '';
    result += text.slice(cursor, block.index);
    cursor = block.index + block[0].length;
    if (/^c\d+::/.test(inner)) {
      result += block[0];
      any = true;
      continue;
    }
    if (inner.trim() === '') {
      result += block[0];
      continue;
    }
    while (used.has(next)) next += 1;
    used.add(next);
    result += `{{c${next}::${inner}}}`;
    any = true;
  }
  result += text.slice(cursor);
  return any ? result : null;
}

/** Lee una línea y dice qué marca trae, sus etiquetas y sus enlaces */
export function parseLine(text: string): ParsedLine {
  const inline = extractInline(text);
  const base = { tags: inline.tags, links: inline.links, plain: inline.plain };
  const line = text.replace(/\r?\n/g, ' ');

  // Con tres signos al final la respuesta son las líneas que cuelgan
  const masked = maskedForMarks(line);
  const trimmedEnd = masked.trimEnd();
  if (trimmedEnd.endsWith('>>>')) {
    const front = extractInline(line.slice(0, trimmedEnd.length - 3)).plain;
    return { ...base, mark: front === '' ? { type: 'none' } : { type: 'multiline', front } };
  }

  const found = findSeparator(masked);
  if (found) {
    const left = extractInline(line.slice(0, found.index)).plain;
    const right = extractInline(line.slice(found.index + found.separator.length)).plain;
    if (left === '' || right === '') return { ...base, mark: { type: 'none' } };
    return {
      ...base,
      mark: {
        type: MARK_TYPE[found.separator],
        separator: found.separator,
        left,
        right,
      },
    };
  }

  const numbered = numberClozeHoles(extractInline(line).plain);
  if (numbered !== null) return { ...base, mark: { type: 'cloze', text: numbered } };
  return { ...base, mark: { type: 'none' } };
}

/**
 * Dónde está la marca de una línea, con las mismas reglas que parseLine pero aunque a un lado le
 * falte texto. Así Pregunta >> con la respuesta todavía por escribir ya cuenta como pregunta y
 * respuesta, y cambiarle el tipo no le agrega una segunda marca. Las posiciones son del texto tal
 * cual, con sus etiquetas y enlaces
 */
export type MarkSpan =
  | { type: 'none' }
  | { type: 'separator'; separator: Separator; start: number; end: number }
  | { type: 'multiline'; start: number; end: number }
  | { type: 'cloze' };

export function markSpan(text: string): MarkSpan {
  const line = text.replace(/\r?\n/g, ' ');
  const masked = maskedForMarks(line);
  const trimmedEnd = masked.trimEnd();
  if (trimmedEnd.endsWith('>>>')) {
    return { type: 'multiline', start: trimmedEnd.length - 3, end: trimmedEnd.length };
  }
  const found = findSeparator(masked);
  if (found) {
    return {
      type: 'separator',
      separator: found.separator,
      start: found.index,
      end: found.index + found.separator.length,
    };
  }
  return line.includes('}}') && /\{\{[\s\S]*?\}\}/.test(line)
    ? { type: 'cloze' }
    : { type: 'none' };
}

/** El texto de la línea con huecos, etiquetas y enlaces tapados, con las mismas posiciones */
export function maskInline(text: string): string {
  return maskedForMarks(text.replace(/\r?\n/g, ' '));
}

export type TokenKind = 'separator' | 'cloze' | 'tag' | 'link' | 'multiline';

export interface MarkToken {
  /** Posición en el texto de la línea, de start a end sin incluir end */
  start: number;
  end: number;
  kind: TokenKind;
}

/**
 * Las partes de una línea que el editor resalta, en orden. Solo marca lo que de verdad cuenta, así
 * un {{hueco}} dentro de una línea con >> no se pinta como si fuera a ser un hueco
 */
export function markTokens(text: string): MarkToken[] {
  const tokens: MarkToken[] = [];
  const line = text.replace(/\n/g, ' ');
  const parsed = parseLine(line);
  const masked = maskedForMarks(line);

  if (parsed.mark.type === 'multiline') {
    const end = masked.trimEnd().length;
    tokens.push({ start: end - 3, end, kind: 'multiline' });
  } else if (parsed.mark.type !== 'none' && parsed.mark.type !== 'cloze') {
    const found = findSeparator(masked);
    if (found) {
      tokens.push({
        start: found.index,
        end: found.index + found.separator.length,
        kind: 'separator',
      });
    }
  } else if (parsed.mark.type === 'cloze') {
    for (const match of line.matchAll(/\{\{[\s\S]*?\}\}/g)) {
      tokens.push({ start: match.index, end: match.index + match[0].length, kind: 'cloze' });
    }
  }
  for (const match of line.matchAll(TAG_PATTERN)) {
    const start = match.index + (match[1]?.length ?? 0);
    tokens.push({ start, end: match.index + match[0].length, kind: 'tag' });
  }
  for (const match of line.matchAll(LINK_PATTERN)) {
    tokens.push({ start: match.index, end: match.index + match[0].length, kind: 'link' });
  }
  return tokens.sort((a, b) => a.start - b.start);
}

export type PlanDraft =
  | { kind: 'basic'; front: string; back: string }
  | { kind: 'basic_reverse'; front: string; back: string }
  | { kind: 'cloze'; text: string; extra: string };

/** Cuántas tarjetas da un borrador. Dos con tarjeta inversa y una por número de hueco en un cloze */
export function cardCountOf(draft: PlanDraft): number {
  switch (draft.kind) {
    case 'basic':
      return 1;
    case 'basic_reverse':
      return 2;
    case 'cloze':
      return new Set(clozeHoles(draft.text).map((hole) => hole.ordinal)).size;
  }
}

export interface CardPlan {
  /** La línea de la que sale la tarjeta. Une la línea con su nota */
  nodeId: string;
  draft: PlanDraft;
  tags: string[];
}

export type PlanIssueCode =
  | 'multiline_without_children'
  | 'nested_mark_ignored'
  | 'cloze_unusable'
  | 'too_long'
  | 'too_many_cards'
  | 'too_many_nodes'
  | 'too_deep';

export interface PlanIssue {
  nodeId: string;
  code: PlanIssueCode;
}

/** Las líneas que cuelgan de una con >>> como texto de respuesta, con sangría de dos espacios */
function answerLines(children: readonly OutlineNode[], depth = 0): string[] {
  return children.flatMap((child) => {
    const plain = extractInline(child.text).plain;
    const own = plain === '' ? [] : [`${'  '.repeat(depth)}${plain}`];
    return [...own, ...answerLines(child.children, depth + 1)];
  });
}

function hasMarkDeep(nodes: readonly OutlineNode[]): boolean {
  return nodes.some(
    (node) => parseLine(node.text).mark.type !== 'none' || hasMarkDeep(node.children),
  );
}

function clozeUsable(text: string): boolean {
  const { openings } = parseCloze(text);
  // Un hueco sin cerrar o sin respuesta dejaría la respuesta a la vista en la pregunta
  const usable = clozeHoles(text).filter(
    (hole) => hole.ordinal >= 1 && hole.ordinal <= 100 && hole.answer.trim() !== '',
  );
  return openings > 0 && usable.length === openings;
}

/** El plan de tarjetas de todo el apunte, en el orden en que aparecen las líneas */
export function planCards(nodes: readonly OutlineNode[]): {
  plans: CardPlan[];
  issues: PlanIssue[];
} {
  const plans: CardPlan[] = [];
  const issues: PlanIssue[] = [];
  let visited = 0;

  const visit = (list: readonly OutlineNode[], inherited: readonly string[], depth: number) => {
    for (const node of list) {
      visited += 1;
      if (visited > OUTLINE_LIMITS.maxNodes) {
        if (visited === OUTLINE_LIMITS.maxNodes + 1)
          issues.push({ nodeId: node.id, code: 'too_many_nodes' });
        return;
      }
      if (depth > OUTLINE_LIMITS.maxDepth) {
        issues.push({ nodeId: node.id, code: 'too_deep' });
        continue;
      }
      const parsed = parseLine(node.text);
      const tags = normalizeTags([...inherited, ...parsed.tags]);
      const { mark } = parsed;
      let draft: PlanDraft | null = null;
      let descend = true;
      switch (mark.type) {
        case 'none':
          // Llaves dobles que no llegaron a ser un hueco usable, para avisar en vez de callar
          if (node.text.includes('{{')) issues.push({ nodeId: node.id, code: 'cloze_unusable' });
          break;
        case 'forward':
          draft = { kind: 'basic', front: mark.left, back: mark.right };
          break;
        case 'backward':
          draft = { kind: 'basic', front: mark.right, back: mark.left };
          break;
        case 'both':
          draft = { kind: 'basic_reverse', front: mark.left, back: mark.right };
          break;
        case 'multiline': {
          descend = false;
          const lines = answerLines(node.children);
          if (lines.length === 0) {
            issues.push({ nodeId: node.id, code: 'multiline_without_children' });
          } else {
            if (hasMarkDeep(node.children))
              issues.push({ nodeId: node.id, code: 'nested_mark_ignored' });
            draft = { kind: 'basic', front: mark.front, back: lines.join('\n') };
          }
          break;
        }
        case 'cloze':
          if (clozeUsable(mark.text)) draft = { kind: 'cloze', text: mark.text, extra: '' };
          else issues.push({ nodeId: node.id, code: 'cloze_unusable' });
          break;
      }
      if (draft) {
        const fields =
          draft.kind === 'cloze' ? [draft.text, draft.extra] : [draft.front, draft.back];
        if (fields.some((field) => field.length > OUTLINE_LIMITS.maxFieldLength)) {
          issues.push({ nodeId: node.id, code: 'too_long' });
        } else if (plans.length >= OUTLINE_LIMITS.maxCards) {
          issues.push({ nodeId: node.id, code: 'too_many_cards' });
        } else {
          plans.push({ nodeId: node.id, draft, tags });
        }
      }
      if (descend) visit(node.children, tags, depth + 1);
    }
  };
  visit(nodes, [], 1);
  return { plans, issues };
}

/** Forma del documento del editor, la de ProseMirror, sin depender de su paquete */
export interface DocNode {
  type: string;
  attrs?: { nodeId?: unknown; [key: string]: unknown };
  content?: DocNode[];
  text?: string;
}

function itemOf(node: OutlineNode): DocNode {
  const paragraph: DocNode = {
    type: 'paragraph',
    ...(node.text === '' ? {} : { content: [{ type: 'text', text: node.text }] }),
  };
  const content: DocNode[] = [paragraph];
  if (node.children.length > 0) content.push(listOf(node.children));
  return { type: 'listItem', attrs: { nodeId: node.id }, content };
}

function listOf(nodes: readonly OutlineNode[]): DocNode {
  return { type: 'bulletList', content: nodes.map(itemOf) };
}

/** El árbol de líneas como documento del editor. Un apunte vacío trae una línea en blanco */
export function outlineToDoc(nodes: readonly OutlineNode[], makeId: () => string): DocNode {
  const list = nodes.length > 0 ? nodes : [{ id: makeId(), text: '', children: [] }];
  return { type: 'doc', content: [listOf(list)] };
}

function textOf(node: DocNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return ' ';
  return (node.content ?? []).map(textOf).join('');
}

/** Forma de un id de línea válido, la misma que exige el esquema de datos (un ULID) */
export const NODE_ID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;

/**
 * Entre líneas con el mismo id, la que lo conserva. Gana la de mayor rango y, entre iguales, la
 * primera en el orden del documento. El rango lo da quien llama, con el texto como lo primero, así al
 * partir una línea con Enter al inicio el id se queda con el texto y no con la línea vacía de arriba,
 * y la tarjeta no pierde su historial
 */
export function pickIdOwners<T>(
  items: readonly { id: string; rank: number; item: T }[],
): Map<string, T> {
  const best = new Map<string, { rank: number; item: T }>();
  for (const entry of items) {
    if (entry.id === '') continue;
    const current = best.get(entry.id);
    if (!current || entry.rank > current.rank) {
      best.set(entry.id, { rank: entry.rank, item: entry.item });
    }
  }
  return new Map([...best].map(([id, value]) => [id, value.item]));
}

function itemText(item: DocNode): string {
  return (item.content ?? [])
    .filter((part) => part.type === 'paragraph')
    .map(textOf)
    .join(' ')
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

/**
 * El documento del editor como árbol de líneas. El id de cada línea sale de su atributo nodeId.
 * Una línea sin id o con un id que otra se queda, como la que nace al partir una con Enter, recibe
 * uno nuevo. Entre dos con el mismo id lo conserva la que tiene texto y, si ambas, la primera
 */
export function docToOutline(doc: DocNode, makeId: () => string): OutlineNode[] {
  const declaredOf = (item: DocNode): string => {
    const declared = item.attrs?.nodeId;
    return typeof declared === 'string' ? declared : '';
  };
  const candidates: { id: string; rank: number; item: DocNode }[] = [];
  const collect = (item: DocNode): void => {
    candidates.push({ id: declaredOf(item), rank: itemText(item) === '' ? 0 : 1, item });
    for (const part of item.content ?? []) {
      if (part.type === 'bulletList' || part.type === 'orderedList') {
        for (const child of part.content ?? []) collect(child);
      }
    }
  };
  const isList = (part: DocNode) => part.type === 'bulletList' || part.type === 'orderedList';
  const lists = (doc.content ?? []).filter(isList);
  for (const list of lists) for (const item of list.content ?? []) collect(item);
  const owners = pickIdOwners(candidates);

  const readItem = (item: DocNode): OutlineNode => {
    const declared = declaredOf(item);
    const id = declared !== '' && owners.get(declared) === item ? declared : makeId();
    const nested = (item.content ?? []).filter(isList);
    return {
      id,
      text: itemText(item),
      children: nested.flatMap((list) => (list.content ?? []).map(readItem)),
    };
  };
  return lists.flatMap((list) => (list.content ?? []).map(readItem));
}

/** Título comparable de un apunte, sin mayúsculas, acentos ni espacios de sobra */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface OutlineRef {
  id: string;
  title: string;
  nodes: readonly OutlineNode[];
}

/** Todas las líneas de un apunte con los títulos que enlazan, en orden */
function linkedLines(
  nodes: readonly OutlineNode[],
): { nodeId: string; text: string; links: string[] }[] {
  return nodes.flatMap((node) => {
    const parsed = parseLine(node.text);
    const own =
      parsed.links.length > 0 ? [{ nodeId: node.id, text: parsed.plain, links: parsed.links }] : [];
    return [...own, ...linkedLines(node.children)];
  });
}

/** A qué apuntes enlaza el apunte, resueltos por título. Los títulos que no existen salen aparte */
export function resolveLinks(
  outline: OutlineRef,
  all: readonly OutlineRef[],
): { targets: string[]; missing: string[] } {
  const byTitle = new Map(all.map((entry) => [normalizeTitle(entry.title), entry.id]));
  const targets = new Set<string>();
  const missing = new Set<string>();
  for (const line of linkedLines(outline.nodes)) {
    for (const title of line.links) {
      const target = byTitle.get(normalizeTitle(title));
      if (target !== undefined && target !== outline.id) targets.add(target);
      else if (target === undefined) missing.add(title);
    }
  }
  return { targets: [...targets], missing: [...missing] };
}

export interface Backlink {
  outlineId: string;
  title: string;
  nodeId: string;
  /** La línea donde se menciona */
  text: string;
}

/** Los apuntes y líneas que mencionan a este apunte por su título */
export function backlinks(target: OutlineRef, all: readonly OutlineRef[]): Backlink[] {
  const wanted = normalizeTitle(target.title);
  return all
    .filter((entry) => entry.id !== target.id)
    .flatMap((entry) =>
      linkedLines(entry.nodes)
        .filter((line) => line.links.some((title) => normalizeTitle(title) === wanted))
        .map((line) => ({
          outlineId: entry.id,
          title: entry.title,
          nodeId: line.nodeId,
          text: line.text,
        })),
    );
}

/**
 * De qué es el apunte (B6). Un tema del ENARM, con su rama y su clave de la taxonomía, o una materia
 * libre que escribe el alumno, como las de la carrera. Sin tema es null
 */
export type OutlineSubject =
  { kind: 'enarm'; branch: string; topic: string } | { kind: 'free'; name: string };

/**
 * Prefijo de la etiqueta con la clave del tema del ENARM. Es el mismo TOPIC_TAG_PREFIX de Mis
 * errores (src/data/usecases/errorCards.ts), que leen Repasar y el tutor. Una prueba los mantiene
 * iguales
 */
export const ENARM_TOPIC_TAG_PREFIX = 'topic:';

/** Raíz de la etiqueta de una materia libre, Materia::Anatomía. No es una clave del ENARM */
export const FREE_SUBJECT_TAG_ROOT = 'Materia';

/**
 * Las etiquetas que el tema del apunte le pone a todas sus tarjetas. Un tema del ENARM da topic:clave
 * y cuenta en las estadísticas del ENARM. Una materia libre da Materia::Nombre y nunca da topic:,
 * así no cuenta en las estadísticas por tema ni en Conócete
 */
export function subjectTags(subject: OutlineSubject | null | undefined): string[] {
  if (!subject) return [];
  if (subject.kind === 'enarm') return [`${ENARM_TOPIC_TAG_PREFIX}${subject.topic}`];
  // Siempre cuelga de Materia, así un nombre como topic:algo nunca empieza con el prefijo del ENARM
  const name = sanitizeTag(subject.name);
  return name === '' ? [] : normalizeTags([`${FREE_SUBJECT_TAG_ROOT}${TAG_SEPARATOR}${name}`]);
}

/** Comienzo de la etiqueta de una materia libre, Materia:: */
export const FREE_SUBJECT_TAG_PREFIX = `${FREE_SUBJECT_TAG_ROOT}${TAG_SEPARATOR}`;

/** Si la etiqueta es de una materia libre, Materia::Nombre. Como en Anki, no distingue mayúsculas */
export function isFreeSubjectTag(tag: string): boolean {
  return tag.toLowerCase().startsWith(FREE_SUBJECT_TAG_PREFIX.toLowerCase());
}

/** Si la etiqueta es de un tema, topic:clave del ENARM o Materia::Nombre de una materia libre */
export function isSubjectTag(tag: string): boolean {
  return tag.startsWith(ENARM_TOPIC_TAG_PREFIX) || isFreeSubjectTag(tag);
}

/**
 * Si las etiquetas son de una nota de materia libre, con Materia:: y sin tema del ENARM. Esas notas
 * no cuentan en las estadísticas por tema ni en Conócete. Una con topic: sí cuenta en las dos, aunque
 * también traiga una etiqueta Materia:: escrita en la línea
 */
export function isFreeSubjectNote(tags: readonly string[]): boolean {
  return tags.some(isFreeSubjectTag) && !tags.some((tag) => tag.startsWith(ENARM_TOPIC_TAG_PREFIX));
}

/**
 * Las etiquetas de una nota con el tema del apunte, para la que sigue al apunte sin ser de una línea,
 * como la que propuso la IA. Quita las de cualquier tema y pone primero las del tema que toca, como en
 * las tarjetas de las líneas. Las demás se quedan en su orden
 */
export function withSubjectTags(
  tags: readonly string[],
  subject: OutlineSubject | null | undefined,
): string[] {
  return normalizeTags([...subjectTags(subject), ...tags.filter((tag) => !isSubjectTag(tag))]);
}

/** Si dos temas son el mismo. Un nombre libre se compara tal cual, porque cambia la etiqueta */
export function sameSubject(
  a: OutlineSubject | null | undefined,
  b: OutlineSubject | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind === 'enarm' && b.kind === 'enarm') return a.branch === b.branch && a.topic === b.topic;
  if (a.kind === 'free' && b.kind === 'free') return a.name === b.name;
  return false;
}

/**
 * Las materias libres que el alumno ya usó, sin repetir y en orden alfabético del español, para
 * sugerirlas al crear otro apunte
 */
export function freeSubjects(
  outlines: readonly { subject?: OutlineSubject | null | undefined }[],
): string[] {
  const kept = new Map<string, string>();
  for (const outline of outlines) {
    const subject = outline.subject;
    if (subject?.kind !== 'free') continue;
    const key = normalizeTitle(subject.name);
    if (key !== '' && !kept.has(key)) kept.set(key, subject.name.trim());
  }
  return [...kept.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Una línea de una plantilla, con las que cuelgan de ella */
export interface TemplateLine {
  text: string;
  children?: readonly TemplateLine[];
}

/** Las líneas de una plantilla como árbol del apunte, cada una con su id propio */
export function nodesFromTemplate(
  lines: readonly TemplateLine[],
  makeId: () => string,
): OutlineNode[] {
  return lines.map((line) => ({
    id: makeId(),
    text: line.text,
    children: nodesFromTemplate(line.children ?? [], makeId),
  }));
}

/** La primera línea en blanco del árbol, para dejar ahí el cursor al abrir una plantilla */
export function firstBlankLine(nodes: readonly OutlineNode[]): string | null {
  for (const node of nodes) {
    if (node.text.trim() === '') return node.id;
    const inner = firstBlankLine(node.children);
    if (inner !== null) return inner;
  }
  return null;
}

/** Las etiquetas de todo el apunte, sin repetir, para listarlas y buscar */
export function outlineTags(nodes: readonly OutlineNode[]): string[] {
  const found: string[] = [];
  const walk = (list: readonly OutlineNode[]) => {
    for (const node of list) {
      found.push(...parseLine(node.text).tags);
      walk(node.children);
    }
  };
  walk(nodes);
  return normalizeTags(found);
}
