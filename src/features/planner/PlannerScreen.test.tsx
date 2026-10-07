// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { t } from '@/i18n/es-MX';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

describe('pantalla del plan', () => {
  it('sin mazos ni respuestas dice qué falta y cuánto, sin inventar un plan', async () => {
    app = await renderApp(SCREENS.planner.path, { user: { dailyMinutes: null } });
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.planner.title }),
    ).toBeVisible();
    const today = await screen.findByRole('region', { name: t.planner.todayTitle });
    expect(await within(today).findByText(t.planner.noDecksTitle)).toBeVisible();
    // Los temas a reforzar calibran y dicen cuántas respuestas faltan
    expect(within(today).getByText(t.planner.topicsCalibrating)).toBeVisible();
    expect(within(today).getByText(/Faltan \d+ respuestas en un tema/)).toBeVisible();
    // Los minutos de estudio calibran hasta tener 3 días
    const minutes = screen.getByRole('region', { name: t.planner.minutesTitle });
    expect(within(minutes).getByText(/Calibrando/)).toBeVisible();
  });

  it('el plan Gratis recorta el bloque de práctica a las preguntas que le quedan', async () => {
    app = await renderApp(SCREENS.planner.path, { user: { dailyMinutes: 240 } });
    const today = await screen.findByRole('region', { name: t.planner.todayTitle });
    // Con 4 horas caben muchas más de las 20 que deja el plan Gratis
    expect(await within(today).findByText(t.planner.limitNote(20))).toBeVisible();
    expect(within(today).getByText(t.planner.simulator(20, null))).toBeVisible();
  });
});
