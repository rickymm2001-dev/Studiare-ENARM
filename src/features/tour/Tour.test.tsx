// @vitest-environment jsdom
// El recorrido guiado completo, con el menú de verdad (BottomNav) y pantallas de mentira que solo ponen su
// encabezado (B15, 4.1 a 4.6 del plan de B15). jsdom no calcula el diseño, así que lo que "se ve" y el ancho
// de la ventana se declaran a mano
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, useLocation } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/app/layout/BottomNav';
import { NAV_BY_ROLE } from '@/app/navigation';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { writeStoredFlags } from '@/config/featureFlags';
import {
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
  type AnalyticsRecord,
} from '@/data/analytics/catalog';
import { tourTexts } from '@/i18n/tour';
import { screenKeyOfPath } from './anchors';
import {
  TOUR_AUTO_OFFER_OFF,
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  markTourPending,
  readTourState,
} from './steps';
import { screenOf } from './tourMachine';
import { TourLauncher } from './TourLauncher';
import { requestTour, useTourRequest } from './tourRequest';

// Cuántas veces se bajó el anfitrión del recorrido, que TourLauncher importa con lazy solo cuando hay algo
// que ofrecer. La primera prueba del archivo comprueba que antes de eso no se baja
const hostLoads = vi.hoisted(() => ({ count: 0 }));
vi.mock('./TourHost', async (importOriginal) => {
  hostLoads.count += 1;
  return importOriginal();
});

const USER = '01J0000000000000000ALUMNA';

let viewportKind: 'phone' | 'desktop' = 'desktop';

/** El ancho de la ventana. El riel desde 1024 px y el globo deja de ser hoja desde 640 px */
function setViewport(kind: 'phone' | 'desktop') {
  viewportKind = kind;
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: kind === 'desktop' && (query.includes('64rem') || query.includes('40rem')),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

/**
 * Si Tailwind esconde el elemento en el ancho de la prueba, por las clases hidden, lg:block, lg:flex y
 * lg:hidden de sus ancestros, que son las que usa el menú. Con data-gone se esconde a mano
 */
function hiddenByClasses(element: HTMLElement): boolean {
  if (element.hasAttribute('data-gone')) return true;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const classes = node.classList;
    if (viewportKind === 'desktop') {
      if (
        classes.contains('lg:hidden') ||
        (classes.contains('hidden') &&
          !classes.contains('lg:block') &&
          !classes.contains('lg:flex'))
      ) {
        return true;
      }
    } else if (classes.contains('hidden')) {
      return true;
    }
  }
  return false;
}

/** Lo que jsdom no sabe. Todo ocupa lugar salvo lo que esconden las clases del menú */
function fakeLayout() {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    return (hiddenByClasses(this) ? [] : [new DOMRect(0, 0, 80, 56)]) as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(8, 120, 80, 56),
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

/** Una pantalla de mentira. Solo lo que el recorrido espera, el encabezado con la clave de su pantalla */
function FakeScreen() {
  const { pathname } = useLocation();
  const key = screenKeyOfPath(pathname);
  return (
    <main>
      <header data-tour-screen={key}>
        <h1 tabIndex={-1}>Pantalla {key ?? pathname}</h1>
      </header>
      <Link to="/otra">Ir a otra</Link>
    </main>
  );
}

function Where() {
  return <output aria-label="ruta">{useLocation().pathname}</output>;
}

function renderApp({ path = '/', userId = USER }: { path?: string; userId?: string | null } = {}) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <>
            <Where />
            <FakeScreen />
            <BottomNav nav={NAV_BY_ROLE.student} />
            <TourLauncher userId={userId} />
          </>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const pathNow = () => screen.getByLabelText('ruta').textContent;
const balloon = () => screen.queryByRole('dialog');
const next = () => userEvent.click(screen.getByRole('button', { name: /^(Siguiente|Terminar)$/ }));

/** Deja marcado al alumno como lo hace el registro, con el navegador de quien llega por primera vez */
function arriveAsNewStudent() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
  markTourPending(USER);
}

beforeEach(() => {
  localStorage.clear();
  writeStoredFlags(null);
  usePreferences.setState({ role: 'student' });
  useTourRequest.getState().clear();
  resetAnalytics();
  fakeLayout();
  setViewport('desktop');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lo único que viaja al inicio', () => {
  // Va primero a propósito: el anfitrión se baja una vez por archivo y las demás pruebas ya lo necesitan
  it('sin marca del registro ni petición no monta nada y no baja el recorrido', async () => {
    renderApp();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(hostLoads.count).toBe(0);
    expect(balloon()).toBeNull();
    // Ni con una cuenta que ya lo vio, ni con la marca de otro navegador sin alumnos pendientes
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ handled: [USER], autoOffer: true }));
    cleanup();
    renderApp();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(hostLoads.count).toBe(0);
  });

  it('sin alumno con sesión no baja nada aunque haya marca', async () => {
    arriveAsNewStudent();
    renderApp({ userId: null });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(balloon()).toBeNull();
  });
});

describe('empieza solo al llegar a Inicio con una cuenta nueva', () => {
  it('con la marca del registro, en Inicio, y se ve la bienvenida al centro', async () => {
    arriveAsNewStudent();
    renderApp();
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 5000 });
    expect(dialog).toHaveAccessibleName(`Paso 1 de 8 ${tourTexts.steps.welcome.title}`);
    expect(dialog).toHaveAttribute('data-tour-mode', 'center');
    expect(screen.getByRole('button', { name: tourTexts.skip })).toBeVisible();
    expect(screen.queryByRole('button', { name: tourTexts.back })).toBeNull();
  });

  it.each([
    [
      'una cuenta de antes, sin la marca del registro',
      () => {
        localStorage.removeItem(TOUR_STORAGE_KEY);
      },
    ],
    [
      'quien ya lo vio en este navegador',
      () => {
        arriveAsNewStudent();
        const state = readTourState();
        localStorage.setItem(
          TOUR_STORAGE_KEY,
          JSON.stringify({ ...state, handled: [USER], pending: [USER] }),
        );
      },
    ],
    [
      'las e2e que no son del recorrido, con autoOffer en false',
      () => {
        localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(TOUR_AUTO_OFFER_OFF));
        markTourPending(USER);
      },
    ],
    [
      'la bandera guidedTour apagada',
      () => {
        arriveAsNewStudent();
        writeStoredFlags({ guidedTour: false });
      },
    ],
    [
      'un médico, que tiene otro menú',
      () => {
        arriveAsNewStudent();
        usePreferences.setState({ role: 'physician' });
      },
    ],
  ])('no empieza con %s', async (_name, prepare) => {
    prepare();
    renderApp();
    // Más que dos vueltas de la revisión de cada 600 ms
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(balloon()).toBeNull();
  });

  it('no empieza fuera de Inicio ni sin alumno con sesión, y sí cuando llega a Inicio', async () => {
    arriveAsNewStudent();
    const router = renderApp({ path: SCREENS.review.path });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(balloon()).toBeNull();
    await act(() => router.navigate('/'));
    expect(await screen.findByRole('dialog', undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it('espera a que se cierre otro diálogo y entonces empieza', async () => {
    arriveAsNewStudent();
    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    other.setAttribute('aria-label', 'Otro aviso');
    document.body.append(other);
    renderApp();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(screen.queryByRole('dialog', { name: /Paso 1/ })).toBeNull();
    other.remove();
    expect(
      await screen.findByRole('dialog', { name: /Paso 1 de 8/ }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});

describe('el recorrido completo', () => {
  it('recorre los ocho pasos en computadora, navega a cada pantalla y termina en Inicio con el foco en su título', async () => {
    arriveAsNewStudent();
    renderApp();
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ }, { timeout: 5000 });
    for (const [index, step] of TOUR_STEPS.entries()) {
      const title = tourTexts.steps[step].title;
      const dialog = await screen.findByRole('dialog', {
        name: `${tourTexts.counter(index + 1, 8)} ${title}`,
      });
      expect(within(dialog).getByText(tourTexts.steps[step].text)).toBeVisible();
      // Cada paso abre su pantalla, con su encabezado ya pintado
      expect(pathNow(), step).toBe(SCREENS[screenOf(step)].path);
      expect(document.querySelector(`[data-tour-screen="${screenOf(step)}"]`)).not.toBeNull();
      // Y señala algo del menú, salvo la bienvenida
      expect(dialog).toHaveAttribute('data-tour-mode', index === 0 ? 'center' : 'anchored');
      expect(screen.getByRole('button', { name: tourTexts.skip })).toBeVisible();
      await next();
    }
    await waitFor(() => {
      expect(balloon()).toBeNull();
    });
    expect(pathNow()).toBe(SCREENS.home.path);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    });
    // Queda como visto, y ya no está pendiente
    expect(readTourState()).toEqual({ handled: [USER], autoOffer: true });
  });

  it('en el teléfono todos los pasos son una hoja que señala la barra de abajo o Más', async () => {
    setViewport('phone');
    arriveAsNewStudent();
    renderApp();
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ }, { timeout: 5000 });
    for (const [index, step] of TOUR_STEPS.entries()) {
      const dialog = await screen.findByRole('dialog', {
        name: `${tourTexts.counter(index + 1, 8)} ${tourTexts.steps[step].title}`,
      });
      expect(dialog).toHaveAttribute('data-tour-mode', 'sheet');
      expect(pathNow(), step).toBe(SCREENS[screenOf(step)].path);
      // Un resalte (cuatro rectángulos y el borde) en todos menos en la bienvenida, que va sin elemento
      const backdrop = document.querySelector('[data-tour-backdrop]');
      expect(backdrop?.children, step).toHaveLength(index === 0 ? 1 : 5);
      await next();
    }
    await waitFor(() => {
      expect(balloon()).toBeNull();
    });
  });

  it('Atrás vuelve al paso anterior y a su pantalla', async () => {
    arriveAsNewStudent();
    renderApp();
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ }, { timeout: 5000 });
    await next();
    await next();
    await screen.findByRole('dialog', { name: /Paso 3 de 8/ });
    expect(pathNow()).toBe(SCREENS.review.path);
    await userEvent.click(screen.getByRole('button', { name: tourTexts.back }));
    await screen.findByRole('dialog', { name: /Paso 2 de 8/ });
    expect(pathNow()).toBe(SCREENS.home.path);
  });

  it('Saltar introducción en un paso del medio vuelve a Inicio, queda como visto y no reaparece', async () => {
    arriveAsNewStudent();
    const router = renderApp();
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ }, { timeout: 5000 });
    await next();
    await next();
    await next();
    await screen.findByRole('dialog', { name: /Paso 4 de 8/ });
    expect(pathNow()).toBe(SCREENS.outlines.path);
    await userEvent.click(screen.getByRole('button', { name: tourTexts.skip }));
    await waitFor(() => {
      expect(balloon()).toBeNull();
    });
    expect(pathNow()).toBe(SCREENS.home.path);
    expect(readTourState().handled).toEqual([USER]);
    // Volver a Inicio no lo reabre
    await act(() => router.navigate(SCREENS.review.path));
    await act(() => router.navigate('/'));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(balloon()).toBeNull();
  });

  it('Escape salta en cualquier paso', async () => {
    arriveAsNewStudent();
    renderApp();
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ }, { timeout: 5000 });
    await next();
    await screen.findByRole('dialog', { name: /Paso 2 de 8/ });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(balloon()).toBeNull();
    });
    expect(readTourState().handled).toEqual([USER]);
  });

  it('con el riel oculto el ancla no se ve y el paso va al centro sin romperse', async () => {
    arriveAsNewStudent();
    renderApp();
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ }, { timeout: 5000 });
    // El botón del menú oculta el riel. Aquí se simula con lo que oculta Tailwind
    for (const anchor of document.querySelectorAll('[data-tour]'))
      anchor.setAttribute('data-gone', '');
    await next();
    const dialog = await screen.findByRole('dialog', { name: /Paso 2 de 8/ });
    expect(dialog).toHaveAttribute('data-tour-mode', 'center');
    expect(screen.getByRole('button', { name: tourTexts.skip })).toBeVisible();
  });
});

describe('volver a verlo desde Configuración', () => {
  it('empieza en el primer paso aunque ya lo haya visto, y al terminar sigue como visto', async () => {
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ handled: [USER], autoOffer: false }));
    renderApp({ path: SCREENS.settings.path });
    expect(balloon()).toBeNull();
    act(() => {
      requestTour();
    });
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ });
    expect(pathNow()).toBe(SCREENS.home.path);
    await userEvent.click(screen.getByRole('button', { name: tourTexts.skip }));
    await waitFor(() => {
      expect(balloon()).toBeNull();
    });
    expect(useTourRequest.getState().trigger).toBeNull();
    expect(readTourState().handled).toEqual([USER]);
    // Se puede pedir otra vez
    act(() => {
      requestTour();
    });
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ });
  });

  it('un médico o con la bandera apagada no lo ve aunque lo pida', async () => {
    usePreferences.setState({ role: 'physician' });
    renderApp({ path: SCREENS.settings.path });
    act(() => {
      requestTour();
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(balloon()).toBeNull();
  });
});

describe('medición', () => {
  const sent: AnalyticsRecord[] = [];
  beforeEach(() => {
    sent.length = 0;
    setAnalyticsSink((record) => sent.push(record));
  });

  it('con el permiso mide el inicio, cada paso visto y el salto, solo con listas cerradas', async () => {
    setAnalyticsConsent(true);
    arriveAsNewStudent();
    renderApp();
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ }, { timeout: 5000 });
    await next();
    await screen.findByRole('dialog', { name: /Paso 2 de 8/ });
    await userEvent.click(screen.getByRole('button', { name: tourTexts.skip }));
    await waitFor(() => {
      expect(balloon()).toBeNull();
    });
    expect(sent.map((record) => [record.event, record.properties])).toEqual([
      ['tour_started', { trigger: 'auto' }],
      ['tour_step_viewed', { step: 'welcome' }],
      ['tour_step_viewed', { step: 'home' }],
      ['tour_skipped', { step: 'home' }],
    ]);
  });

  it('desde Configuración mide trigger settings y al terminar tour_completed', async () => {
    setAnalyticsConsent(true);
    renderApp({ path: SCREENS.settings.path });
    act(() => {
      requestTour();
    });
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ });
    for (let step = 0; step < 8; step += 1) await next();
    await waitFor(() => {
      expect(balloon()).toBeNull();
    });
    expect(sent[0]).toMatchObject({ event: 'tour_started', properties: { trigger: 'settings' } });
    expect(sent.filter((record) => record.event === 'tour_step_viewed')).toHaveLength(8);
    expect(sent.at(-1)).toMatchObject({
      event: 'tour_completed',
      properties: { step: 'settings' },
    });
  });

  it.each([[false], [null]])('con el permiso en %s no sale nada', async (consent) => {
    setAnalyticsConsent(consent);
    renderApp({ path: SCREENS.settings.path });
    act(() => {
      requestTour();
    });
    await screen.findByRole('dialog', { name: /Paso 1 de 8/ });
    await next();
    await userEvent.click(screen.getByRole('button', { name: tourTexts.skip }));
    await waitFor(() => {
      expect(balloon()).toBeNull();
    });
    expect(sent).toEqual([]);
  });
});

describe('las anclas del menú de verdad', () => {
  it('cada sección del menú lleva su data-tour, Más el suyo y Configuración el suyo', () => {
    renderApp();
    const anchors = [...document.querySelectorAll('[data-tour]')].map((element) =>
      element.getAttribute('data-tour'),
    );
    expect(anchors).toEqual([
      'nav-home',
      'nav-review',
      'nav-outlines',
      'nav-simulatorSetup',
      'nav-progress',
      'nav-calendar',
      'nav-tutor',
      'nav-party',
      'nav-more',
      'nav-settings',
    ]);
  });

  it('cada pantalla pone en su encabezado su propia clave', () => {
    renderApp({ path: SCREENS.progress.path });
    expect(document.querySelector('[data-tour-screen="progress"] h1')).not.toBeNull();
  });
});
