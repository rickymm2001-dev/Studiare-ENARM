// Secciones de la navegación inferior (10.4). El alumno tiene las 5 de la especificación.
// Médico y admin tienen las suyas, porque sus pantallas son otras (10.2 y 10.3).
import {
  BookOpenCheck,
  ChartLine,
  ClipboardList,
  Coins,
  Database,
  FileText,
  Flag,
  FlaskConical,
  House,
  Scale,
  Settings,
  UserRound,
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
}

const profile: NavItem = {
  path: screenPath('profile'),
  label: t.navItems.profile,
  icon: UserRound,
};
const bank: NavItem = { path: screenPath('questionBank'), label: t.navItems.bank, icon: Database };

export const NAV_BY_ROLE: Record<Role, readonly NavItem[]> = {
  student: [
    { path: screenPath('home'), label: t.navItems.home, icon: House, end: true },
    { path: screenPath('review'), label: t.navItems.review, icon: BookOpenCheck },
    { path: screenPath('simulatorSetup'), label: t.navItems.simulate, icon: ClipboardList },
    { path: screenPath('progress'), label: t.navItems.progress, icon: ChartLine },
    profile,
  ],
  physician: [
    bank,
    { path: screenPath('agreement'), label: t.navItems.agreement, icon: Scale },
    { path: screenPath('aiDrafts'), label: t.navItems.drafts, icon: FileText },
    { path: screenPath('contentReports'), label: t.navItems.reports, icon: Flag },
    profile,
  ],
  admin: [
    { path: screenPath('aiCosts'), label: t.navItems.costs, icon: Coins },
    { path: screenPath('demoData'), label: t.navItems.demo, icon: FlaskConical },
    { path: screenPath('adminSettings'), label: t.navItems.settings, icon: Settings },
    bank,
    profile,
  ],
};

/** Pantalla de entrada de cada rol */
export const HOME_BY_ROLE: Record<Role, string> = {
  student: screenPath('home'),
  physician: screenPath('questionBank'),
  admin: screenPath('aiCosts'),
};
