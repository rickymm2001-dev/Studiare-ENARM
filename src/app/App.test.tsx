// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvent } from '@/data/events/createEvent';
import { DataProvider } from '@/data/DataProvider';
import { newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';
import { routes } from './router';
import { LEGACY_REDIRECTS, SCREEN_KEYS, SCREENS } from './screens';
import { renderApp, resetApp, type RenderedApp } from './testing/renderApp';

function renderAt(path: string, previous?: string) {
  const router = createMemoryRouter(routes, {
    initialEntries: previous ? [previous, path] : [path],
    initialIndex: previous ? 1 : 0,
  });
  render(
    <DataProvider kind="real">
      <RouterProvider router={router} />
    </DataProvider>,
  );
  return router;
}

let app: RenderedApp | undefined;
afterEach(async () => {
  usePreferences.setState(DEFAULT_PREFERENCES);
  if (app) {
    cleanup();
    await resetApp(app.api);
    app = undefined;
  }
});

describe('rutas', () => {
  it('registra las pantallas con rutas y números únicos, ya sin Plan, Perfil ni Logros (B3), con Admin, Pagos (B10) y las tres del banco en la nube (B11)', () => {
    expect(SCREEN_KEYS).toHaveLength(34);
    const paths = SCREEN_KEYS.map((key) => SCREENS[key].path);
    expect(new Set(paths).size).toBe(34);
    const numbers = SCREEN_KEYS.map((key) => SCREENS[key].number);
    expect(new Set(numbers).size).toBe(34);
    expect(SCREENS.adminBilling).toEqual({
      number: 34,
      path: '/admin/pagos',
      area: 'admin',
      phase: 'E',
    });
    expect(SCREENS.bankAdmin).toEqual({
      number: 35,
      path: '/admin/banco',
      area: 'admin',
      phase: 'E',
    });
    expect(SCREENS.physicianReviews).toEqual({
      number: 36,
      path: '/admin/revisiones',
      area: 'admin',
      phase: 'E',
    });
    expect(SCREENS.deckCatalogAdmin).toEqual({
      number: 37,
      path: '/admin/mazos',
      area: 'admin',
      phase: 'E',
    });
    // Los números de la especificación no se reusan y las rutas viejas no chocan con ninguna pantalla
    for (const removed of [13, 15, 31]) expect(numbers).not.toContain(removed);
    for (const key of ['planner', 'profile', 'rewards']) expect(SCREEN_KEYS).not.toContain(key);
    for (const path of Object.keys(LEGACY_REDIRECTS)) expect(paths).not.toContain(path);
  });

  it('sin sesión la raíz es la portada de venta, sin navegación (D-068)', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
    // La portada y el marco leen la sesión cada uno por su lado. En una máquina lenta el título
    // aparece un instante antes de que el marco quite la navegación
    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: t.nav.label })).toBeNull();
    });
  });

  it('el menú del alumno trae sus siete secciones, Más para el teléfono y Configuración al final, sin Plan, Logros ni Perfil (B3)', async () => {
    renderAt(SCREENS.review.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.review.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      t.navItems.home,
      t.navItems.review,
      t.navItems.outlines,
      t.navItems.simulate,
      t.navItems.progress,
      t.navItems.tutor,
      t.navItems.party,
      t.navItems.settings,
    ]);
    expect(within(nav).getByRole('button', { name: t.navItems.more })).toBeInTheDocument();
    for (const gone of ['Plan', 'Logros', 'Perfil']) expect(nav).not.toHaveTextContent(gone);
    // Mazos no es una sección aparte, es una pestaña de Repasar
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

  it('Apuntes es su propia sección, Repasar ya no queda activa ahí y en el teléfono se marca Más', async () => {
    renderAt(SCREENS.outlines.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.outlines.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    expect(within(nav).getByRole('link', { name: t.navItems.outlines })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: t.navItems.review })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(nav).getByRole('button', { name: t.navItems.more })).toHaveAttribute(
      'aria-current',
      'true',
    );
    // Apuntes dejó de ser pestaña de Repasar (comentario 12)
    expect(screen.queryByRole('navigation', { name: t.studyTabs.label })).toBeNull();
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
    expect(
      await screen.findByText(physicianText.bank.emptyTitle, {}, { timeout: 20_000 }),
    ).toBeVisible();
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

describe('rutas de las pantallas que se quitaron (B3)', () => {
  it.each([
    ['/perfil', SCREENS.settings.path, t.screens.settings.title],
    ['/planificador', SCREENS.progress.path, t.screens.progress.title],
    ['/logros', SCREENS.progress.path, t.screens.progress.title],
  ])('%s lleva a %s y reemplaza la entrada del historial', async (from, to, title) => {
    const router = renderAt(from, SCREENS.roleSelector.path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeVisible();
    expect(router.state.location.pathname).toBe(to);
    expect(router.state.historyAction).toBe('REPLACE');
    // Atrás vuelve a la pantalla anterior y no a la ruta vieja, que volvería a saltar
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.pathname).toBe(SCREENS.roleSelector.path);
  });

  it('cada ruta vieja apunta a una pantalla que existe', () => {
    expect(LEGACY_REDIRECTS).toEqual({
      '/perfil': 'settings',
      '/planificador': 'progress',
      '/logros': 'progress',
    });
  });
});

describe('Logros ya no existe (comentario 14)', () => {
  it('no quedan la pantalla, las insignias, las ligas, su aviso ni sus textos', () => {
    const removed = import.meta.glob([
      '/src/features/rewards/**',
      '/src/app/layout/BadgeToast*',
      '/src/features/profile/ProfileScreen*',
      '/src/features/planner/PlannerScreen*',
    ]);
    expect(Object.keys(removed)).toEqual([]);
    expect(Object.keys(t)).not.toContain('rewards');
    expect(Object.keys(t.widgets.names)).not.toContain('league');
    expect(Object.keys(t.widgets.names)).not.toContain('badges');
  });

  it('con más de 100 repasos, que antes ganaban una insignia, Inicio no avisa ni guarda insignias vistas', async () => {
    app = await renderApp(SCREENS.home.path, {
      seed: async (api, user) => {
        const now = Date.now();
        for (let index = 0; index < 120; index += 1) {
          const stamp = new Date(now - (120 - index) * 1000);
          await api.repos.events.append(
            createEvent(
              'card_reviewed',
              {
                cardId: newId(),
                deckId: newId(),
                source: 'card',
                rating: 'good',
                confidence: null,
                msToReveal: 2000,
                msToRate: 1500,
                stateBefore: null,
                stateAfter: {
                  due: stamp.toISOString(),
                  stability: 1,
                  difficulty: 5,
                  scheduledDays: 1,
                  learningSteps: 0,
                  reps: 1,
                  lapses: 0,
                  state: 'review',
                  lastReview: stamp.toISOString(),
                },
              },
              { userId: user.id, tz: user.timeZone, clock: { now: () => stamp } },
            ),
          );
        }
      },
    });
    // Las misiones de hoy siguen en Inicio y la de tarjetas ya se cumplió
    const missions = await screen.findByRole(
      'list',
      { name: t.widgets.names.missions },
      { timeout: 15_000 },
    );
    expect(await within(missions).findByText(t.missions.done)).toBeVisible();
    expect(screen.queryByText(/insignia/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /logros/i })).toBeNull();
    expect(Object.keys(localStorage).filter((key) => key.includes('badges'))).toEqual([]);
  }, 30_000);
});
