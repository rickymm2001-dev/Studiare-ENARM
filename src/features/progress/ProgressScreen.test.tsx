// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { INSIGHT_MINIMUMS } from '@/engines/insights';
import { t } from '@/i18n/es-MX';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

describe('pantalla de Progreso', () => {
  it('con un alumno nuevo calibra y dice cuánto falta en cada análisis, sin predecir el puntaje', async () => {
    app = await renderApp(SCREENS.progress.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.progress.title }),
    ).toBeVisible();

    // Los focos de la semana esperan las respuestas que pide el motor
    expect(
      await screen.findByText(t.progress.focusCalibrating(0, INSIGHT_MINIMUMS.answers), undefined, {
        timeout: 10_000,
      }),
    ).toBeVisible();

    // Conócete lista sus lecturas como calibrando con cuánto falta
    const insights = screen.getByRole('region', { name: t.insights.title });
    // Cada lectura trae su avance, por ejemplo 0/20, con el aviso de calibrando solo para el lector
    expect(within(insights).getAllByText(/^\d+\/\d+$/).length).toBeGreaterThan(5);

    // La dificultad calibra por grupo y la carga futura pide seguir un mazo
    const difficulty = screen.getByRole('region', { name: t.progress.difficultyTitle });
    expect(within(difficulty).getAllByText(t.progress.difficultyCalibrating(20))).toHaveLength(3);
    expect(
      within(screen.getByRole('region', { name: t.progress.futureLoad.title })).getByText(
        t.progress.futureLoad.empty,
      ),
    ).toBeVisible();

    // Nada de predecir el puntaje del ENARM
    expect(screen.queryByText(/puntaje (esperado|probable|estimado)/i)).toBeNull();
  });
});
