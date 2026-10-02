// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '@/i18n/es-MX';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';
import { routes } from './router';
import { SCREEN_KEYS, SCREENS } from './screens';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  usePreferences.setState(DEFAULT_PREFERENCES);
});

describe('rutas', () => {
  it('registra las 26 pantallas de la sección 10 con rutas únicas', () => {
    expect(SCREEN_KEYS).toHaveLength(26);
    const paths = SCREEN_KEYS.map((key) => SCREENS[key].path);
    expect(new Set(paths).size).toBe(26);
    const numbers = SCREEN_KEYS.map((key) => SCREENS[key].number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 26 }, (_, index) => index + 1));
  });

  it('muestra Inicio con la navegación de 5 secciones', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.home.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    expect(nav.querySelectorAll('a')).toHaveLength(5);
  });

  it('muestra la pantalla de no encontrada en una ruta desconocida', async () => {
    renderAt('/no-existe');
    expect(await screen.findByRole('heading', { level: 1, name: t.notFound.title })).toBeVisible();
  });

  it('carga el área del médico de forma diferida para el rol médico', async () => {
    usePreferences.setState({ role: 'physician' });
    renderAt(SCREENS.questionBank.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.questionBank.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    expect(nav).toHaveTextContent(t.navItems.bank);
    expect(nav).not.toHaveTextContent(t.navItems.review);
  });

  it('un alumno no entra al área de admin y ve cómo cambiar de rol', async () => {
    renderAt(SCREENS.aiCosts.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.access.adminTitle }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: t.roles.change })).toHaveAttribute(
      'href',
      SCREENS.roleSelector.path,
    );
  });

  it('un médico no entra al área de admin', async () => {
    usePreferences.setState({ role: 'physician' });
    renderAt(SCREENS.demoData.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.access.adminTitle }),
    ).toBeVisible();
  });

  it('admin sí entra al área médica', async () => {
    usePreferences.setState({ role: 'admin' });
    renderAt(SCREENS.agreement.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.agreement.title }),
    ).toBeVisible();
  });
});
