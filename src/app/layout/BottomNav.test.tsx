// @vitest-environment jsdom
// Menú de cada rol en computadora y en el teléfono (B3 del plan del cambio). jsdom no aplica los
// estilos, así que lo que solo se ve en un ancho se revisa por sus clases, como el resto de la app.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, useLocation } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import type { Role } from '@/data/schemas/common';
import { UnsavedChangesGuard } from '@/features/shared/UnsavedChangesGuard';
import { t } from '@/i18n/es-MX';
import { NAV_BY_ROLE } from '../navigation';
import { SCREENS } from '../screens';
import { BottomNav, NAV_ID } from './BottomNav';

function Where() {
  const { pathname } = useLocation();
  return <output aria-label="ruta">{pathname}</output>;
}

function renderNav(role: Role, path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <>
            <Where />
            <BottomNav nav={NAV_BY_ROLE[role]} />
          </>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return screen.getByRole('navigation', { name: t.nav.label });
}

const textOf = (elements: HTMLElement[]) => elements.map((element) => element.textContent);
/** Lo que se ve en la barra del teléfono, sin lo que solo vive en el riel */
const phoneBar = (nav: HTMLElement) =>
  [...(nav.querySelector('ul')?.children ?? [])]
    .filter((item) => !item.classList.contains('hidden'))
    .map((item) => item.textContent);

const STUDENT_RAIL = [
  t.navItems.home,
  t.navItems.review,
  t.navItems.outlines,
  t.navItems.simulate,
  t.navItems.progress,
  t.navItems.tutor,
  t.navItems.party,
];
const ADMIN_GROUP = [
  t.navItems.users,
  // Pagos, facturas y códigos de influencer (B10)
  t.navItems.billing,
  t.navItems.costs,
  t.navItems.platform,
  t.navItems.bank,
  t.screens.demoData.title,
];

describe('riel de computadora', () => {
  it('alumno. Siete secciones arriba y Configuración sola al final, separada y con el engrane', () => {
    const nav = renderNav('student', SCREENS.home.path);
    expect(nav).toHaveAttribute('id', NAV_ID);
    expect(textOf(within(nav).getAllByRole('link'))).toEqual([
      ...STUDENT_RAIL,
      t.navItems.settings,
    ]);
    const pinned = nav.lastElementChild as HTMLElement;
    expect(pinned.tagName).toBe('UL');
    expect(pinned).toHaveClass('lg:border-t', 'lg:shrink-0');
    expect(textOf(within(pinned).getAllByRole('link'))).toEqual([t.navItems.settings]);
    expect(pinned.querySelector('svg')).toHaveClass('lucide-settings');
    // El engrane es solo de Configuración
    expect(nav.querySelectorAll('svg.lucide-settings')).toHaveLength(1);
    for (const gone of ['Plan', 'Logros', 'Perfil']) expect(nav).not.toHaveTextContent(gone);
  });

  it.each(['admin', 'owner'] as const)(
    '%s. Lo del alumno, su grupo de administración con nombre y Configuración al final',
    (role) => {
      const nav = renderNav(role, SCREENS.home.path);
      expect(textOf(within(nav).getAllByRole('link'))).toEqual([
        ...STUDENT_RAIL,
        ...ADMIN_GROUP,
        t.navItems.settings,
      ]);
      const admin = within(nav).getByRole('list', { name: t.navItems.admin });
      expect(textOf(within(admin).getAllByRole('link'))).toEqual(ADMIN_GROUP);
      // Plataforma no usa el engrane
      expect(
        within(admin).getByRole('link', { name: t.navItems.platform }).querySelector('svg'),
      ).not.toHaveClass('lucide-settings');
      expect(nav.querySelectorAll('svg.lucide-settings')).toHaveLength(1);
      expect(textOf(within(nav.lastElementChild as HTMLElement).getAllByRole('link'))).toEqual([
        t.navItems.settings,
      ]);
    },
  );

  it('médico. Sus cuatro secciones y Configuración al final, sin Perfil', () => {
    const nav = renderNav('physician', SCREENS.questionBank.path);
    expect(textOf(within(nav).getAllByRole('link'))).toEqual([
      t.navItems.bank,
      t.navItems.agreement,
      t.navItems.drafts,
      t.navItems.reports,
      t.navItems.settings,
    ]);
    expect(within(nav).getByRole('link', { name: t.navItems.bank })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('lo que es del teléfono no se ve en el riel y lo del riel no se ve en el teléfono', () => {
    const nav = renderNav('admin', SCREENS.home.path);
    const more = within(nav).getByRole('button', { name: t.navItems.more });
    expect(more.closest('li')).toHaveClass('lg:hidden');
    expect(within(nav).getByRole('list', { name: t.navItems.admin }).parentElement).toHaveClass(
      'hidden',
    );
    expect(nav.lastElementChild).toHaveClass('hidden', 'lg:flex');
  });
});

describe('barra del teléfono', () => {
  it.each(['student', 'admin', 'owner'] as const)(
    '%s. Inicio, Repasar, Simular, Progreso y Más',
    (role) => {
      const nav = renderNav(role, SCREENS.home.path);
      expect(phoneBar(nav)).toEqual([
        t.navItems.home,
        t.navItems.review,
        t.navItems.simulate,
        t.navItems.progress,
        t.navItems.more,
      ]);
      expect(nav.querySelector('ul')).toHaveStyle({
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      });
    },
  );

  it('médico. Banco, Acuerdo, Borradores, Reportes y Más', () => {
    const nav = renderNav('physician', SCREENS.questionBank.path);
    expect(phoneBar(nav)).toEqual([
      t.navItems.bank,
      t.navItems.agreement,
      t.navItems.drafts,
      t.navItems.reports,
      t.navItems.more,
    ]);
  });

  it('Más abre una hoja con nombre y foco atrapado, con Apuntes, Tutor, Party y Configuración, y Escape la cierra', async () => {
    const user = userEvent.setup();
    const nav = renderNav('student', SCREENS.home.path);
    const more = within(nav).getByRole('button', { name: t.navItems.more });
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).not.toHaveAttribute('aria-current');

    await user.click(more);
    const sheet = screen.getByRole('dialog', { name: t.nav.more });
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(textOf(within(sheet).getAllByRole('link'))).toEqual([
      t.navItems.outlines,
      t.navItems.tutor,
      t.navItems.party,
      t.navItems.settings,
    ]);
    // El foco entra a la hoja y no sale de ella con Tab
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    }

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('el botón de cerrar también cierra la hoja', async () => {
    const user = userEvent.setup();
    const nav = renderNav('student', SCREENS.home.path);
    await user.click(within(nav).getByRole('button', { name: t.navItems.more }));
    const sheet = screen.getByRole('dialog', { name: t.nav.more });
    await user.click(within(sheet).getByRole('button', { name: t.nav.closeMore }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('admin. Más agrega su grupo de administración con nombre, antes de Configuración', async () => {
    const user = userEvent.setup();
    const nav = renderNav('admin', SCREENS.home.path);
    await user.click(within(nav).getByRole('button', { name: t.navItems.more }));
    const sheet = screen.getByRole('dialog', { name: t.nav.more });
    expect(textOf(within(sheet).getAllByRole('link'))).toEqual([
      t.navItems.outlines,
      t.navItems.tutor,
      t.navItems.party,
      ...ADMIN_GROUP,
      t.navItems.settings,
    ]);
    const admin = within(sheet).getByRole('list', { name: t.navItems.admin });
    expect(textOf(within(admin).getAllByRole('link'))).toEqual(ADMIN_GROUP);
  });

  it('médico. Más solo trae Configuración', async () => {
    const user = userEvent.setup();
    const nav = renderNav('physician', SCREENS.agreement.path);
    await user.click(within(nav).getByRole('button', { name: t.navItems.more }));
    const sheet = screen.getByRole('dialog', { name: t.nav.more });
    expect(textOf(within(sheet).getAllByRole('link'))).toEqual([t.navItems.settings]);
  });

  it('elegir una sección de Más navega, cierra la hoja y deja Más marcada', async () => {
    const user = userEvent.setup();
    const nav = renderNav('student', SCREENS.home.path);
    const more = within(nav).getByRole('button', { name: t.navItems.more });
    await user.click(more);
    await user.click(
      within(screen.getByRole('dialog', { name: t.nav.more })).getByRole('link', {
        name: t.navItems.tutor,
      }),
    );
    // Se navega cuando la hoja ya se cerró y el foco volvió a Más
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'ruta' })).toHaveTextContent(SCREENS.tutor.path);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(more).toHaveAttribute('aria-current', 'true');
    // Inicio ya no es la activa
    expect(within(nav).getByRole('link', { name: t.navItems.home })).not.toHaveAttribute(
      'aria-current',
    );
    // Al abrir de nuevo, la sección actual está marcada dentro de la hoja
    await user.click(more);
    expect(
      within(screen.getByRole('dialog', { name: t.nav.more })).getByRole('link', {
        name: t.navItems.tutor,
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('en una sección de la barra, la activa es esa y Más no se marca', () => {
    const nav = renderNav('student', SCREENS.decks.path);
    expect(within(nav).getByRole('link', { name: t.navItems.review })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: t.navItems.more })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('si el aviso de cambios sin guardar detiene la sección elegida, seguir editando regresa el foco a Más', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <>
              <Where />
              {/* Como Editar perfil con cambios sin guardar */}
              <UnsavedChangesGuard dirty />
              <BottomNav nav={NAV_BY_ROLE.student} />
            </>
          ),
        },
      ],
      { initialEntries: [SCREENS.settings.path] },
    );
    render(<RouterProvider router={router} />);
    const more = screen.getByRole('button', { name: t.navItems.more });
    await user.click(more);
    await user.click(
      within(screen.getByRole('dialog', { name: t.nav.more })).getByRole('link', {
        name: t.navItems.tutor,
      }),
    );
    const warning = await screen.findByRole('alertdialog', { name: t.settingsPage.unsaved.title });
    await user.click(within(warning).getByRole('button', { name: t.settingsPage.unsaved.stay }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    await waitFor(() => {
      expect(more).toHaveFocus();
    });
    expect(screen.getByRole('status', { name: 'ruta' })).toHaveTextContent(SCREENS.settings.path);

    // Salir sin guardar sí lleva a la sección elegida
    await user.click(more);
    await user.click(
      within(screen.getByRole('dialog', { name: t.nav.more })).getByRole('link', {
        name: t.navItems.tutor,
      }),
    );
    const again = await screen.findByRole('alertdialog', { name: t.settingsPage.unsaved.title });
    await user.click(within(again).getByRole('button', { name: t.settingsPage.unsaved.leave }));
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'ruta' })).toHaveTextContent(SCREENS.tutor.path);
    });
  });

  it('la hoja se cierra si la pantalla cambia por otro camino, como el botón de atrás', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ path: '*', element: <BottomNav nav={NAV_BY_ROLE.student} /> }],
      { initialEntries: [SCREENS.review.path, SCREENS.home.path], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);
    await user.click(screen.getByRole('button', { name: t.navItems.more }));
    expect(screen.getByRole('dialog', { name: t.nav.more })).toBeInTheDocument();
    await act(async () => {
      await router.navigate(-1);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
