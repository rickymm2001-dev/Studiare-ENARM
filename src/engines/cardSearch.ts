// Buscar tarjetas (B4 del plan del cambio, comentario 11, antes Explorar de D-085). El motor del
// buscador rápido. Entradas, una fila por tarjeta con su texto, etiquetas, mazo, tema y estado, que
// se arman una sola vez al cargar. Salidas, las filas que cumplen la búsqueda en el orden pedido y
// cuántas daría cada filtro con los demás puestos, para el conteo de los chips. Todo sale de una sola
// pasada sobre las filas, que ya vienen ordenadas, así que escribir en la búsqueda no vuelve a
// ordenar. Con 10,000 tarjetas una búsqueda completa tarda pocos milisegundos y la prueba de
// rendimiento exige menos de 100 ms (cardSearch.performance.test.ts).
// La búsqueda de texto no distingue acentos ni mayúsculas. Las palabras van con Y, las comillas
// buscan una frase y un guion delante excluye la palabra, como en Explorar. Además acepta campo:valor
// (mazo:, tema:, estado:, vence:, etiqueta:, intervalo:, fallos:, tipo:, frente: y reverso:), con
// un guion delante para negarlo (V4-B3). Un campo que no se conoce, o con un valor que no vale, se
// busca como texto normal, así una frase con dos puntos no se pierde.
// La ruta de temas llega hasta la misma profundidad que los temas de cada mazo (TOPIC_OUTLINE_DEPTH,
// rama, materia y tema), así la columna, la lista, el panel y el filtro dicen lo mismo que Repasar.
// Los niveles de más abajo, como Linfoma de Hodgkin debajo de Linfomas, solo sirven para buscar.
// Las columnas de texto se ordenan como el español, con Intl.Collator es-MX sin distinguir acentos.
import type { FsrsCardState } from '@/data/schemas/common';
import { htmlToPlain } from './cardText';
import { TOPIC_OUTLINE_DEPTH } from './deckTopics';
import { tagUnder } from './tagPath';

/** Estados de una tarjeta que se eligen en el chip de estado. Se aceptan con O */
export type CardState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended';
export const CARD_STATES: readonly CardState[] = [
  'new',
  'learning',
  'review',
  'relearning',
  'suspended',
];

/** Separador de la ruta del mazo y de la ruta de temas al mostrarlas */
export const PATH_SEPARATOR = ' › ';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CardControversy {
  reason: string;
  sources: readonly { key: string; locator: string | null }[];
  simulated: boolean;
}

/** Lo que se necesita de cada tarjeta. Las caras ya vienen como las vería el alumno */
export interface CardSearchSource {
  cardId: string;
  noteId: string;
  deckId: string;
  kind: string;
  tags: readonly string[];
  /** HTML saneado de la cara que pregunta y de la que responde */
  front: string;
  back: string;
  origin: string;
  createdAt: string;
  updatedAt: string;
  state: FsrsCardState | null;
  /** Señal de controversia que puso la IA, o null */
  controversy?: CardControversy | null;
  /** La propuso la IA a partir de un texto del alumno y sigue en borrador */
  aiDraft?: boolean;
  /** Mazos desde el que elige el alumno hasta el de la tarjeta, como Medicina interna (Paco), Reumatología */
  deckPath: readonly string[];
  /** Temas de la rama al más fino, ya legibles. Vacía si la tarjeta no tiene tema */
  topicPath: readonly string[];
}

export interface CardSearchRow {
  cardId: string;
  noteId: string;
  deckId: string;
  kind: string;
  tags: readonly string[];
  /** Texto plano de cada cara, en una línea */
  front: string;
  back: string;
  origin: string;
  createdAt: string;
  updatedAt: string;
  fsrs: 'new' | 'learning' | 'review' | 'relearning';
  /** Próximo repaso. null en una tarjeta nueva */
  due: string | null;
  dueMs: number | null;
  /** Días entre el último repaso y el próximo. null en una tarjeta nueva */
  interval: number | null;
  lapses: number;
  suspended: boolean;
  leech: boolean;
  controversy: CardControversy | null;
  aiDraft: boolean;
  deckLabel: string;
  /** Temas de la rama hacia abajo, hasta TOPIC_OUTLINE_DEPTH niveles, como en Repasar */
  topicPath: readonly string[];
  /** El tema más fino de esa ruta, para la columna de tema. Cadena vacía si no tiene */
  topic: string;
  /** Claves de cada tramo de la ruta de temas, para filtrar por cualquier nivel */
  topicKeys: readonly string[];
  /** Texto en minúsculas y sin acentos donde se busca */
  search: string;
  /** Claves para ordenar sin volver a normalizar el texto */
  sortFront: string;
  sortDeck: string;
  sortTopic: string;
}

/** Minúsculas y sin acentos, para buscar sin importar cómo se escribió */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Orden del español sin distinguir acentos ni mayúsculas. La ñ va después de toda la n */
const collator = new Intl.Collator('es-MX', { sensitivity: 'base' });

/**
 * Clave para ordenar un texto. Sin la marca de los huecos ({{c1:: y }}) y sin lo que va antes de la
 * primera letra o número, como el ¿ de una pregunta, así ¿Cuál? va con la c y no después de la z.
 * Las claves se comparan con compareSortKeys
 */
export function sortKey(text: string): string {
  return text
    .replace(/\{\{c\d+::/giu, '')
    .replace(/\}\}/gu, '')
    .replace(/^[^\p{L}\p{N}]+/u, '');
}

/** Compara dos claves de sortKey como el español, sin distinguir acentos ni mayúsculas */
export function compareSortKeys(a: string, b: string): number {
  return collator.compare(a, b);
}

/** La clave de un tramo de la ruta de temas, la misma que usan los chips para filtrar */
export function topicKey(path: readonly string[]): string {
  return foldText(path.join(PATH_SEPARATOR));
}

/**
 * Texto plano de un HTML saneado, en una sola línea. Usa el lector de cardText, que recorre el texto
 * una sola vez, así un campo enorme o hostil no vuelve lento al buscador
 */
export function plainText(html: string): string {
  return htmlToPlain(html);
}

function intervalOf(state: FsrsCardState | null): number | null {
  if (!state || state.state === 'new') return null;
  if (state.lastReview === null) return Math.round(state.scheduledDays);
  const days = (Date.parse(state.due) - Date.parse(state.lastReview)) / DAY_MS;
  return Math.max(0, Math.round(days));
}

/** Arma las filas. Una tarjeta es sanguijuela al llegar a leechLapses olvidos */
export function buildSearchRows(
  sources: readonly CardSearchSource[],
  suspended: ReadonlySet<string>,
  leechLapses: number,
): CardSearchRow[] {
  return sources.map((source) => {
    const front = plainText(source.front);
    const back = plainText(source.back);
    const lapses = source.state?.lapses ?? 0;
    const due = source.state && source.state.state !== 'new' ? source.state.due : null;
    const deckLabel = source.deckPath.join(PATH_SEPARATOR);
    // Se ignoran los niveles vacíos, como en el árbol de temas de cada mazo
    const fullTopicPath = source.topicPath.map((name) => name.trim()).filter((name) => name !== '');
    const topicPath = fullTopicPath.slice(0, TOPIC_OUTLINE_DEPTH);
    return {
      cardId: source.cardId,
      noteId: source.noteId,
      deckId: source.deckId,
      kind: source.kind,
      tags: source.tags,
      front,
      back,
      origin: source.origin,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      fsrs: source.state?.state ?? 'new',
      due,
      dueMs: due === null ? null : Date.parse(due),
      interval: intervalOf(source.state),
      lapses,
      suspended: suspended.has(source.cardId),
      leech: lapses >= leechLapses,
      controversy: source.controversy ?? null,
      aiDraft: source.aiDraft ?? false,
      deckLabel,
      topicPath,
      topic: topicPath.at(-1) ?? '',
      topicKeys: topicPath.map((_, index) => topicKey(topicPath.slice(0, index + 1))),
      search: foldText(
        `${front} ${back} ${source.tags.join(' ')} ${deckLabel} ${fullTopicPath.join(' ')}`,
      ),
      sortFront: sortKey(front),
      sortDeck: sortKey(deckLabel),
      sortTopic: sortKey(topicPath.join(PATH_SEPARATOR)),
    };
  });
}

export interface CardSearchQuery {
  /** Texto libre. Palabras con Y entre ellas, "frases" y -palabra para excluir */
  text: string;
  /** Mazos incluidos. null son todos */
  deckIds: ReadonlySet<string> | null;
  /** Clave de un tramo de la ruta de temas, con todo lo que cuelga de él. null son todos */
  topic: string | null;
  /** Estados que se aceptan, cualquiera de ellos. Vacío son todos */
  states: ReadonlySet<CardState>;
  /** Solo las que ya tocan, sin contar las suspendidas */
  due: boolean;
  /** Solo las que se olvidan una y otra vez */
  leech: boolean;
  /** Solo las que la IA marcó con una señal de controversia */
  flagged: boolean;
  /** Tipos de nota. Vacío son todos */
  kinds: ReadonlySet<string>;
  /** Contenido precargado, propio o todo */
  origin: 'all' | 'preloaded' | 'own';
  /** Ruta de etiqueta, con todo lo que cuelga de ella. null son todas */
  tag: string | null;
}

export const EMPTY_QUERY: CardSearchQuery = {
  text: '',
  deckIds: null,
  topic: null,
  states: new Set(),
  due: false,
  leech: false,
  flagged: false,
  kinds: new Set(),
  origin: 'all',
  tag: null,
};

interface TextQuery {
  must: string[];
  mustNot: string[];
}

/** Separa la búsqueda en lo que debe estar y lo que no. Las comillas agrupan una frase */
export function parseTextQuery(text: string): TextQuery {
  const query: TextQuery = { must: [], mustNot: [] };
  for (const match of foldText(text).matchAll(/(-?)(?:"([^"]+)"|(\S+))/g)) {
    const term = (match[2] ?? match[3] ?? '').trim();
    if (term === '') continue;
    (match[1] === '-' ? query.mustNot : query.must).push(term);
  }
  return query;
}

/** Campos que se pueden buscar con campo:valor */
export const SEARCH_FIELDS = [
  'mazo',
  'tema',
  'estado',
  'vence',
  'etiqueta',
  'intervalo',
  'fallos',
  'tipo',
  'frente',
  'reverso',
] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

const STATE_VALUES: Readonly<Record<string, CardState>> = {
  nueva: 'new',
  aprendizaje: 'learning',
  repaso: 'review',
  reaprendizaje: 'relearning',
  suspendida: 'suspended',
};
const KIND_VALUES: Readonly<Record<string, string>> = {
  basica: 'basic',
  inversa: 'basic_reverse',
  cloze: 'cloze',
};
const COMPARISON = /^(>=|<=|>|<|=)?(\d{1,6})$/;
/** Hasta cuántos días adelante se acepta vence:N */
const MAX_DUE_WITHIN_DAYS = 365;

/** Un filtro de campo:valor ya validado. value va sin acentos ni mayúsculas */
export interface FieldFilter {
  field: SearchField;
  value: string;
  negate: boolean;
}

function isValidFieldValue(field: SearchField, value: string): boolean {
  switch (field) {
    case 'estado':
      return value in STATE_VALUES;
    case 'tipo':
      return value in KIND_VALUES;
    case 'vence': {
      if (value === 'hoy') return true;
      const days = Number(value);
      return /^\d{1,3}$/.test(value) && days >= 1 && days <= MAX_DUE_WITHIN_DAYS;
    }
    case 'intervalo':
    case 'fallos':
      return COMPARISON.test(value);
    default:
      return value !== '';
  }
}

/**
 * Separa de la búsqueda los campo:valor válidos y deja el resto como texto. Va sobre el texto ya sin
 * acentos. Con comillas el valor puede llevar espacios, como tema:"cancer de mama"
 */
export function extractFieldFilters(text: string): { rest: string; fields: FieldFilter[] } {
  const fields: FieldFilter[] = [];
  const pattern = new RegExp(`(^|\\s)(-?)(${SEARCH_FIELDS.join('|')}):(?:"([^"]+)"|(\\S+))`, 'g');
  const folded = foldText(text);
  const rest = folded.replace(
    pattern,
    (whole: string, lead: string, minus: string, field: string, quoted?: string, bare?: string) => {
      const value = (quoted ?? bare ?? '').trim();
      if (!isValidFieldValue(field as SearchField, value)) return whole;
      fields.push({ field: field as SearchField, value, negate: minus === '-' });
      return lead;
    },
  );
  return { rest, fields };
}

function compares(actual: number | null, value: string): boolean {
  const match = COMPARISON.exec(value);
  if (actual === null || match === null) return false;
  const target = Number(match[2]);
  switch (match[1]) {
    case '>':
      return actual > target;
    case '>=':
      return actual >= target;
    case '<':
      return actual < target;
    case '<=':
      return actual <= target;
    default:
      return actual === target;
  }
}

function matchesField(row: CardSearchRow, filter: FieldFilter, nowMs: number): boolean {
  const { value } = filter;
  switch (filter.field) {
    case 'mazo':
      return foldText(row.deckLabel).includes(value);
    case 'tema':
      return foldText(row.topicPath.join(' ')).includes(value);
    case 'estado': {
      const state = STATE_VALUES[value];
      return state === 'suspended' ? row.suspended : row.fsrs === state && !row.suspended;
    }
    case 'vence':
      if (value === 'hoy') return isDue(row, nowMs);
      return !row.suspended && row.dueMs !== null && row.dueMs <= nowMs + Number(value) * DAY_MS;
    case 'etiqueta':
      return row.tags.some((tag) => foldText(tag).includes(value));
    case 'intervalo':
      return compares(row.interval, value);
    case 'fallos':
      return compares(row.lapses, value);
    case 'tipo':
      return row.kind === KIND_VALUES[value];
    case 'frente':
      return foldText(row.front).includes(value);
    case 'reverso':
      return foldText(row.back).includes(value);
  }
}

/** Si la tarjeta ya toca. Una suspendida nunca toca */
export function isDue(row: CardSearchRow, nowMs: number): boolean {
  return !row.suspended && row.dueMs !== null && row.dueMs <= nowMs;
}

function hasState(row: CardSearchRow, states: ReadonlySet<CardState>): boolean {
  return states.has(row.fsrs) || (row.suspended && states.has('suspended'));
}

/** Cuántas tarjetas daría cada opción de los chips con los demás filtros puestos */
export interface CardSearchFacets {
  /** Por mazo de la tarjeta, sin sumar los de abajo */
  decks: Map<string, number>;
  /** Por clave de cada tramo de la ruta de temas */
  topics: Map<string, number>;
  states: Record<CardState, number>;
  due: number;
  leech: number;
  flagged: number;
}

export interface CardSearchResult {
  rows: CardSearchRow[];
  facets: CardSearchFacets;
}

type Facet = 'deck' | 'topic' | 'state' | 'due' | 'leech' | 'flagged';

/**
 * Las filas que cumplen la búsqueda, en el orden en que llegan, y los conteos de cada chip. Una fila
 * que falla un solo filtro con chip todavía cuenta para las opciones de ese chip, que es lo que el
 * alumno vería al cambiarlo. nowMs decide qué ya toca
 */
export function searchCards(
  rows: readonly CardSearchRow[],
  query: CardSearchQuery,
  nowMs: number,
): CardSearchResult {
  const { rest, fields } = extractFieldFilters(query.text);
  const text = parseTextQuery(rest);
  const hasText = text.must.length > 0 || text.mustNot.length > 0 || fields.length > 0;
  const { deckIds, topic, states, kinds, origin, tag } = query;
  const facets: CardSearchFacets = {
    decks: new Map(),
    topics: new Map(),
    states: { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0 },
    due: 0,
    leech: 0,
    flagged: 0,
  };
  const addDeck = (row: CardSearchRow) => {
    facets.decks.set(row.deckId, (facets.decks.get(row.deckId) ?? 0) + 1);
  };
  const addTopics = (row: CardSearchRow) => {
    for (const key of row.topicKeys) facets.topics.set(key, (facets.topics.get(key) ?? 0) + 1);
  };
  const addStates = (row: CardSearchRow) => {
    facets.states[row.fsrs] += 1;
    if (row.suspended) facets.states.suspended += 1;
  };
  const found: CardSearchRow[] = [];
  for (const row of rows) {
    // Lo que no tiene chip descarta de una vez, empezando por lo más barato
    if (kinds.size > 0 && !kinds.has(row.kind)) continue;
    if (origin === 'preloaded' && row.origin !== 'preloaded') continue;
    if (origin === 'own' && row.origin === 'preloaded') continue;
    if (tag !== null && !row.tags.some((candidate) => tagUnder(candidate, tag))) continue;
    const due = isDue(row, nowMs);
    // Cuántos filtros con chip falla y cuál fue el último. Con dos o más ya no cuenta para nada
    let misses = 0;
    let missed: Facet = 'deck';
    if (deckIds && !deckIds.has(row.deckId)) {
      misses += 1;
      missed = 'deck';
    }
    if (topic !== null && !row.topicKeys.includes(topic)) {
      misses += 1;
      missed = 'topic';
    }
    if (states.size > 0 && !hasState(row, states)) {
      misses += 1;
      missed = 'state';
    }
    if (query.due && !due) {
      misses += 1;
      missed = 'due';
    }
    if (query.leech && !row.leech) {
      misses += 1;
      missed = 'leech';
    }
    if (query.flagged && row.controversy === null) {
      misses += 1;
      missed = 'flagged';
    }
    if (misses > 1) continue;
    if (hasText) {
      if (text.must.some((term) => !row.search.includes(term))) continue;
      if (text.mustNot.some((term) => row.search.includes(term))) continue;
      if (fields.some((filter) => matchesField(row, filter, nowMs) === filter.negate)) continue;
    }
    if (misses === 0) {
      found.push(row);
      addDeck(row);
      addTopics(row);
      addStates(row);
      if (due) facets.due += 1;
      if (row.leech) facets.leech += 1;
      if (row.controversy !== null) facets.flagged += 1;
      continue;
    }
    // Falla solo un filtro. Cuenta para las opciones de ese chip. Los chips que se prenden y apagan
    // no suman aquí, porque con el chip prendido esta fila sigue sin pasar
    if (missed === 'deck') addDeck(row);
    else if (missed === 'topic') addTopics(row);
    else if (missed === 'state') addStates(row);
  }
  return { rows: found, facets };
}

export type CardSortKey =
  'front' | 'deck' | 'topic' | 'status' | 'due' | 'interval' | 'lapses' | 'created' | 'updated';

export interface CardSort {
  key: CardSortKey;
  direction: 'asc' | 'desc';
}

const STATUS_RANK: Record<CardSearchRow['fsrs'], number> = {
  new: 0,
  learning: 1,
  relearning: 2,
  review: 3,
};

/** Orden del estado. Las suspendidas van después de todas las demás */
function statusRank(row: CardSearchRow): number {
  return STATUS_RANK[row.fsrs] + (row.suspended ? 10 : 0);
}

/** Compara por caracteres lo que no se lee, como los IDs y las fechas ISO */
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Compara dos números que pueden faltar. Lo que falta va al final en los dos sentidos */
function compareOptional(a: number | null, b: number | null, factor: number): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return factor * (a - b);
}

/**
 * Ordena sin cambiar la lista original. Las tarjetas sin próximo repaso ni intervalo, que son las
 * nuevas, van al final en los dos sentidos. A igual valor manda el ID, para que el orden sea estable
 */
export function sortCards(rows: readonly CardSearchRow[], sort: CardSort): CardSearchRow[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  const compare = (a: CardSearchRow, b: CardSearchRow): number => {
    switch (sort.key) {
      case 'front':
        return factor * compareSortKeys(a.sortFront, b.sortFront);
      case 'deck':
        return factor * compareSortKeys(a.sortDeck, b.sortDeck);
      case 'topic':
        // Sin tema al final, como las fechas que faltan
        if (a.sortTopic === '' || b.sortTopic === '')
          return compareOptional(a.sortTopic === '' ? null : 0, b.sortTopic === '' ? null : 0, 1);
        return factor * compareSortKeys(a.sortTopic, b.sortTopic);
      case 'status':
        return factor * (statusRank(a) - statusRank(b));
      case 'due':
        return compareOptional(a.dueMs, b.dueMs, factor);
      case 'interval':
        return compareOptional(a.interval, b.interval, factor);
      case 'lapses':
        return factor * (a.lapses - b.lapses);
      case 'created':
        return factor * compareText(a.createdAt, b.createdAt);
      case 'updated':
        return factor * compareText(a.updatedAt, b.updatedAt);
    }
  };
  return [...rows].sort((a, b) => compare(a, b) || compareText(a.cardId, b.cardId));
}
