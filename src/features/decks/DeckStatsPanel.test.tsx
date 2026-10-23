// @vitest-environment jsdom
// Estadísticas de un mazo (V4-B3). Las cifras salen del motor, aquí se revisa que el panel las diga
// bien y que la retención calibre mientras haya pocas tarjetas en repaso.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import { MIN_FOR_RETENTION } from '@/engines/deckStats';
import { deckStatsText } from '@/i18n/deckStats';
import { t } from '@/i18n/es-MX';
import { DeckStatsPanel } from './DeckStatsPanel';

afterEach(() => {
  cleanup();
});

const DAY = 86_400_000;
const inReview = (scheduledDays: number): FsrsCardState => ({
  due: new Date(Date.now() + 3 * DAY).toISOString(),
  stability: 20,
  difficulty: 5,
  scheduledDays,
  learningSteps: 0,
  reps: 4,
  lapses: 0,
  state: 'review',
  lastReview: new Date(Date.now() - (scheduledDays - 3) * DAY).toISOString(),
});

describe('DeckStatsPanel', () => {
  it('con pocas tarjetas en repaso la retención calibra y dice cuántas faltan', async () => {
    render(<DeckStatsPanel states={[null, null, inReview(10)]} timeZone="America/Merida" />);
    await userEvent.click(screen.getByText(t.deckStats.title));
    expect(screen.getByText(t.insights.calibratingLabel)).toBeTruthy();
    expect(screen.getByText(t.deckStats.calibrating(MIN_FOR_RETENTION - 1))).toBeTruthy();
    // Dos nuevas y una en repaso
    const fresh = screen.getByText(t.deckStats.fresh).parentElement as HTMLElement;
    expect(within(fresh).getByText('2')).toBeTruthy();
  });

  it('con suficientes tarjetas da la retención en porcentaje y el histograma por intervalo', async () => {
    const states = Array.from({ length: MIN_FOR_RETENTION }, () => inReview(30));
    render(<DeckStatsPanel states={states} timeZone="America/Merida" />);
    await userEvent.click(screen.getByText(t.deckStats.title));
    expect(screen.getByText(/^\d{1,3}%$/)).toBeTruthy();
    const row = screen.getByText(t.deckStats.buckets.d21to59).parentElement as HTMLElement;
    expect(within(row).getByText(String(MIN_FOR_RETENTION))).toBeTruthy();
    expect(screen.queryByText(t.insights.calibratingLabel)).toBeNull();
  });

  it('el resumen dice cuántas tocan hoy y no rompe con un mazo vacío', () => {
    render(<DeckStatsPanel states={[]} timeZone="America/Merida" />);
    expect(screen.getByText(t.deckStats.summary(0, 0))).toBeTruthy();
  });

  it('sin tarjetas repasadas calibra las sanguijuelas y no dice última vez', async () => {
    render(<DeckStatsPanel states={[null, null]} timeZone="America/Merida" />);
    await userEvent.click(screen.getByText(t.deckStats.title));
    const leeches = screen.getByText(deckStatsText.leeches).parentElement as HTMLElement;
    expect(within(leeches).getByText(t.insights.calibratingLabel)).toBeTruthy();
    expect(within(leeches).getByText(deckStatsText.leechesCalibrating)).toBeTruthy();
    expect(screen.getByText(deckStatsText.neverStudied)).toBeTruthy();
  });

  it('con tarjetas repasadas y ninguna sanguijuela lo dice y no calibra', async () => {
    render(<DeckStatsPanel states={[inReview(10)]} timeZone="America/Merida" />);
    await userEvent.click(screen.getByText(t.deckStats.title));
    const leeches = screen.getByText(deckStatsText.leeches).parentElement as HTMLElement;
    expect(within(leeches).getByText(deckStatsText.leechesNone)).toBeTruthy();
    expect(within(leeches).queryByText(t.insights.calibratingLabel)).toBeNull();
  });

  it('cuenta las sanguijuelas con el umbral que se le pide y lleva a Buscar tarjetas', async () => {
    const leech = { ...inReview(10), lapses: 5 };
    render(
      <MemoryRouter>
        <DeckStatsPanel
          states={[leech, inReview(10)]}
          timeZone="America/Merida"
          leechLapses={5}
          leechHref="/buscar?mazo=x&estado=sanguijuelas"
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByText(t.deckStats.title));
    const leeches = screen.getByText(deckStatsText.leeches).parentElement as HTMLElement;
    expect(within(leeches).getByText(deckStatsText.leechesValue(1))).toBeTruthy();
    expect(within(leeches).getByText(deckStatsText.leechesHint(5))).toBeTruthy();
    expect(
      within(leeches).getByRole('link', { name: deckStatsText.seeLeeches }).getAttribute('href'),
    ).toBe('/buscar?mazo=x&estado=sanguijuelas');
  });

  it('dice cuándo fue la última vez que se estudió el mazo', async () => {
    // inReview repasó por última vez hace scheduledDays menos 3 días
    render(<DeckStatsPanel states={[inReview(3)]} timeZone="America/Merida" />);
    await userEvent.click(screen.getByText(t.deckStats.title));
    expect(screen.getByText(deckStatsText.lastStudied)).toBeTruthy();
    expect(screen.getByText(deckStatsText.lastStudiedValue(0))).toBeTruthy();
  });

  it('si todas las repasadas están suspendidas no calibra y cuenta sus sanguijuelas y su última vez', async () => {
    const suspended = { ...inReview(3), lapses: 9 };
    render(
      <MemoryRouter>
        <DeckStatsPanel
          states={[null]}
          suspendedStates={[suspended]}
          timeZone="America/Merida"
          leechHref="/buscar?mazo=x&estado=sanguijuelas"
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByText(t.deckStats.title));
    const leeches = screen.getByText(deckStatsText.leeches).parentElement as HTMLElement;
    expect(within(leeches).queryByText(t.insights.calibratingLabel)).toBeNull();
    expect(within(leeches).queryByText(deckStatsText.leechesNone)).toBeNull();
    expect(within(leeches).getByText(deckStatsText.leechesValue(1))).toBeTruthy();
    expect(within(leeches).getByText(deckStatsText.leechesSuspended(1))).toBeTruthy();
    // La última vez también cuenta ese repaso
    expect(screen.getByText(deckStatsText.lastStudiedValue(0))).toBeTruthy();
    expect(screen.queryByText(deckStatsText.neverStudied)).toBeNull();
    // Las cifras de hoy siguen sin la suspendida. Del mazo solo queda la nueva
    const fresh = screen.getByText(t.deckStats.fresh).parentElement as HTMLElement;
    expect(within(fresh).getByText('1')).toBeTruthy();
    const review = screen.getByText(t.deckStats.review).parentElement as HTMLElement;
    expect(within(review).getByText('0')).toBeTruthy();
  });

  it('sin sanguijuelas suspendidas no dice nada de suspendidas', async () => {
    const leech = { ...inReview(10), lapses: 9 };
    render(
      <MemoryRouter>
        <DeckStatsPanel states={[leech]} timeZone="America/Merida" leechHref="/x" />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByText(t.deckStats.title));
    expect(screen.getByText(deckStatsText.leechesValue(1))).toBeTruthy();
    expect(screen.queryByText(deckStatsText.leechesSuspended(1))).toBeNull();
  });
});
