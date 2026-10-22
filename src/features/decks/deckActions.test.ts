// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSelection } from '../review/selection';
import { ALL_TOPICS } from '../shared/topics';
import { presetReviewSelection, searchPathOfDeck } from './deckActions';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe('presetReviewSelection', () => {
  const units = ['deck-a', 'deck-b', 'deck-c'];

  it('deja en Repasar solo ese mazo, en el modo pedido y con todos sus temas', () => {
    presetReviewSelection('topic', 'deck-b', units);
    const selection = loadSelection(units, ALL_TOPICS);
    expect(selection.mode).toBe('topic');
    expect([...selection.decks]).toEqual(['deck-b']);
    expect(selection.topics.size).toBe(ALL_TOPICS.length);
    expect(selection.includeUntagged).toBe(true);
  });

  it('Repasar este mazo deja el modo de hoy', () => {
    presetReviewSelection('today', 'deck-c', units);
    const selection = loadSelection(units, ALL_TOPICS);
    expect(selection.mode).toBe('today');
    expect([...selection.decks]).toEqual(['deck-c']);
  });

  it('un mazo que se sigue después de elegir este entra marcado, como siempre', () => {
    presetReviewSelection('today', 'deck-a', units);
    const selection = loadSelection([...units, 'deck-nuevo'], ALL_TOPICS);
    expect([...selection.decks].sort()).toEqual(['deck-a', 'deck-nuevo']);
  });

  it('sustituye lo que había elegido el alumno', () => {
    presetReviewSelection('today', 'deck-a', units);
    presetReviewSelection('topic', 'deck-c', units);
    const selection = loadSelection(units, ALL_TOPICS);
    expect(selection.mode).toBe('topic');
    expect([...selection.decks]).toEqual(['deck-c']);
  });
});

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
