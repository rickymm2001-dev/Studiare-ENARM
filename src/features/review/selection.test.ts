// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSelection, saveSelection, type ReviewSelection } from './selection';

const TOPICS = ['cardiology', 'nephrology'];

const chosen = (decks: string[]): ReviewSelection => ({
  mode: 'today',
  decks: new Set(decks),
  topics: new Set(TOPICS),
  includeUntagged: true,
});

describe('selección de qué repasar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sin nada guardado marca todos los mazos', () => {
    expect([...loadSelection(['a', 'b'], TOPICS).decks]).toEqual(['a', 'b']);
  });

  it('recuerda lo que el alumno desmarcó', () => {
    saveSelection(chosen(['a']), ['a', 'b']);
    expect([...loadSelection(['a', 'b'], TOPICS).decks]).toEqual(['a']);
  });

  it('un mazo nuevo, como Mis errores, entra marcado aunque haya una selección guardada', () => {
    saveSelection(chosen(['a']), ['a', 'b']);
    const loaded = loadSelection(['a', 'b', 'errores'], TOPICS);
    expect([...loaded.decks].sort()).toEqual(['a', 'errores']);
  });

  it('un mazo que ya no se sigue sale y, si no queda ninguno, se usan todos', () => {
    saveSelection(chosen(['a']), ['a']);
    expect([...loadSelection(['b'], TOPICS).decks]).toEqual(['b']);
  });

  it('con una selección vieja sin lista de conocidos no desmarca nada que ya tenía', () => {
    localStorage.setItem(
      'enarm.review-selection.v1',
      JSON.stringify({ mode: 'due', decks: ['a'], topics: TOPICS, includeUntagged: false }),
    );
    const loaded = loadSelection(['a', 'b'], TOPICS);
    expect(loaded.mode).toBe('due');
    expect(loaded.includeUntagged).toBe(false);
    expect([...loaded.decks].sort()).toEqual(['a', 'b']);
  });
});
