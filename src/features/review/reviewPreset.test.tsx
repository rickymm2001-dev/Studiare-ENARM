// @vitest-environment jsdom
// La petición de un botón de Mazos a Repasar (V4-B3). Viaja en el estado de la ruta, vive mientras Repasar
// está abierto y no pisa la selección que el alumno tenía guardada.
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activeReviewPreset,
  finishReviewPreset,
  presetFromRouteState,
  reviewPresetState,
  setReviewPreset,
  useReviewPresetFromRoute,
} from './reviewPreset';
import { loadSelection, saveSelection, type ReviewSelection } from './selection';

const TOPICS = ['cardiology', 'nephrology', 'urgencias'];
const SAVED_KEY = 'enarm.review-selection.v1';

function Screen() {
  useReviewPresetFromRoute();
  return null;
}

const renderAt = (state: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/repasar', state }]}>
      <Screen />
    </MemoryRouter>,
  );

const saved = (): ReviewSelection => ({
  mode: 'due',
  decks: new Set(['a', 'b']),
  topics: new Set(['cardiology']),
  includeUntagged: false,
});

beforeEach(() => {
  localStorage.clear();
  setReviewPreset(null);
});
afterEach(() => {
  cleanup();
  setReviewPreset(null);
  localStorage.clear();
});

describe('presetFromRouteState', () => {
  it('lee la petición que arma reviewPresetState', () => {
    const preset = { mode: 'topic' as const, unitId: 'deck-a' };
    expect(presetFromRouteState(reviewPresetState(preset))).toEqual(preset);
  });

  it('ignora lo que no es una petición válida', () => {
    for (const state of [
      null,
      undefined,
      'texto',
      {},
      { reviewPreset: null },
      { reviewPreset: { mode: 'today' } },
      { reviewPreset: { mode: 'today', unitId: '' } },
      { reviewPreset: { mode: 'due', unitId: 'a' } },
      { reviewPreset: { mode: 'today', unitId: 7 } },
      { reviewPreset: { mode: 'today', unitId: 'x'.repeat(101) } },
    ]) {
      expect(presetFromRouteState(state)).toBeNull();
    }
  });
});

describe('useReviewPresetFromRoute', () => {
  it('toma la petición del estado de la ruta al abrir Repasar y la suelta al salir', () => {
    const view = renderAt(reviewPresetState({ mode: 'topic', unitId: 'a' }));
    expect(activeReviewPreset()).toEqual({ mode: 'topic', unitId: 'a' });
    view.unmount();
    expect(activeReviewPreset()).toBeNull();
  });

  it('abrir Repasar sin petición, como desde el menú, no deja ninguna', () => {
    renderAt(undefined);
    expect(activeReviewPreset()).toBeNull();
  });
});

describe('la selección con una petición', () => {
  it('Repasar abre con ese mazo y ese modo, con todos los temas, sin escribir nada guardado', () => {
    saveSelection(saved(), ['a', 'b']);
    const before = localStorage.getItem(SAVED_KEY);
    renderAt(reviewPresetState({ mode: 'topic', unitId: 'b' }));
    const asked = loadSelection(['a', 'b'], TOPICS);
    expect(asked.mode).toBe('topic');
    expect([...asked.decks]).toEqual(['b']);
    expect(asked.topics.size).toBe(TOPICS.length);
    expect(asked.includeUntagged).toBe(true);
    expect(localStorage.getItem(SAVED_KEY)).toBe(before);
  });

  it('pedirla de nuevo, como al montar otra vez bajo StrictMode, sigue dando lo mismo', () => {
    renderAt(reviewPresetState({ mode: 'today', unitId: 'a' }));
    loadSelection(['a', 'b'], TOPICS);
    setReviewPreset({ mode: 'today', unitId: 'a' });
    expect([...loadSelection(['a', 'b'], TOPICS).decks]).toEqual(['a']);
  });

  it('un mazo que ya no está entre los que se repasan se ignora y vale lo guardado', () => {
    saveSelection(saved(), ['a', 'b']);
    renderAt(reviewPresetState({ mode: 'topic', unitId: 'borrado' }));
    const loaded = loadSelection(['a', 'b'], TOPICS);
    expect(loaded.mode).toBe('due');
    expect([...loaded.decks].sort()).toEqual(['a', 'b']);
  });

  it('empezar justo con lo que se pidió no guarda esa selección y deja la del alumno', () => {
    saveSelection(saved(), ['a', 'b']);
    const before = localStorage.getItem(SAVED_KEY);
    renderAt(reviewPresetState({ mode: 'topic', unitId: 'b' }));
    const asked = loadSelection(['a', 'b'], TOPICS);
    saveSelection(asked, ['a', 'b']);
    expect(localStorage.getItem(SAVED_KEY)).toBe(before);
    // La petición ya se cumplió. Volver al inicio de Repasar muestra lo que el alumno tenía
    const next = loadSelection(['a', 'b'], TOPICS);
    expect(next.mode).toBe('due');
    expect([...next.decks].sort()).toEqual(['a', 'b']);
    expect(next.includeUntagged).toBe(false);
  });

  it('si el alumno cambia algo antes de empezar, eso sí es una elección suya y se guarda', () => {
    saveSelection(saved(), ['a', 'b']);
    renderAt(reviewPresetState({ mode: 'today', unitId: 'b' }));
    const asked = loadSelection(['a', 'b'], TOPICS);
    saveSelection({ ...asked, decks: new Set(['a', 'b']) }, ['a', 'b']);
    const stored = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as { decks: string[] };
    expect(stored.decks.sort()).toEqual(['a', 'b']);
  });

  it('sin una petición, guardar sigue funcionando como siempre', () => {
    saveSelection(saved(), ['a', 'b']);
    expect(localStorage.getItem(SAVED_KEY)).not.toBeNull();
    expect(finishReviewPreset(saved())).toBe(false);
  });
});
