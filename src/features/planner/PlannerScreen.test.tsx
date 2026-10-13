// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen } from '@testing-library/react';
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

describe('redirección de Planificador a Progreso (D-119 B3)', () => {
  it('la ruta /planificador redirige a Progreso y muestra la semana de estudio', async () => {
    app = await renderApp(SCREENS.planner.path, { user: { dailyMinutes: 60 } });
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.progress.title }),
    ).toBeVisible();
    expect(await screen.findByRole('heading', { level: 2, name: t.planner.weekTitle })).toBeVisible();
  });
});
