// Navegación de cada rol (10.4, D-076 y B3 del plan del cambio). En computadora un riel lateral con
// las secciones arriba y Configuración fija abajo a la izquierda, separada y con el engrane
// (comentario 3). En el teléfono una barra abajo con las secciones marcadas para la barra y Más,
// que abre las demás en una hoja (4.28). Administrador y dueño también estudian, así que ven lo del
// alumno y su grupo de administración (D-076). Aquí solo hay datos y funciones puras. Lo que se pinta
// vive en layout/BottomNav.tsx.
import {
  FlaskConical,
  BookOpenCheck,
  ChartLine,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Database,
  FileText,
  Flag,
  GraduationCap,
  FileSpreadsheet,
  House,
  Library,
  NotebookPen,
  PartyPopper,
  Receipt,
  Scale,
  Settings,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { isFeatureEnabled, type FeatureFlag } from '@/config/featureFlags';
import type { Role } from '@/data/schemas/common';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { screenPath } from './screens';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Solo marca activa la ruta exacta, para que Inicio no quede activo en todas */
  end?: boolean;
  /** Otras rutas que también dejan activa esta sección, como Mazos dentro de Repasar (D-087) */
  alsoActive?: readonly string[];
  /** Solo aparece con esta bandera prendida, como Datos de demostración (5.4) */
  flag?: FeatureFlag;
}

/** Sección de arriba del riel. Solo estas pueden ir en la barra del teléfono */
export interface MainNavItem extends NavItem {
  /** Va en la barra de abajo del teléfono. Lo demás se abre desde Más (4.28) */
  bar?: boolean;
}

/** Grupo extra del riel, con su línea divisoria y su nombre, como Administración (D-076) */
export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export interface RoleNav {
  /** Secciones de arriba del riel, en orden */
  main: readonly MainNavItem[];
  /** Grupos que siguen a las secciones, cada uno separado con una línea */
  groups: readonly NavGroup[];
  /** Fijo abajo a la izquierda del riel y al final de Más. Solo Configuración (comentario 3) */
  pinned: readonly NavItem[];
}

/** Un bloque de la hoja Más. Los grupos extra llevan su nombre */
export interface MoreSection {
  label?: string;
  items: readonly NavItem[];
}

const settings: NavItem = {
  path: screenPath('settings'),
  label: t.navItems.settings,
  icon: Settings,
};

const bank: NavItem = { path: screenPath('questionBank'), label: t.navItems.bank, icon: Database };

const studentMain: readonly MainNavItem[] = [
  { path: screenPath('home'), label: t.navItems.home, icon: House, end: true, bar: true },
  // Repasar y Mazos son una sola sección con pestañas (D-087). Apuntes ya tiene su lugar en el menú
  // (comentario 12), así que Repasar no queda activa en /apuntes
  {
    path: screenPath('review'),
    label: t.navItems.review,
    icon: BookOpenCheck,
    bar: true,
    alsoActive: [screenPath('decks'), screenPath('explore')],
  },
  { path: screenPath('outlines'), label: t.navItems.outlines, icon: NotebookPen },
  {
    path: screenPath('simulatorSetup'),
    label: t.navItems.simulate,
    icon: ClipboardList,
    bar: true,
  },
  { path: screenPath('progress'), label: t.navItems.progress, icon: ChartLine, bar: true },
  { path: screenPath('tutor'), label: t.navItems.tutor, icon: GraduationCap },
  { path: screenPath('party'), label: t.navItems.party, icon: PartyPopper },
];

const adminGroup: NavGroup = {
  label: t.navItems.admin,
  items: [
    { path: screenPath('adminUsers'), label: t.navItems.users, icon: Users },
    // Pagos, facturas y códigos de influencer (B10)
    { path: screenPath('adminBilling'), label: t.navItems.billing, icon: Receipt },
    { path: screenPath('aiCosts'), label: t.navItems.costs, icon: Coins },
    // Sin engrane, que es solo de Configuración (comentario 3)
    { path: screenPath('adminSettings'), label: t.navItems.platform, icon: SlidersHorizontal },
    bank,
    // Banco en la nube (B11). Database ya es del Banco del médico
    { path: screenPath('bankAdmin'), label: bankAdminText.nav.bank, icon: FileSpreadsheet },
    {
      path: screenPath('physicianReviews'),
      label: bankAdminText.nav.reviews,
      icon: ClipboardCheck,
    },
    { path: screenPath('deckCatalogAdmin'), label: bankAdminText.nav.decks, icon: Library },
    // Único lugar para cambiar de base y generar alumnos simulados. En producción se esconde (5.4)
    {
      path: screenPath('demoData'),
      label: t.screens.demoData.title,
      icon: FlaskConical,
      flag: 'demoTools',
    },
  ],
};

const studentNav: RoleNav = { main: studentMain, groups: [], pinned: [settings] };
const adminNav: RoleNav = { main: studentMain, groups: [adminGroup], pinned: [settings] };

export const NAV_BY_ROLE: Record<Role, RoleNav> = {
  student: studentNav,
  physician: {
    main: [
      { ...bank, bar: true },
      { path: screenPath('agreement'), label: t.navItems.agreement, icon: Scale, bar: true },
      { path: screenPath('aiDrafts'), label: t.navItems.drafts, icon: FileText, bar: true },
      { path: screenPath('contentReports'), label: t.navItems.reports, icon: Flag, bar: true },
    ],
    groups: [],
    pinned: [settings],
  },
  admin: adminNav,
  owner: adminNav,
};

/** Pantalla de entrada de cada rol */
export const HOME_BY_ROLE: Record<Role, string> = {
  student: screenPath('home'),
  physician: screenPath('questionBank'),
  admin: screenPath('home'),
  owner: screenPath('home'),
};

/** Lo que va en la barra del teléfono, en el orden del riel */
export function phoneBarItems(nav: RoleNav): MainNavItem[] {
  return nav.main.filter((item) => item.bar === true);
}

/**
 * Lo que abre Más en el teléfono. Primero las secciones que no caben en la barra, luego cada grupo
 * con su nombre y al final lo fijo, igual que en el riel. Sin bloques vacíos
 */
export function moreSections(nav: RoleNav): MoreSection[] {
  const sections: MoreSection[] = [
    { items: nav.main.filter((item) => item.bar !== true) },
    ...nav.groups,
    { items: nav.pinned },
  ];
  return sections.filter((section) => section.items.length > 0);
}

/**
 * La sección está activa en su ruta, en las que cuelgan de ella y en las que declara, como Mazos
 * dentro de Repasar. Con end solo cuenta la ruta exacta
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.path;
  const within = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return within(item.path) || (item.alsoActive ?? []).some(within);
}

/** Más queda activa cuando la pantalla abierta es una de las suyas */
export function isMoreActive(nav: RoleNav, pathname: string): boolean {
  return moreSections(nav).some((section) =>
    section.items.some((item) => isNavItemActive(item, pathname)),
  );
}

/**
 * El menú de un rol sin lo que esconden las banderas apagadas. Lo usa el marco de la app. Las
 * pruebas pueden pasar cómo leer cada bandera
 */
export function navForRole(
  role: Role,
  enabled: (flag: FeatureFlag) => boolean = (flag) => isFeatureEnabled(flag),
): RoleNav {
  const visible = <T extends NavItem>(items: readonly T[]) =>
    items.filter((item) => item.flag === undefined || enabled(item.flag));
  const nav = NAV_BY_ROLE[role];
  return {
    main: visible(nav.main),
    groups: nav.groups
      .map((group) => ({ ...group, items: visible(group.items) }))
      .filter((group) => group.items.length > 0),
    pinned: visible(nav.pinned),
  };
}
