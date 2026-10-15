// Menú de cada rol (B3 del plan del cambio). En computadora las secciones arriba y Configuración fija
// abajo, sola y con el engrane (comentario 3). En el teléfono la barra con lo marcado para ella y Más
// con lo demás (4.28). Plan, Logros y Perfil ya no están (comentarios 6, 13 y 14).
import { Settings } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { RoleSchema, type Role } from '@/data/schemas/common';
import { t } from '@/i18n/es-MX';
import {
  navForRole,
  HOME_BY_ROLE,
  NAV_BY_ROLE,
  isMoreActive,
  isNavItemActive,
  moreSections,
  phoneBarItems,
  type NavItem,
  type RoleNav,
} from './navigation';
import { SCREENS, screenPath } from './screens';

const ROLES = RoleSchema.options;
const labels = (items: readonly NavItem[]) => items.map((item) => item.label);
const allItems = (nav: RoleNav): NavItem[] => [
  ...nav.main,
  ...nav.groups.flatMap((group) => group.items),
  ...nav.pinned,
];
const item = (role: Role, path: string): NavItem => {
  const found = allItems(NAV_BY_ROLE[role]).find((entry) => entry.path === path);
  if (!found) throw new Error(`No hay ${path} en el menú de ${role}`);
  return found;
};

const STUDENT_MAIN = [
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
  // Banco en la nube (B11). Banco y Sheet, Revisiones y Catálogo de mazos
  t.screens.bankAdmin.title,
  t.screens.physicianReviews.title,
  t.screens.deckCatalogAdmin.title,
  t.screens.demoData.title,
];
const STUDENT_BAR = [t.navItems.home, t.navItems.review, t.navItems.simulate, t.navItems.progress];
const PHYSICIAN_BAR = [
  t.navItems.bank,
  t.navItems.agreement,
  t.navItems.drafts,
  t.navItems.reports,
];

describe('menú en computadora', () => {
  it('alumno. Arriba sus siete secciones y abajo solo Configuración, con el engrane', () => {
    const nav = NAV_BY_ROLE.student;
    expect(labels(nav.main)).toEqual(STUDENT_MAIN);
    expect(nav.groups).toEqual([]);
    expect(labels(nav.pinned)).toEqual([t.navItems.settings]);
    expect(nav.pinned[0]?.path).toBe(screenPath('settings'));
    expect(nav.pinned[0]?.icon).toBe(Settings);
  });

  it.each(['admin', 'owner'] as const)(
    '%s. Lo del alumno, su grupo de administración y Configuración abajo',
    (role) => {
      const nav = NAV_BY_ROLE[role];
      expect(labels(nav.main)).toEqual(STUDENT_MAIN);
      expect(nav.groups.map((group) => group.label)).toEqual([t.navItems.admin]);
      expect(labels(nav.groups[0]?.items ?? [])).toEqual(ADMIN_GROUP);
      expect(labels(nav.pinned)).toEqual([t.navItems.settings]);
    },
  );

  it('médico. Banco, Acuerdo, Borradores y Reportes, y Configuración abajo sin Perfil', () => {
    const nav = NAV_BY_ROLE.physician;
    expect(labels(nav.main)).toEqual(PHYSICIAN_BAR);
    expect(nav.groups).toEqual([]);
    expect(labels(nav.pinned)).toEqual([t.navItems.settings]);
  });

  it.each(ROLES)(
    '%s. Sin Plan, Logros ni Perfil, y solo Configuración lleva el engrane',
    (role) => {
      const items = allItems(NAV_BY_ROLE[role]);
      for (const gone of ['Plan', 'Logros', 'Perfil']) expect(labels(items)).not.toContain(gone);
      for (const path of ['/planificador', '/logros', '/perfil']) {
        expect(items.map((entry) => entry.path)).not.toContain(path);
      }
      expect(labels(items.filter((entry) => entry.icon === Settings))).toEqual([
        t.navItems.settings,
      ]);
    },
  );

  it.each(ROLES)('%s. Cada entrada abre una pantalla registrada, sin repetir', (role) => {
    const paths = allItems(NAV_BY_ROLE[role]).map((entry) => entry.path);
    const known = new Set(Object.values(SCREENS).map((screen) => screen.path));
    expect(paths.every((path) => known.has(path))).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain(HOME_BY_ROLE[role]);
  });
});

describe('menú en el teléfono', () => {
  it('alumno. Inicio, Repasar, Simular y Progreso en la barra, y Más con Apuntes, Tutor, Party y Configuración', () => {
    const nav = NAV_BY_ROLE.student;
    expect(labels(phoneBarItems(nav))).toEqual(STUDENT_BAR);
    const more = moreSections(nav);
    expect(more.map((section) => labels(section.items))).toEqual([
      [t.navItems.outlines, t.navItems.tutor, t.navItems.party],
      [t.navItems.settings],
    ]);
    expect(more.map((section) => section.label)).toEqual([undefined, undefined]);
  });

  it.each(['admin', 'owner'] as const)(
    '%s. La misma barra y en Más su grupo de administración con nombre, antes de Configuración',
    (role) => {
      const nav = NAV_BY_ROLE[role];
      expect(labels(phoneBarItems(nav))).toEqual(STUDENT_BAR);
      const more = moreSections(nav);
      expect(more.map((section) => section.label)).toEqual([
        undefined,
        t.navItems.admin,
        undefined,
      ]);
      expect(more.map((section) => labels(section.items))).toEqual([
        [t.navItems.outlines, t.navItems.tutor, t.navItems.party],
        ADMIN_GROUP,
        [t.navItems.settings],
      ]);
    },
  );

  it('médico. Sus cuatro secciones en la barra y Más solo con Configuración', () => {
    const nav = NAV_BY_ROLE.physician;
    expect(labels(phoneBarItems(nav))).toEqual(PHYSICIAN_BAR);
    expect(moreSections(nav).map((section) => labels(section.items))).toEqual([
      [t.navItems.settings],
    ]);
  });

  it.each(ROLES)('%s. La barra cabe en cinco lugares contando Más', (role) => {
    expect(phoneBarItems(NAV_BY_ROLE[role]).length + 1).toBeLessThanOrEqual(5);
  });

  it.each(ROLES)('%s. Lo que no va en la barra está en Más, una sola vez', (role) => {
    const nav = NAV_BY_ROLE[role];
    const phone = [
      ...phoneBarItems(nav),
      ...moreSections(nav).flatMap((section) => section.items),
    ].map((entry) => entry.path);
    expect(new Set(phone).size).toBe(phone.length);
    expect([...phone].sort()).toEqual(
      allItems(nav)
        .map((entry) => entry.path)
        .sort(),
    );
  });

  it('una sección sin nada fuera de la barra no deja bloques vacíos en Más', () => {
    const nav: RoleNav = {
      main: [{ ...item('student', screenPath('home')), bar: true }],
      groups: [{ label: t.navItems.admin, items: [] }],
      pinned: [],
    };
    expect(moreSections(nav)).toEqual([]);
    expect(isMoreActive(nav, screenPath('home'))).toBe(false);
  });
});

describe('sección activa', () => {
  const review = item('student', screenPath('review'));

  it('Repasar se marca en Mazos y en Explorar, pero ya no en Apuntes (comentario 12)', () => {
    expect(isNavItemActive(review, screenPath('review'))).toBe(true);
    expect(isNavItemActive(review, screenPath('decks'))).toBe(true);
    expect(isNavItemActive(review, screenPath('explore'))).toBe(true);
    expect(isNavItemActive(review, screenPath('outlines'))).toBe(false);
    expect(isNavItemActive(item('student', screenPath('outlines')), '/apuntes')).toBe(true);
  });

  it('Inicio solo en su ruta exacta y Simular también en sus pantallas internas', () => {
    const home = item('student', screenPath('home'));
    expect(isNavItemActive(home, '/')).toBe(true);
    expect(isNavItemActive(home, screenPath('progress'))).toBe(false);
    const simulate = item('student', screenPath('simulatorSetup'));
    expect(isNavItemActive(simulate, screenPath('exam'))).toBe(true);
    // Una ruta que solo empieza igual no cuenta
    expect(isNavItemActive(simulate, '/simulaciones')).toBe(false);
  });

  it('Plataforma del admin no deja activa Configuración', () => {
    const settings = item('admin', screenPath('settings'));
    expect(isNavItemActive(settings, screenPath('adminSettings'))).toBe(false);
    expect(
      isNavItemActive(item('admin', screenPath('adminSettings')), '/admin/configuracion'),
    ).toBe(true);
  });

  it('Más se marca cuando la pantalla abierta es una de las suyas', () => {
    const student = NAV_BY_ROLE.student;
    for (const key of ['outlines', 'tutor', 'party', 'settings'] as const) {
      expect(isMoreActive(student, screenPath(key)), key).toBe(true);
    }
    for (const key of ['home', 'review', 'decks', 'simulatorSetup', 'progress'] as const) {
      expect(isMoreActive(student, screenPath(key)), key).toBe(false);
    }
    expect(isMoreActive(NAV_BY_ROLE.admin, screenPath('adminUsers'))).toBe(true);
    expect(isMoreActive(NAV_BY_ROLE.physician, screenPath('settings'))).toBe(true);
    expect(isMoreActive(NAV_BY_ROLE.physician, screenPath('questionBank'))).toBe(false);
  });
});

describe('banderas en el menú (5.4)', () => {
  const demoPath = screenPath('demoData');
  const paths = (role: Role, on: boolean) =>
    navForRole(role, () => on).groups.flatMap((group) => group.items.map((item) => item.path));

  it('Datos de demostración solo aparece para el admin con demoTools prendida', () => {
    expect(paths('admin', true)).toContain(demoPath);
    expect(paths('owner', true)).toContain(demoPath);
    expect(paths('admin', false)).not.toContain(demoPath);
    expect(paths('student', true)).not.toContain(demoPath);
  });

  it('sin banderas el menú no cambia', () => {
    for (const role of RoleSchema.options) {
      const nav = navForRole(role, () => true);
      expect(nav.main).toEqual(NAV_BY_ROLE[role].main);
      expect(nav.pinned).toEqual(NAV_BY_ROLE[role].pinned);
    }
  });
});
