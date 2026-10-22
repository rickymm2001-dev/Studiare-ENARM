// @vitest-environment jsdom
// Tus mazos en cifras (V4-B3). Lista los mazos que el alumno sigue o creó, con sus estadísticas y sus
// botones, y deja fuera los que ya muestran sus cifras en otro lado.
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import type { Deck } from '@/data/schemas/decks';
import { ROOT_DECK_KEY } from '@/demo/content/deckEntities';
import { deckIds } from '@/demo/content/deckEntities';
import { deckStatsText } from '@/i18n/deckStats';
import { t } from '@/i18n/es-MX';
import { unitIdsOf } from './deckActions';
import { DeckStatsList } from './DeckStatsList';

afterEach(() => {
  cleanup();
});

const deck = (id: string, name: string, parentId: string | null): Deck => ({
  id,
  name,
  parentId,
  description: '',
  ownerId: null,
  origin: 'preloaded',
  visibility: 'public',
  isDemo: false,
  createdAt: '2026-10-01T00:00:00.000Z',
});

const root = deckIds.deck(ROOT_DECK_KEY);
const urgencias = deckIds.deck('paco-urgencias');
const toxindromes = deckIds.subject('paco-urgencias', 'Toxíndromes');
const propio = 'deck-propio';
const decks = [
  deck(root, 'ENARM 2027', null),
  deck(urgencias, 'Urgencias (Paco)', root),
  deck(toxindromes, 'Toxíndromes', urgencias),
  deck(propio, 'Mis tarjetas', null),
];
const cardsByDeck = new Map<string, readonly string[]>([
  [toxindromes, ['c1', 'c2']],
  [propio, ['c3']],
]);

const reviewed = (): FsrsCardState => ({
  due: new Date(Date.now() + 86_400_000).toISOString(),
  stability: 10,
  difficulty: 5,
  scheduledDays: 5,
  learningSteps: 0,
  reps: 2,
  lapses: 0,
  state: 'review',
  lastReview: new Date(Date.now() - 4 * 86_400_000).toISOString(),
});

function renderList(
  overrides: Partial<{
    followed: ReadonlySet<string>;
    excludeUnitIds: ReadonlySet<string>;
    suspended: ReadonlySet<string>;
  }> = {},
) {
  return render(
    <MemoryRouter>
      <DeckStatsList
        decks={decks}
        cardsByDeck={cardsByDeck}
        states={new Map([['c1', reviewed()]])}
        suspended={overrides.suspended ?? new Set()}
        followed={overrides.followed ?? new Set([urgencias, toxindromes, propio])}
        excludeUnitIds={overrides.excludeUnitIds ?? new Set()}
        timeZone="America/Merida"
        leechLapses={8}
      />
    </MemoryRouter>,
  );
}

describe('unitIdsOf', () => {
  it('da los mazos por los que Repasar elige, sin la raíz ni las materias', () => {
    expect(unitIdsOf(decks)).toEqual([urgencias, propio]);
  });
});

/** Los mazos de la lista, sin contar las listas que cada panel lleva dentro */
function rowsOf(): HTMLElement[] {
  const card = screen.getByRole('region', { name: deckStatsText.list.title });
  const list = card.querySelector('ul') as HTMLElement;
  return [...list.children] as HTMLElement[];
}

describe('DeckStatsList', () => {
  it('lista cada mazo que se sigue o se creó, con sus tarjetas, sus botones y sus cifras', () => {
    renderList();
    const items = rowsOf();
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText('Urgencias (Paco)')).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText(deckStatsText.list.cards(2))).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText('Mis tarjetas')).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText(deckStatsText.list.cards(1))).toBeTruthy();
    for (const item of items) {
      expect(within(item).getByText(t.deckStats.title)).toBeTruthy();
      expect(within(item).getByRole('button', { name: deckStatsText.actions.topic })).toBeTruthy();
    }
  });

  it('deja fuera los mazos que ya muestran sus cifras en su fila', () => {
    renderList({ excludeUnitIds: new Set([urgencias]) });
    const card = screen.getByRole('region', { name: deckStatsText.list.title });
    expect(within(card).queryByText('Urgencias (Paco)')).toBeNull();
    expect(within(card).getByText('Mis tarjetas')).toBeTruthy();
  });

  it('no lista un mazo que el alumno no sigue', () => {
    renderList({ followed: new Set([propio]) });
    expect(screen.queryByText('Urgencias (Paco)')).toBeNull();
  });

  it('sin mazos que mostrar no pinta la tarjeta', () => {
    const { container } = renderList({ followed: new Set() });
    expect(container.textContent).toBe('');
  });

  it('sin botones cuando todas las tarjetas del mazo están suspendidas, porque Repasar no tiene nada', () => {
    renderList({ suspended: new Set(['c3']) });
    const own = rowsOf()[1] as HTMLElement;
    expect(within(own).queryByRole('button', { name: deckStatsText.actions.review })).toBeNull();
    // Las cifras siguen, en cero
    expect(within(own).getByText(t.deckStats.title)).toBeTruthy();
  });
});
