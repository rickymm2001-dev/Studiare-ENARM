// Secciones de la navegación inferior (10.4). El alumno tiene las 5 de la especificación.
// Médico tiene las suyas (10.2). Administrador y dueño también estudian, así que ven lo del alumno
// y abajo, en el riel, su grupo de administración (D-076).
import {
  BookOpenCheck,
  CalendarDays,
  ChartLine,
  ClipboardList,
  Coins,
  Database,
  FileText,
  Flag,
  GraduationCap,
  PartyPopper,
  House,
  Scale,
  Settings,
  SlidersHorizontal,
  UserRound,
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
  /** Solo en el riel de computadora. En el teléfono se llega desde Perfil (D-071) */
  railOnly?: boolean;
  /** Abre un grupo nuevo en el riel con una línea divisoria */
  groupStart?: boolean;
  /** Otras rutas que también dejan activa esta sección, como Mazos dentro de Repasar (D-087) */
  alsoActive?: readonly string[];
}

const profile: NavItem = {
  path: screenPath('profile'),
  label: t.navItems.profile,
  icon: UserRound,
};
const settingsItem: NavItem = {
  path: screenPath('settings'),
  label: t.navItems.settings,
  icon: SlidersHorizontal,
  railOnly: true,
};
const bank: NavItem = { path: screenPath('questionBank'), label: t.navItems.bank, icon: Database };

const studentNav: readonly NavItem[] = [
  { path: screenPath('home'), label: t.navItems.home, icon: House, end: true },
  // Repasar y Mazos son una sola sección con dos pestañas (D-087)
  {
    path: screenPath('review'),
    label: t.navItems.review,
    icon: BookOpenCheck,
    alsoActive: [screenPath('decks'), screenPath('explore')],
  },
  { path: screenPath('simulatorSetup'), label: t.navItems.simulate, icon: ClipboardList },
  { path: screenPath('progress'), label: t.navItems.progress, icon: ChartLine },
  { path: screenPath('planner'), label: t.navItems.planner, icon: CalendarDays, railOnly: true },
  { path: screenPath('tutor'), label: t.navItems.tutor, icon: GraduationCap, railOnly: true },
  { path: screenPath('party'), label: t.navItems.party, icon: PartyPopper, railOnly: true },
  profile,
  settingsItem,
];

const adminGroup: readonly NavItem[] = [
  { path: screenPath('adminUsers'), label: t.navItems.users, icon: Users, groupStart: true },
  { path: screenPath('aiCosts'), label: t.navItems.costs, icon: Coins },
  { path: screenPath('adminSettings'), label: t.navItems.platform, icon: Settings },
  bank,
].map((item) => ({ ...item, railOnly: true }));

const adminNav: readonly NavItem[] = [...studentNav, ...adminGroup];

export const NAV_BY_ROLE: Record<Role, readonly NavItem[]> = {
  student: studentNav,
  physician: [
    bank,
    { path: screenPath('agreement'), label: t.navItems.agreement, icon: Scale },
    { path: screenPath('aiDrafts'), label: t.navItems.drafts, icon: FileText },
    { path: screenPath('contentReports'), label: t.navItems.reports, icon: Flag },
    profile,
    settingsItem,
  ],
  admin: adminNav,
  owner: adminNav,
};

/** Accesos de administración para el teléfono, donde no caben en la barra inferior */
export const ADMIN_LINKS: readonly NavItem[] = adminGroup;

/** Pantalla de entrada de cada rol */
export const HOME_BY_ROLE: Record<Role, string> = {
  student: screenPath('home'),
  physician: screenPath('questionBank'),
  admin: screenPath('home'),
  owner: screenPath('home'),
};
