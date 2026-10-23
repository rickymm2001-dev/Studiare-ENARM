import { describe, expect, it } from 'vitest';
import { searchPathOfDeck } from './deckActions';

describe('searchPathOfDeck', () => {
  it('lleva a Buscar tarjetas con el mazo puesto', () => {
    expect(searchPathOfDeck('deck-a')).toMatch(/^\/[^?]+\?mazo=deck-a$/);
  });

  it('puede pedir solo las sanguijuelas y escapa el ID', () => {
    const path = searchPathOfDeck('deck a&b', { leechesOnly: true });
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('mazo')).toBe('deck a&b');
    expect(params.get('estado')).toBe('sanguijuelas');
  });
});
