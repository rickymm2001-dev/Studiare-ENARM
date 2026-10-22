// @vitest-environment jsdom
// Estadísticas de un mazo (V4-B3). Las cifras salen del motor, aquí se revisa que el panel las diga
// bien y que la retención calibre mientras haya pocas tarjetas en repaso.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { FsrsCardState } from '@/data/schemas/common';
import { MIN_FOR_RETENTION } from '@/engines/deckStats';
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
});
