// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExploreRow, ExploreSort } from '@/engines/explore';
import { ExploreTable } from './ExploreTable';
import { t } from '@/i18n/es-MX';

afterEach(cleanup);

const MOCK_ROWS: ExploreRow[] = [
  {
    cardId: 'c1',
    noteId: 'n1',
    deckId: 'd1',
    deckName: 'Medicina interna (Paco)',
    topic: 'Artritis reumatoide',
    front: '¿Criterios de clasificación de AR?',
    back: 'ACR/EULAR 2010',
    interval: 14,
    kind: 'basic',
    ordinal: 0,
    tags: ['reuma'],
    suspended: false,
    due: '2026-10-20T12:00:00.000Z',
    lapses: 1,
    origin: 'preloaded',
    fsrs: 'review',
    leech: false,
    controversy: null,
    aiDraft: false,
    search: 'criterios acr',
    isDemo: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    cardId: 'c2',
    noteId: 'n2',
    deckId: 'd2',
    deckName: 'Pediatría',
    topic: 'Bronquiolitis',
    front: 'Agente causal más frecuente',
    back: 'VSR',
    interval: 0,
    kind: 'basic',
    ordinal: 0,
    tags: ['pedia'],
    suspended: true,
    due: null,
    lapses: 0,
    origin: 'manual',
    fsrs: 'new',
    leech: false,
    controversy: null,
    aiDraft: false,
    search: 'agente causal',
    isDemo: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

describe('ExploreTable', () => {
  it('renderiza encabezados y columnas de frente, mazo, tema, estado, próxima fecha, intervalo y fallos', () => {
    const onSort = vi.fn();
    const sort: ExploreSort = { key: 'front', direction: 'asc' };

    render(
      <ExploreTable
        rows={MOCK_ROWS}
        selected={new Set()}
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        allSelected={false}
        activeCardId={null}
        onSelectCard={vi.fn()}
        sort={sort}
        onSortChange={onSort}
        timeZone="America/Mexico_City"
      />,
    );

    expect(screen.getByText(t.explore.table.front)).toBeInTheDocument();
    expect(screen.getByText(t.explore.table.deck)).toBeInTheDocument();
    expect(screen.getByText(t.explore.table.topic)).toBeInTheDocument();
    expect(screen.getByText(t.explore.table.status)).toBeInTheDocument();
    expect(screen.getByText(t.explore.table.due)).toBeInTheDocument();
    expect(screen.getByText(t.explore.table.interval)).toBeInTheDocument();
    expect(screen.getByText(t.explore.table.lapses)).toBeInTheDocument();

    expect(screen.getByText('¿Criterios de clasificación de AR?')).toBeInTheDocument();
    expect(screen.getByText('Medicina interna (Paco)')).toBeInTheDocument();
    expect(screen.getByText('Artritis reumatoide')).toBeInTheDocument();
    expect(screen.getByText('14 d')).toBeInTheDocument();
    expect(screen.getByText(t.explore.statusOne.suspended)).toBeInTheDocument();
  });

  it('permite ordenar por columna cambiando dirección', () => {
    const onSort = vi.fn();
    const sort: ExploreSort = { key: 'topic', direction: 'asc' };

    render(
      <ExploreTable
        rows={MOCK_ROWS}
        selected={new Set()}
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        allSelected={false}
        activeCardId={null}
        onSelectCard={vi.fn()}
        sort={sort}
        onSortChange={onSort}
        timeZone="America/Mexico_City"
      />,
    );

    // Al hacer click en topic teniendo asc, cambia a desc
    fireEvent.click(screen.getByText(t.explore.table.topic));
    expect(onSort).toHaveBeenCalledWith({ key: 'topic', direction: 'desc' });

    // Al hacer click en otra columna (front), cambia de columna
    fireEvent.click(screen.getByText(t.explore.table.front));
    expect(onSort).toHaveBeenCalledWith({ key: 'front', direction: 'asc' });
  });

  it('permite seleccionar tarjeta y fila activa', () => {
    const onToggle = vi.fn();
    const onSelectCard = vi.fn();

    render(
      <ExploreTable
        rows={MOCK_ROWS}
        selected={new Set(['c1'])}
        onToggle={onToggle}
        onToggleAll={vi.fn()}
        allSelected={false}
        activeCardId="c1"
        onSelectCard={onSelectCard}
        sort={{ key: 'front', direction: 'asc' }}
        onSortChange={vi.fn()}
        timeZone="America/Mexico_City"
      />,
    );

    const rowCheckbox = screen.getByRole('checkbox', {
      name: t.explore.selectRow('¿Criterios de clasificación de AR?'),
    });
    fireEvent.click(rowCheckbox);
    expect(onToggle).toHaveBeenCalledWith('c1');

    // Click en la fila c2 selecciona para preview
    fireEvent.click(screen.getByText('Pediatría'));
    expect(onSelectCard).toHaveBeenCalledWith('c2');
  });
});
