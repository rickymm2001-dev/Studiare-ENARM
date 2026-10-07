// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('tablero de Inicio', () => {
  it('saluda al alumno y muestra sus widgets sin inventar cifras', async () => {
    app = await renderApp(SCREENS.home.path, { user: { alias: 'Marta' } });
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.home.title }),
    ).toBeVisible();
    expect(
      await screen.findByText(new RegExp(`${t.home.greeting('Marta')}\\.`)),
    ).toBeInTheDocument();
    // Un alumno nuevo no tiene racha ni XP, y el tablero trae widgets
    expect(screen.getAllByRole('region').length).toBeGreaterThan(2);
  });

  it('permite editar el tablero, agregar un widget y quitarlo', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.home.path);
    await typing.click(await screen.findByRole('button', { name: t.home.edit }));
    await typing.selectOptions(screen.getByLabelText(t.home.addLabel), 'weak_topics');
    await typing.click(screen.getByRole('button', { name: t.home.add }));
    const weak = await screen.findByRole('region', { name: t.widgets.names.weak_topics });
    // Mientras no hay respuestas suficientes el widget dice que calibra
    expect(await within(weak).findByText(t.states.calibrating.title)).toBeVisible();
    await typing.click(
      screen.getByRole('button', { name: t.home.remove(t.widgets.names.weak_topics) }),
    );
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: t.widgets.names.weak_topics })).toBeNull();
    });
    await typing.click(screen.getByRole('button', { name: t.home.doneEditing }));
  });

  it('sin sesión la raíz es la portada de venta', async () => {
    const { usePreferences } = await import('@/app/preferences');
    // renderApp abre sesión, así que aquí se cierra antes de pintar
    app = await renderApp(SCREENS.home.path);
    usePreferences.setState({ sessionUserId: null });
    expect(await screen.findByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
  });
});
