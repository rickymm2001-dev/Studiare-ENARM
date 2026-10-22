import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW, viewFromParams, withKnownDeck } from './searchView';

describe('viewFromParams', () => {
  it('sin parámetros abre con la vista de siempre', () => {
    expect(viewFromParams(new URLSearchParams())).toEqual(INITIAL_VIEW);
  });

  it('?estado= sigue poniendo el filtro de estado, como el aviso de sanguijuelas de Repasar', () => {
    const view = viewFromParams(new URLSearchParams('estado=sanguijuelas'));
    expect(view.leech).toBe(true);
    expect(view.deckId).toBe('');
  });

  it('?mazo= abre con ese mazo elegido, que es como llegan los botones de la pantalla Mazos', () => {
    const view = viewFromParams(new URLSearchParams('mazo=deck-abc'));
    expect(view.deckId).toBe('deck-abc');
    expect(view.leech).toBe(false);
  });

  it('el mazo y las sanguijuelas se piden juntos', () => {
    const view = viewFromParams(new URLSearchParams('mazo=deck-abc&estado=sanguijuelas'));
    expect(view).toMatchObject({ deckId: 'deck-abc', leech: true });
  });
});

describe('withKnownDeck', () => {
  const decks = [
    { id: 'deck-a', name: 'Urgencias' },
    { id: 'deck-b', name: 'Medicina interna', parentId: 'deck-a' },
  ];

  it('un mazo que existe deja la misma vista', () => {
    const view = viewFromParams(new URLSearchParams('mazo=deck-b&estado=sanguijuelas'));
    expect(withKnownDeck(view, decks)).toBe(view);
  });

  it('una vista sin mazo no cambia', () => {
    expect(withKnownDeck(INITIAL_VIEW, decks)).toBe(INITIAL_VIEW);
  });

  it('un mazo que no existe se suelta, y lo demás de la vista se queda', () => {
    const view = viewFromParams(new URLSearchParams('mazo=borrado&estado=sanguijuelas'));
    const fixed = withKnownDeck(view, decks);
    expect(fixed.deckId).toBe('');
    expect(fixed.leech).toBe(true);
  });

  it('sin mazos cargados todavía, un mazo pedido se suelta solo cuando ya hay lista', () => {
    const view = viewFromParams(new URLSearchParams('mazo=deck-a'));
    expect(withKnownDeck(view, [])).toMatchObject({ deckId: '' });
  });
});
