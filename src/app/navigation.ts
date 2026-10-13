// Secciones de la navegación (10.4, D-119 B3).
// Computadora: Arriba Inicio, Repasar, Apuntes, Simular, Progreso, Tutor, Party (y administración si aplica).
// Abajo a la izquierda, fija y separada: Configuración con engrane (Settings).
// Teléfono: Inicio, Repasar, Simular, Progreso y Más (abre Apuntes, Tutor, Party y Configuración).
import {
  BookOpenCheck,
  ChartLine,
  ClipboardList,
  Coins,
  Database,
  FileText,
  Flag,
  GraduationCap,
  House,
  NotebookPen,
  PartyPopper,
  Scale,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/data/schemas/common';
import { t } from '@/i18n/es-MX';
import { screenPath } from './screens';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Solo marca activa la ruta exacta, para que Inicio no quede activo en todas */
  end?: boolean;
  /** Solo en el riel de computadora */
  railOnly?: boolean;
  /** Abre un grupo nuevo en el riel con una línea divisoria */
  groupStart?: boolean;
  /** Fijado abajo en el riel de computadora (Configuración) */
  bottom?: boolean;
  /** Otras rutas que también dejan activa esta sección, como Mazos dentro de Repasar */
  alsoActive?: readonly string[];
}

/** Para que el botón del menú superior diga qué controla */
export const NAV_ID = 'menu-lateral';

/**
 * La sección está activa en su ruta y en las que declara, por ejemplo Mazos dentro de Repasar. Con
 * end solo cuenta la ruta exacta, para que Inicio no quede activo en todas
 */
export function isActive(item: NavItem, pathname: string): boolean {
  const within = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  if (item.end) return pathname === item.path;
  return within(item.path) || (item.alsoActive ?? []).some(within);
}

export const settingsItem: NavItem = {
  path: screenPath('settings'),
  label: t.navItems.settings,
  icon: Settings,
  bottom: true,
};

const bank: NavItem = { path: screenPath('questionBank'), label: t.navItems.bank, icon: Database };

const studentNav: readonly NavItem[] = [
  { path: screenPath('home'), label: t.navItems.home, icon: House, end: true },
  {
    path: screenPath('review'),
    label: t.navItems.review,
    icon: BookOpenCheck,
    alsoActive: [screenPath('decks'), screenPath('explore')],
  },
  { path: screenPath('outlines'), label: t.navItems.outlines, icon: NotebookPen },
  { path: screenPath('simulatorSetup'), label: t.navItems.simulate, icon: ClipboardList },
  { path: screenPath('progress'), label: t.navItems.progress, icon: ChartLine },
  { path: screenPath('tutor'), label: t.navItems.tutor, icon: GraduationCap },
  { path: screenPath('party'), label: t.navItems.party, icon: PartyPopper },
  settingsItem,
];

const adminGroup: readonly NavItem[] = [
  { path: screenPath('adminUsers'), label: t.navItems.users, icon: Users, groupStart: true },
  { path: screenPath('aiCosts'), label: t.navItems.costs, icon: Coins },
  { path: screenPath('adminSettings'), label: t.navItems.platform, icon: Settings },
  bank,
];

const adminNav: readonly NavItem[] = [
  ...studentNav.filter((item) => !item.bottom),
  ...adminGroup,
  settingsItem,
];

export const NAV_BY_ROLE: Record<Role, readonly NavItem[]> = {
  student: studentNav,
  physician: [
    bank,
    { path: screenPath('agreement'), label: t.navItems.agreement, icon: Scale },
    { path: screenPath('aiDrafts'), label: t.navItems.drafts, icon: FileText },
    { path: screenPath('contentReports'), label: t.navItems.reports, icon: Flag },
    settingsItem,
  ],
  admin: adminNav,
  owner: adminNav,
};

/** Ítems de la barra móvil principal (4 secciones fijas, el 5to es Más) */
export const MOBILE_PRIMARY_NAV: readonly NavItem[] = [
  { path: screenPath('home'), label: t.navItems.home, icon: House, end: true },
  {
    path: screenPath('review'),
    label: t.navItems.review,
    icon: BookOpenCheck,
    alsoActive: [screenPath('decks'), screenPath('explore')],
  },
  { path: screenPath('simulatorSetup'), label: t.navItems.simulate, icon: ClipboardList },
  { path: screenPath('progress'), label: t.navItems.progress, icon: ChartLine },
];

/** Ítems que abre "Más" en el teléfono por rol (4.28) */
export const MOBILE_MORE_BY_ROLE: Record<Role, readonly NavItem[]> = {
  student: [
    { path: screenPath('outlines'), label: t.navItems.outlines, icon: NotebookPen },
    { path: screenPath('tutor'), label: t.navItems.tutor, icon: GraduationCap },
    { path: screenPath('party'), label: t.navItems.party, icon: PartyPopper },
    settingsItem,
  ],
  physician: [
    bank,
    { path: screenPath('agreement'), label: t.navItems.agreement, icon: Scale },
    { path: screenPath('aiDrafts'), label: t.navItems.drafts, icon: FileText },
    { path: screenPath('contentReports'), label: t.navItems.reports, icon: Flag },
    settingsItem,
  ],
  admin: [
    { path: screenPath('outlines'), label: t.navItems.outlines, icon: NotebookPen },
    { path: screenPath('tutor'), label: t.navItems.tutor, icon: GraduationCap },
    { path: screenPath('party'), label: t.navItems.party, icon: PartyPopper },
    settingsItem,
    ...adminGroup,
  ],
  owner: [
    { path: screenPath('outlines'), label: t.navItems.outlines, icon: NotebookPen },
    { path: screenPath('tutor'), label: t.navItems.tutor, icon: GraduationCap },
    { path: screenPath('party'), label: t.navItems.party, icon: PartyPopper },
    settingsItem,
    ...adminGroup,
  ],
};

/** Accesos de administración para el teléfono */
export const ADMIN_LINKS: readonly NavItem[] = adminGroup;

/** Pantalla de entrada de cada rol */
export const HOME_BY_ROLE: Record<Role, string> = {
  student: screenPath('home'),
  physician: screenPath('questionBank'),
  admin: screenPath('home'),
  owner: screenPath('home'),
};
