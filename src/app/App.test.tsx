// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  it('registra las 26 pantallas de la sección 10 más Configuración, Usuarios, Explorar, Apuntes, Logros, el aviso de privacidad y los términos con rutas únicas', () => {
    expect(SCREEN_KEYS).toHaveLength(33);
    const paths = SCREEN_KEYS.map((key) => SCREENS[key].path);
    expect(new Set(paths).size).toBe(33);
    const numbers = SCREEN_KEYS.map((key) => SCREENS[key].number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 33 }, (_, index) => index + 1));
  });

  it('sin sesión la raíz es la portada de venta, sin navegación (D-068)', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
    // La portada y el marco leen la sesión cada uno por su lado. En una máquina lenta el título
    // aparece un instante antes de que el marco quite la navegación
    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: t.nav.label })).toBeNull();
    });
  }, 30_000);

  it('las pantallas del alumno muestran navegación en el riel y barra en el teléfono (D-119 B3)', async () => {
    renderAt(SCREENS.review.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.review.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    expect(nav).toHaveTextContent(t.navItems.home);
    expect(nav).toHaveTextContent(t.navItems.review);
    expect(nav).toHaveTextContent(t.navItems.outlines);
    expect(nav).toHaveTextContent(t.navItems.simulate);
    expect(nav).toHaveTextContent(t.navItems.progress);
    expect(nav).toHaveTextContent(t.navItems.tutor);
    expect(nav).toHaveTextContent(t.navItems.party);
    expect(nav).toHaveTextContent(t.navItems.settings);
    // Plan, Logros y Perfil ya no están en el menú
    expect(nav).not.toHaveTextContent(t.navItems.planner);
    expect(nav).not.toHaveTextContent(t.navItems.rewards);
    expect(nav).not.toHaveTextContent(t.navItems.profile);
    // Mazos ya no es una sección aparte, es una pestaña de Repasar
    expect(nav).not.toHaveTextContent(t.navItems.decks);
  });

  it('Repasar sigue activa cuando el alumno está en Mazos', async () => {
    renderAt(SCREENS.decks.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.decks.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    const links = within(nav).getAllByRole('link', { name: t.navItems.review });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
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
