// Explorar (D-085, fila 4). Filtra, busca y ordena miles de tarjetas sin trabarse. Entradas, una fila
// por tarjeta con su texto, etiquetas, mazo y estado. Salidas, las filas que cumplen los filtros en el
// orden pedido y cuántas hay de cada estado. El texto de cada fila se normaliza una sola vez al armar
// las filas, así cada búsqueda es una pasada simple. Con 20,000 tarjetas filtra en milisegundos.
import type { FsrsCardState } from '@/data/schemas/common';
import { htmlToPlain } from './cardText';
import { tagUnder } from './tagPath';

export type ExploreStatus =
  'new' | 'learning' | 'review' | 'relearning' | 'due' | 'suspended' | 'leech';

/** Lo que se necesita de cada tarjeta. Las caras ya vienen como las vería el alumno */
export interface ExploreSource {
  cardId: string;
  noteId: string;
  deckId: string;
  kind: string;
  ordinal: number;
  tags: readonly string[];
  /** HTML saneado de la cara que pregunta y de la que responde */
  front: string;
  back: string;
  origin: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  state: FsrsCardState | null;
}

export interface ExploreRow {
  cardId: string;
  noteId: string;
  deckId: string;
  kind: string;
  ordinal: number;
  tags: readonly string[];
  front: string;
  back: string;
  origin: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  /** new, learning, review o relearning según FSRS */
  fsrs: 'new' | 'learning' | 'review' | 'relearning';
  due: string | null;
  lapses: number;
  suspended: boolean;
  leech: boolean;
  /** Texto en minúsculas y sin acentos, donde se busca */
  search: string;
}

/**
 * Texto plano de un HTML saneado, en una sola línea. Usa el lector de cardText, que recorre el texto
 * una sola vez, así un campo enorme o hostil no vuelve lento a Explorar. Los huecos ya vienen
 * dibujados por la cara de la carta, como […], y no hace falta leerlos aquí
 */
export function plainText(html: string): string {
  return htmlToPlain(html);
}

/** Minúsculas y sin acentos, para buscar sin importar cómo se escribió */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Arma las filas. Una tarjeta es sanguijuela al llegar a leechLapses olvidos */
export function buildExploreRows(
  sources: readonly ExploreSource[],
  suspended: ReadonlySet<string>,
  leechLapses: number,
): ExploreRow[] {
  return sources.map((source) => {
    const front = plainText(source.front);
    const back = plainText(source.back);
    const lapses = source.state?.lapses ?? 0;
    return {
      cardId: source.cardId,
      noteId: source.noteId,
      deckId: source.deckId,
      kind: source.kind,
      ordinal: source.ordinal,
      tags: source.tags,
      front,
      back,
      origin: source.origin,
      isDemo: source.isDemo,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      fsrs: source.state?.state ?? 'new',
      due: source.state && source.state.state !== 'new' ? source.state.due : null,
      lapses,
      suspended: suspended.has(source.cardId),
      leech: lapses >= leechLapses,
      search: foldText(`${front} ${back} ${source.tags.join(' ')}`),
    };
  });
}

export interface ExploreFilters {
  /** Mazos incluidos. null son todos */
  deckIds: ReadonlySet<string> | null;
  /** Ruta de etiqueta, con todo lo que cuelga de ella. null son todas */
  tag: string | null;
  /** Estados que se aceptan, cualquiera de ellos. Vacío son todos */
  status: ReadonlySet<ExploreStatus>;
  /** Tipos de nota. Vacío son todos */
  kinds: ReadonlySet<string>;
  /** Contenido precargado, propio o todo */
  origin: 'all' | 'preloaded' | 'own';
  /** Texto libre. Palabras con Y entre ellas, "frases" y -palabra para excluir */
  text: string;
}

export const NO_FILTERS: ExploreFilters = {
  deckIds: null,
  tag: null,
  status: new Set(),
  kinds: new Set(),
  origin: 'all',
  text: '',
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

function hasStatus(row: ExploreRow, status: ExploreStatus, now: number): boolean {
  switch (status) {
    case 'suspended':
      return row.suspended;
    case 'leech':
      return row.leech;
    case 'due':
      return !row.suspended && row.due !== null && new Date(row.due).getTime() <= now;
    default:
      return row.fsrs === status;
  }
}

/** Las filas que cumplen todos los filtros. now es el momento para decidir qué está vencido */
export function filterRows(
  rows: readonly ExploreRow[],
  filters: ExploreFilters,
  now: Date,
): ExploreRow[] {
  const query = parseTextQuery(filters.text);
  const nowMs = now.getTime();
  const wanted = [...filters.status];
  return rows.filter((row) => {
    if (filters.deckIds && !filters.deckIds.has(row.deckId)) return false;
    if (filters.tag !== null) {
      const tag = filters.tag;
      if (!row.tags.some((candidate) => tagUnder(candidate, tag))) return false;
    }
    if (filters.kinds.size > 0 && !filters.kinds.has(row.kind)) return false;
    if (filters.origin === 'preloaded' && row.origin !== 'preloaded') return false;
    if (filters.origin === 'own' && row.origin === 'preloaded') return false;
    if (wanted.length > 0 && !wanted.some((status) => hasStatus(row, status, nowMs))) return false;
    for (const term of query.must) if (!row.search.includes(term)) return false;
    for (const term of query.mustNot) if (row.search.includes(term)) return false;
    return true;
  });
}

export type ExploreSortKey = 'front' | 'due' | 'lapses' | 'created' | 'updated';
export interface ExploreSort {
  key: ExploreSortKey;
  direction: 'asc' | 'desc';
}

/** Ordena sin cambiar la lista original. Las tarjetas sin fecha de vencimiento van al final */
export function sortRows(rows: readonly ExploreRow[], sort: ExploreSort): ExploreRow[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  const compare = (a: ExploreRow, b: ExploreRow): number => {
    switch (sort.key) {
      case 'front':
        return a.front.localeCompare(b.front, 'es');
      case 'lapses':
        return a.lapses - b.lapses;
      case 'created':
        return a.createdAt.localeCompare(b.createdAt);
      case 'updated':
        return a.updatedAt.localeCompare(b.updatedAt);
      case 'due':
        if (a.due === null || b.due === null) {
          return a.due === b.due ? 0 : a.due === null ? 1 / factor : -1 / factor;
        }
        return a.due.localeCompare(b.due);
    }
  };
  return [...rows].sort((a, b) => factor * compare(a, b) || a.cardId.localeCompare(b.cardId));
}

/** Cuántas filas hay de cada estado, para mostrar los números en los filtros */
export function statusCounts(
  rows: readonly ExploreRow[],
  now: Date,
): Record<ExploreStatus, number> {
  const counts: Record<ExploreStatus, number> = {
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0,
    due: 0,
    suspended: 0,
    leech: 0,
  };
  const nowMs = now.getTime();
  for (const row of rows) {
    counts[row.fsrs] += 1;
    if (row.suspended) counts.suspended += 1;
    if (row.leech) counts.leech += 1;
    if (hasStatus(row, 'due', nowMs)) counts.due += 1;
  }
  return counts;
}
