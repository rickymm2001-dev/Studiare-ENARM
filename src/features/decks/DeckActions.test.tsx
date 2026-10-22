// @vitest-environment jsdom
// Qué hacer con un mazo (V4-B3). Repasar este mazo y Estudiar un tema abren Repasar con el mazo ya
// elegido, y Buscar tarjetas abre el buscador con el filtro del mazo puesto.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screenPath } from '@/app/screens';
import { deckStatsText } from '@/i18n/deckStats';
import { loadSelection } from '../review/selection';
import { ALL_TOPICS } from '../shared/topics';
import { DeckActions } from './DeckActions';

const UNITS = ['deck-a', 'deck-b'];

function Where() {
  const location = useLocation();
  return <p data-testid="donde">{location.pathname + location.search}</p>;
}

function renderActions() {
  return render(
    <MemoryRouter initialEntries={['/mazos']}>
      <DeckActions unitId="deck-b" name="Urgencias (Paco)" allUnitIds={UNITS} />
      <Where />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
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

  it('Repasar este mazo va a Repasar con solo ese mazo y el modo de hoy', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: deckStatsText.actions.review }));
    expect(screen.getByTestId('donde').textContent).toBe(screenPath('review'));
    const selection = loadSelection(UNITS, ALL_TOPICS);
    expect(selection.mode).toBe('today');
    expect([...selection.decks]).toEqual(['deck-b']);
  });

  it('Estudiar un tema va a Repasar con ese mazo en el modo por tema', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('button', { name: deckStatsText.actions.topic }));
    expect(screen.getByTestId('donde').textContent).toBe(screenPath('review'));
    const selection = loadSelection(UNITS, ALL_TOPICS);
    expect(selection.mode).toBe('topic');
    expect([...selection.decks]).toEqual(['deck-b']);
  });

  it('Buscar tarjetas lleva al buscador con el mazo en la dirección', async () => {
    renderActions();
    await userEvent.click(screen.getByRole('link', { name: deckStatsText.actions.search }));
    expect(screen.getByTestId('donde').textContent).toBe(`${screenPath('explore')}?mazo=deck-b`);
  });
});
