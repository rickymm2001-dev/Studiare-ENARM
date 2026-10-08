// Lo que el alumno tiene puesto en Explorar. Se separa de los filtros del motor porque el mazo se
// elige con un solo id y el motor recibe a todos sus descendientes.
import { descendantIds, type DeckLike } from '@/engines/deckTree';
import {
  NO_FILTERS,
  type ExploreFilters,
  type ExploreSort,
  type ExploreStatus,
} from '@/engines/explore';

export interface ExploreView {
  text: string;
  /** Mazo elegido con todo lo que cuelga de él. Vacío son todos */
  deckId: string;
  /** Ruta de etiqueta elegida. null son todas */
  tag: string | null;
  status: ReadonlySet<ExploreStatus>;
  /** Tipo de nota. Vacío son todos */
  kind: string;
  origin: ExploreFilters['origin'];
  sort: ExploreSort;
}

export const INITIAL_VIEW: ExploreView = {
  text: '',
  deckId: '',
  tag: null,
  status: new Set(),
  kind: '',
  origin: 'all',
  // Lo más nuevo primero, así lo que acabas de crear queda arriba
  sort: { key: 'created', direction: 'desc' },
};

/** Los filtros del motor. Con omit se deja uno sin aplicar, para contar lo que daría cada opción */
export function filtersOf(
  view: ExploreView,
  decks: readonly DeckLike[],
  omit?: 'deck' | 'tag' | 'status',
): ExploreFilters {
  return {
    ...NO_FILTERS,
    text: view.text,
    deckIds: view.deckId !== '' && omit !== 'deck' ? descendantIds(decks, view.deckId) : null,
    tag: omit === 'tag' ? null : view.tag,
    status: omit === 'status' ? NO_FILTERS.status : view.status,
    kinds: view.kind === '' ? NO_FILTERS.kinds : new Set([view.kind]),
    origin: view.origin,
  };
}

/** Si hay algo puesto que reduzca las tarjetas. El orden no cuenta */
export function hasActiveFilters(view: ExploreView): boolean {
  return (
    view.text.trim() !== '' ||
    view.deckId !== '' ||
    view.tag !== null ||
    view.status.size > 0 ||
    view.kind !== '' ||
    view.origin !== 'all'
  );
}

/** Cuántas tarjetas se muestran por página */
export const PAGE_SIZE = 50;

export function pageCount(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}
