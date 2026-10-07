import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW, filtersOf, hasActiveFilters, pageCount } from './view';

const decks = [
  { id: 'raiz', name: 'Raíz', parentId: null },
  { id: 'hijo', name: 'Hijo', parentId: 'raiz' },
  { id: 'otro', name: 'Otro', parentId: null },
];

describe('vista de Explorar', () => {
  it('sin nada puesto no filtra ni cuenta como filtrada', () => {
    const filters = filtersOf(INITIAL_VIEW, decks);
    expect(filters.deckIds).toBeNull();
    expect(filters.tag).toBeNull();
    expect(filters.kinds.size).toBe(0);
    expect(hasActiveFilters(INITIAL_VIEW)).toBe(false);
  });

  it('elegir un mazo incluye a los que cuelgan de él', () => {
    const filters = filtersOf({ ...INITIAL_VIEW, deckId: 'raiz' }, decks);
    expect([...(filters.deckIds ?? [])].sort()).toEqual(['hijo', 'raiz']);
    expect(hasActiveFilters({ ...INITIAL_VIEW, deckId: 'raiz' })).toBe(true);
  });

  it('omit deja sin aplicar un solo filtro, para contar lo que daría cada opción', () => {
    const view = {
      ...INITIAL_VIEW,
      deckId: 'raiz',
      tag: 'a::b',
      status: new Set(['due' as const]),
    };
    expect(filtersOf(view, decks, 'deck').deckIds).toBeNull();
    expect(filtersOf(view, decks, 'tag').tag).toBeNull();
    expect(filtersOf(view, decks, 'status').status.size).toBe(0);
    expect(filtersOf(view, decks, 'tag').deckIds).not.toBeNull();
  });

  it('el orden y el espacio en la búsqueda no cuentan como filtro', () => {
    expect(
      hasActiveFilters({ ...INITIAL_VIEW, text: '   ', sort: { key: 'front', direction: 'asc' } }),
    ).toBe(false);
    expect(hasActiveFilters({ ...INITIAL_VIEW, kind: 'cloze' })).toBe(true);
  });

  it('las páginas son de 50 y siempre hay al menos una', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
    expect(pageCount(20_000)).toBe(400);
  });
});
