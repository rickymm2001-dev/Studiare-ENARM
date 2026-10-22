// Lo que el alumno tiene puesto en Buscar tarjetas (B4 del plan del cambio). Se separa de la consulta
// del motor porque el mazo se elige con un solo ID y el motor recibe a todos sus descendientes. Los
// enlaces de siempre, como el aviso de sanguijuelas de Repasar con ?estado=sanguijuelas, siguen
// llegando con su filtro puesto.
import { descendantIds, type DeckLike } from '@/engines/deckTree';
import {
  EMPTY_QUERY,
  type CardSearchQuery,
  type CardSort,
  type CardSortKey,
  type CardState,
} from '@/engines/cardSearch';

export interface SearchView {
  text: string;
  /** Mazo elegido con todo lo que cuelga de él. Vacío son todos */
  deckId: string;
  /** Tramo de la ruta de temas elegido, con su clave para filtrar y su ruta para mostrarlo */
  topic: { key: string; path: readonly string[] } | null;
  states: ReadonlySet<CardState>;
  due: boolean;
  leech: boolean;
  flagged: boolean;
  /** Tipo de nota. Vacío son todos */
  kind: string;
  origin: CardSearchQuery['origin'];
  /** Ruta de etiqueta elegida. null son todas */
  tag: string | null;
  sort: CardSort;
}

export const INITIAL_VIEW: SearchView = {
  text: '',
  deckId: '',
  topic: null,
  states: new Set(),
  due: false,
  leech: false,
  flagged: false,
  kind: '',
  origin: 'all',
  tag: null,
  // Lo más nuevo primero, así lo que acabas de crear queda arriba
  sort: { key: 'created', direction: 'desc' },
};

/** Lo que se puede pedir por la dirección con ?estado=, como hacía Explorar */
const STATUS_PARAMS: Readonly<Record<string, Partial<SearchView>>> = {
  nuevas: { states: new Set<CardState>(['new']) },
  aprendiendo: { states: new Set<CardState>(['learning']) },
  repaso: { states: new Set<CardState>(['review']) },
  reaprendiendo: { states: new Set<CardState>(['relearning']) },
  suspendidas: { states: new Set<CardState>(['suspended']) },
  vencidas: { due: true },
  sanguijuelas: { leech: true },
  marcadas: { flagged: true },
};

/**
 * La vista con la que abre la pantalla según su dirección. ?estado= pone un filtro de estado y ?mazo=
 * el mazo con todo lo que cuelga de él, que es como llegan los botones de la pantalla Mazos
 */
export function viewFromParams(params: URLSearchParams): SearchView {
  return {
    ...INITIAL_VIEW,
    ...STATUS_PARAMS[params.get('estado') ?? ''],
    deckId: params.get('mazo') ?? '',
  };
}

/** La consulta del motor. Elegir un mazo incluye a los que cuelgan de él */
export function queryOf(view: SearchView, decks: readonly DeckLike[]): CardSearchQuery {
  return {
    text: view.text,
    deckIds: view.deckId === '' ? null : descendantIds(decks, view.deckId),
    topic: view.topic?.key ?? null,
    states: view.states,
    due: view.due,
    leech: view.leech,
    flagged: view.flagged,
    kinds: view.kind === '' ? EMPTY_QUERY.kinds : new Set([view.kind]),
    origin: view.origin,
    tag: view.tag,
  };
}

/** Cuántos filtros hay puestos, sin contar el texto ni el orden */
export function activeFilterCount(view: SearchView): number {
  return [
    view.deckId !== '',
    view.topic !== null,
    view.states.size > 0,
    view.due,
    view.leech,
    view.flagged,
    view.kind !== '',
    view.origin !== 'all',
    view.tag !== null,
  ].filter(Boolean).length;
}

/** Si algo reduce las tarjetas. El orden no cuenta y el espacio en la búsqueda tampoco */
export function hasActiveFilters(view: SearchView): boolean {
  return view.text.trim() !== '' || activeFilterCount(view) > 0;
}

/** Sin filtros ni búsqueda, con el mismo orden */
export function clearedView(view: SearchView): SearchView {
  return { ...INITIAL_VIEW, sort: view.sort };
}

/**
 * Lo que pide la vista, en una cadena, para saber cuándo cambió la búsqueda y volver a mostrar
 * desde el principio. Los datos que cambian por debajo, como una tarjeta suspendida, no cuentan
 */
export function viewKey(view: SearchView): string {
  return JSON.stringify([
    view.text,
    view.deckId,
    view.topic?.key ?? null,
    [...view.states].sort(),
    view.due,
    view.leech,
    view.flagged,
    view.kind,
    view.origin,
    view.tag,
    view.sort,
  ]);
}

/** El sentido con el que empieza cada columna al ordenar por ella */
export const FIRST_DIRECTION: Readonly<Record<CardSortKey, CardSort['direction']>> = {
  front: 'asc',
  deck: 'asc',
  topic: 'asc',
  status: 'asc',
  due: 'asc',
  interval: 'desc',
  lapses: 'desc',
  created: 'desc',
  updated: 'desc',
};

/** Tocar una columna ordena por ella, y tocarla otra vez invierte el sentido */
export function nextSort(current: CardSort, key: CardSortKey): CardSort {
  if (current.key !== key) return { key, direction: FIRST_DIRECTION[key] };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}
