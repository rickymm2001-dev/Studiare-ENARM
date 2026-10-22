// @vitest-environment jsdom
// El heatmap pinta cada día con la escala de cinco pasos de la paleta (D-128), del token heatmap-0
// para el día sin actividad al heatmap-4 para el más activo, y la leyenda enseña los cinco pasos
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeUser } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { buildSnapshot, type Snapshot } from '../snapshot';
import { HeatmapWidget } from './HeatmapWidget';

const day = (cards: number) => ({ cards, questions: 0, focusMinutes: 0, xp: 0 });

// Un alumno sin eventos con la actividad que lee el heatmap. El máximo es 40, así 40, 30, 20 y 1
// caen en los pasos 4, 3, 2 y 1
const user = makeUser();
const snapshot: Snapshot = {
  ...buildSnapshot({ events: [], user, settings: user.settings, now: new Date() }),
  today: '2026-10-14',
  activity: {
    '2026-10-14': day(40),
    '2026-10-13': day(30),
    '2026-10-12': day(20),
    '2026-10-11': day(1),
  },
};

const metric = t.widgets.heatmap.metrics.cards.toLowerCase();

describe('heatmap de estudio', () => {
  it('cada día usa el paso de la escala heatmap-0 a heatmap-4 que le toca', () => {
    const { container } = render(
      <HeatmapWidget
        snapshot={snapshot}
        settings={{ range: 90, metric: 'cards' }}
        since="2026-07-01"
      />,
    );
    const cellOf = (date: string, value: number) =>
      container.querySelector(`[title="${t.widgets.heatmap.cell(date, value, metric)}"]`);

    expect(cellOf('2026-10-14', 40)).toHaveClass('bg-heatmap-4');
    expect(cellOf('2026-10-13', 30)).toHaveClass('bg-heatmap-3');
    expect(cellOf('2026-10-12', 20)).toHaveClass('bg-heatmap-2');
    expect(cellOf('2026-10-11', 1)).toHaveClass('bg-heatmap-1');
    expect(cellOf('2026-10-10', 0)).toHaveClass('bg-heatmap-0');
    // Ya no quedan las transparencias del color de acción de antes
    expect(container.innerHTML).not.toMatch(/bg-indicator|bg-muted/);
  });

  it('la leyenda de Menos a Más enseña los cinco pasos en orden', () => {
    const { getByText } = render(
      <HeatmapWidget
        snapshot={snapshot}
        settings={{ range: 90, metric: 'cards' }}
        since="2026-07-01"
      />,
    );
    const legend = getByText(t.widgets.heatmap.less).parentElement;
    const swatches = [...(legend?.querySelectorAll('span.size-3') ?? [])].map((swatch) =>
      [...swatch.classList].find((name) => name.startsWith('bg-')),
    );
    expect(swatches).toEqual([
      'bg-heatmap-0',
      'bg-heatmap-1',
      'bg-heatmap-2',
      'bg-heatmap-3',
      'bg-heatmap-4',
    ]);
  });
});

describe('detalle de un día', () => {
  it('tocar un día dice sus cifras debajo y tocarlo otra vez lo quita', () => {
    const { container } = render(
      <HeatmapWidget
        snapshot={{
          ...snapshot,
          activity: {
            ...snapshot.activity,
            '2026-10-13': { ...day(30), questions: 12, focusMinutes: 45 },
          },
        }}
        settings={{ range: 90, metric: 'cards' }}
        since="2026-07-01"
      />,
    );
    const cell = container.querySelector(
      `[title="${t.widgets.heatmap.cell('2026-10-13', 30, metric)}"]`,
    ) as HTMLElement;
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(cell);
    expect(screen.getByRole('status').textContent).toBe(
      t.widgets.heatmap.detail('martes, 13 de octubre', 30, 12, 45),
    );
    fireEvent.click(cell);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
