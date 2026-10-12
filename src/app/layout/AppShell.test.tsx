// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { t } from '@/i18n/es-MX';
import { PREFERENCES_STORAGE_KEY, usePreferences } from '../preferences';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

describe('marco con barra superior y menú lateral que se oculta (D-117)', () => {
  it('el botón de las tres barras oculta y muestra el riel y lo recuerda en este navegador', async () => {
    const user = userEvent.setup();
    app = await renderApp(SCREENS.home.path);
    const toggle = await screen.findByRole('button', { name: t.nav.toggle });
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', nav.id);
    expect(toggle).toHaveAttribute('title', t.nav.hide);
    expect(nav).not.toHaveClass('lg:hidden');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('title', t.nav.show);
    // Solo se oculta en computadora. En el teléfono la navegación de abajo sigue
    expect(nav).toHaveClass('lg:hidden');
    expect(usePreferences.getState().navCollapsed).toBe(true);
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}')).toMatchObject({
      navCollapsed: true,
    });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(nav).not.toHaveClass('lg:hidden');
  });

  it('el título, la racha y el nivel van en la barra y el h1 sigue dentro del contenido', async () => {
    const user = userEvent.setup();
    app = await renderApp(SCREENS.progress.path);
    const title = await screen.findByRole('heading', { level: 1, name: t.screens.progress.title });
    // Sigue en main para el salto al contenido y el foco al navegar
    expect(title.closest('main')).toHaveAttribute('id', 'contenido');
    const bar = title.closest('header');
    expect(bar).toHaveClass('lg:fixed');
    expect(bar).toContainElement(await screen.findByRole('link', { name: t.headerStats.profile }));
    // La explicación se abre fuera de la barra, para que la barra no crezca
    await user.click(
      screen.getByRole('button', { name: t.app.aboutScreen(t.screens.progress.title) }),
    );
    const description = screen.getByText(t.progress.description);
    expect(description).toBeVisible();
    expect(bar).not.toContainElement(description);
  });
});
