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

describe('marco con barra pizarra, buscador y menú en línea (D-150)', () => {
  it('la barra lleva el buscador, el menú en línea, el dock del teléfono y el chip del alumno, sin botón de menú lateral', async () => {
    app = await renderApp(SCREENS.home.path);
    const search = await screen.findByRole('searchbox', { name: t.nav.search });
    expect(search).toBeVisible();
    // El menú en línea de computadora y el dock del teléfono, con el mismo nombre
    expect(screen.getAllByRole('navigation', { name: t.nav.label })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /menú lateral/i })).toBeNull();
    expect(await screen.findByRole('link', { name: t.headerStats.profile })).toBeVisible();
    expect(usePreferences.getState().navCollapsed).toBe(false);
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}').not.toContain(
      '"navCollapsed":true',
    );
  });

  it('el título va en el contenido, en marino, con su explicación a la vista', async () => {
    app = await renderApp(SCREENS.progress.path);
    const title = await screen.findByRole('heading', { level: 1, name: t.screens.progress.title });
    // Sigue en main para el salto al contenido y el foco al navegar
    expect(title.closest('main')).toHaveAttribute('id', 'contenido');
    expect(title).toHaveClass('screen-title');
    expect(title.closest('header')).not.toHaveClass('lg:fixed');
    expect(screen.getByText(t.progress.description)).toBeVisible();
    // La racha y el alumno viven en la barra de arriba, no en el encabezado de la pantalla
    const profile = await screen.findByRole('link', { name: t.headerStats.profile });
    expect(title.closest('header')).not.toContainElement(profile);
  });

  it('el buscador de la barra lleva a Buscar tarjetas', async () => {
    const user = userEvent.setup();
    app = await renderApp(SCREENS.home.path);
    const search = await screen.findByRole('searchbox', { name: t.nav.search });
    await user.type(search, 'sepsis{Enter}');
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.explore.title }),
    ).toBeVisible();
  });
});
