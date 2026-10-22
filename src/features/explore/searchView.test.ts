import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW, viewFromParams } from './searchView';

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
