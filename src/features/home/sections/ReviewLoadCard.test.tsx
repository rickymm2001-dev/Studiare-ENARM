// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '@/i18n/es-MX';
import type { FutureLoad } from '../../progress/futureLoad';
import { ReviewLoadCard } from './ReviewLoadCard';

afterEach(cleanup);

const text = t.home.load;

/** Una semana que empieza el lunes 12 de octubre de 2026 */
function week(values: readonly (readonly [number, number])[]): FutureLoad {
  const days = values.map(([reviews, newCards], index) => ({
    day: `2026-10-${String(12 + index).padStart(2, '0')}`,
    reviews,
    newCards,
  }));
  return {
    horizon: days.length,
    days,
    weeks: [],
    totalReviews: days.reduce((sum, day) => sum + day.reviews, 0),
    totalNew: days.reduce((sum, day) => sum + day.newCards, 0),
    averageReviews: 0,
    peak: null,
    cardCount: 10,
  };
}

const show = (load: FutureLoad | null) =>
  render(
    <MemoryRouter>
      <ReviewLoadCard load={load} />
    </MemoryRouter>,
  );

describe('carga de repaso de los próximos 7 días', () => {
  it('una columna por día con su cifra, el total y el día más cargado', () => {
    show(
      week([
        [30, 20],
        [40, 20],
        [62, 20],
        [10, 20],
        [0, 20],
        [5, 0],
        [0, 0],
      ]),
    );
    // 50 + 60 + 82 + 30 + 20 + 5 + 0
    expect(screen.getByText(text.summary(247, 35), { exact: false })).toBeInTheDocument();
    // El formato del día lo da Intl, así que se acepta con o sin coma y punto
    const chart = screen.getByRole('img', {
      name: /247 tarjetas en total y el día más cargado es Miércoles,? 14 de oct\.? con 82\.$/,
    });
    expect(chart).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(8);
    expect(within(rows[1] as HTMLElement).getByRole('rowheader')).toHaveTextContent(text.today);
    expect(
      within(rows[3] as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['62', '20', '82']);
  });

  it('al pasar el cursor por una columna dice el total y cuántos son repasos y nuevas', () => {
    show(
      week([
        [30, 20],
        [40, 20],
        [62, 20],
        [10, 20],
        [0, 20],
        [5, 0],
        [0, 0],
      ]),
    );
    const chart = screen.getByRole('img');
    const column = within(chart).getByText('82').parentElement as HTMLElement;
    fireEvent.mouseEnter(column);
    expect(screen.getByText(text.dayTotal(82))).toBeInTheDocument();
    expect(screen.getByText(text.dayDetail(62, 20))).toBeInTheDocument();
    fireEvent.mouseLeave(chart);
    expect(screen.queryByText(text.dayDetail(62, 20))).toBeNull();
  });

  it('sin nada que repasar lo dice en lugar de inventar un día más cargado', () => {
    show(
      week([
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ]),
    );
    expect(screen.getByText(text.none, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: text.chartEmpty })).toBeInTheDocument();
  });

  it('sin mazos que seguir no dibuja columnas y lleva a Mazos', () => {
    show(null);
    expect(screen.getByText(text.empty)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: text.goToDecks })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
