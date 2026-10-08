// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/DataProvider';
import { t } from '@/i18n/es-MX';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';
import { routes } from './router';
import { SCREEN_KEYS, SCREENS } from './screens';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <DataProvider kind="real">
      <RouterProvider router={router} />
    </DataProvider>,
  );
}

afterEach(() => {
  usePreferences.setState(DEFAULT_PREFERENCES);
});

describe('rutas', () => {
  it('registra las 26 pantallas de la sección 10 más Configuración, Usuarios y Explorar con rutas únicas', () => {
    expect(SCREEN_KEYS).toHaveLength(29);
    const paths = SCREEN_KEYS.map((key) => SCREENS[key].path);
    expect(new Set(paths).size).toBe(29);
    const numbers = SCREEN_KEYS.map((key) => SCREENS[key].number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 29 }, (_, index) => index + 1));
  });

  it('sin sesión la raíz es la portada de venta, sin navegación (D-068)', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: t.nav.label })).toBeNull();
  });

  it('las pantallas del alumno muestran 5 secciones y Plan, Tutor, Party y Configuración solo en el riel, con Mazos dentro de Repasar (D-071, D-076, D-087)', async () => {
    renderAt(SCREENS.review.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.review.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    const items = nav.querySelectorAll('li');
    expect(items).toHaveLength(9);
    expect([...items].filter((item) => !item.className.includes('hidden'))).toHaveLength(5);
    expect(items[8]).toHaveTextContent(t.navItems.settings);
    expect(nav).toHaveTextContent(t.navItems.planner);
    expect(nav).toHaveTextContent(t.navItems.tutor);
    // Mazos ya no es una sección aparte, es una pestaña de Repasar
    expect(nav).not.toHaveTextContent(t.navItems.decks);
  });

  it('Repasar sigue activa cuando el alumno está en Mazos', async () => {
    renderAt(SCREENS.decks.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.decks.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    expect(within(nav).getByRole('link', { name: t.navItems.review })).toHaveAttribute(
      'aria-current',
      'page',
    );
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
    // Espera a que el banco demo termine de guardarse. Si la prueba acaba antes, la carga diferida
    // corre con el entorno ya cerrado y Vitest reporta un error de cierre intermitente (D-091)
    expect(await screen.findByText(t.bank.emptyTitle, {}, { timeout: 20_000 })).toBeVisible();
  }, 30_000);

  it('un alumno no entra al área de admin ni puede cambiarse de rol él mismo', async () => {
    renderAt(SCREENS.aiCosts.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.access.adminTitle }),
    ).toBeVisible();
    expect(screen.getByText(t.access.description)).toBeVisible();
    expect(screen.queryByRole('link', { name: t.roles.change })).toBeNull();
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
