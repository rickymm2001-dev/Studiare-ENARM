// @vitest-environment jsdom
// La lista de temas de un mazo (B4 del plan del cambio, comentario 8). El resumen dice las ramas y
// cuántos temas hay, y al abrirla se ven todos, rama por rama, en orden y sin cortar los nombres.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTopicOutline } from '@/engines/deckTopics';
import { t } from '@/i18n/es-MX';
import { DeckTopics } from './DeckTopics';

afterEach(() => {
  cleanup();
});

const LONG = 'Granulomatosis eosinofílica con poliangitis (Churg-Strauss)';
const outline = buildTopicOutline([
  ['Medicina interna', 'Reumatología', 'Lupus eritematoso sistémico'],
  ['Medicina interna', 'Reumatología', 'Artritis reumatoide'],
  ['Medicina interna', 'Reumatología', LONG],
  ['Medicina interna', 'Reumatología', 'artritis reumatoide'],
  ['Medicina interna', 'Nefrología', 'Síndrome nefrótico'],
  ['Medicina interna', 'Nefrología'],
  [],
]);

describe('temas de un mazo', () => {
  it('el resumen dice sus ramas y cuántos temas tiene', () => {
    render(<DeckTopics deckName="Medicina interna (Paco)" outline={outline} />);
    expect(screen.getByText(t.deckTopics.title)).toBeVisible();
    expect(screen.getByText(`· ${t.deckTopics.summary(['Medicina interna'], 4)}`)).toBeVisible();
    // Plegado hasta que el alumno lo abre
    expect(screen.getByText(t.deckTopics.title).closest('details')).not.toHaveAttribute('open');
  });

  it('al abrirlo se ve cada rama con todos sus temas, en orden y sin repetidos ni recortes', async () => {
    const typing = userEvent.setup();
    render(<DeckTopics deckName="Medicina interna (Paco)" outline={outline} />);
    await typing.click(screen.getByText(t.deckTopics.title));
    expect(screen.getByText(t.deckTopics.title).closest('details')).toHaveAttribute('open');
    const all = screen.getByRole('list', {
      name: t.deckTopics.listLabel('Medicina interna (Paco)'),
    });
    const subjects = within(all).getByRole('list', { name: 'Medicina interna' });
    const rheumatology = within(subjects).getByRole('list', { name: 'Reumatología' });
    expect(
      within(rheumatology)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Artritis reumatoide', LONG, 'Lupus eritematoso sistémico']);
    // El nombre largo se parte en renglones y nunca se corta
    expect(within(rheumatology).getByText(LONG)).not.toHaveClass('truncate');
    expect(within(subjects).getByRole('list', { name: 'Nefrología' })).toBeVisible();
    expect(screen.getByText(t.deckTopics.untagged(1))).toBeVisible();
  });

  it('un mazo sin temas no pinta nada', () => {
    const { container } = render(
      <DeckTopics deckName="Vacío" outline={buildTopicOutline([[], []])} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
