// @vitest-environment jsdom
// Qué hacer con un mazo (V4-B3). Repasar este mazo y Estudiar un tema abren Repasar con el mazo ya
// elegido, pidiéndolo por el estado de la ruta y sin tocar la selección que Repasar recuerda. Buscar
// tarjetas abre el buscador con el filtro del mazo puesto.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screenPath } from '@/app/screens';
import { deckStatsText } from '@/i18n/deckStats';
import { presetFromRouteState } from '../review/reviewPreset';
import { loadSelection } from '../review/selection';
import { ALL_TOPICS } from '../shared/topics';
import { DeckActions } from './DeckActions';

const SAVED_KEY = 'enarm.review-selection.v1';
/** Lo que el alumno tenía elegido, con varios mazos y un tema desmarcado */
const SAVED = JSON.stringify({
  mode: 'due',
  decks: ['deck-a', 'deck-b'],
  knownDecks: ['deck-a', 'deck-b'],
  topics: ALL_TOPICS.slice(1),
  includeUntagged: false,
});

function Where() {
  const location = useLocation();
  return (
    <>
      <p data-testid="donde">{location.pathname + location.search}</p>
      <p data-testid="estado">{JSON.stringify(location.state)}</p>
    </>
  );
}

function renderActions() {
  return render(
    <MemoryRouter initialEntries={['/mazos']}>
      <DeckActions unitId="deck-b" name="Urgencias (Paco)" />
      <Where />
    </MemoryRouter>,
  );
}

const stateOfRoute = () =>
  JSON.parse(screen.getByTestId('estado').textContent || 'null') as unknown;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(SAVED_KEY, SAVED);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('DeckActions', () => {
  it('agrupa sus tres botones con el nombre del mazo', () => {
    renderActions();
    const group = screen.getByRole('group', {
      name: deckStatsText.actions.label('Urgencias (Paco)'),
    });
    expect(group).toBeTruthy();
    expect(screen.getByRole('button', { name: deckStatsText.actions.review })).toBeTruthy();
    expect(screen.getByRole('button', { name: deckStatsText.actions.topic })).toBeTruthy();
    expect(screen.getByRole('link', { name: deckStatsText.actions.search })).toBeTruthy();
  });

  it('Repasar este mazo va a Repasar y pide ese mazo en el modo de hoy por el estado de la ruta', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: deckStatsText.actions.review }));
    expect(screen.getByTestId('donde').textContent).toBe(screenPath('review'));
    expect(presetFromRouteState(stateOfRoute())).toEqual({ mode: 'today', unitId: 'deck-b' });
  });

  it('Estudiar un tema va a Repasar y pide ese mazo en el modo por tema', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: deckStatsText.actions.topic }));
    expect(screen.getByTestId('donde').textContent).toBe(screenPath('review'));
    expect(presetFromRouteState(stateOfRoute())).toEqual({ mode: 'topic', unitId: 'deck-b' });
  });

  it('la selección que el alumno tenía guardada queda intacta con cualquiera de los dos botones', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: deckStatsText.actions.topic }));
    expect(localStorage.getItem(SAVED_KEY)).toBe(SAVED);
    const loaded = loadSelection(['deck-a', 'deck-b'], ALL_TOPICS);
    expect(loaded.mode).toBe('due');
    expect([...loaded.decks].sort()).toEqual(['deck-a', 'deck-b']);
    expect(loaded.includeUntagged).toBe(false);
    expect(loaded.topics.size).toBe(ALL_TOPICS.length - 1);
  });

  it('sin almacenamiento los botones siguen llevando a Repasar', async () => {
    const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sin almacenamiento');
    });
    try {
      renderActions();
      await userEvent.click(screen.getByRole('button', { name: deckStatsText.actions.review }));
      expect(screen.getByTestId('donde').textContent).toBe(screenPath('review'));
    } finally {
      failing.mockRestore();
    }
  });

  it('Buscar tarjetas lleva al buscador con el mazo en la dirección', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('link', { name: deckStatsText.actions.search }));
    expect(screen.getByTestId('donde').textContent).toBe(`${screenPath('explore')}?mazo=deck-b`);
  });
});
