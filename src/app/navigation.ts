// Secciones de la navegación inferior (10.4). Alumno tiene las 5 de la especificación.
import {
  BookOpenCheck,
  ClipboardList,
  House,
  ChartLine,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { screenPath } from './screens';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Solo marca activa la ruta exacta, para que Inicio no quede activo en todas */
  end?: boolean;
}

export const STUDENT_NAV: readonly NavItem[] = [
  { path: screenPath('home'), label: t.navItems.home, icon: House, end: true },
  { path: screenPath('review'), label: t.navItems.review, icon: BookOpenCheck },
  { path: screenPath('simulatorSetup'), label: t.navItems.simulate, icon: ClipboardList },
  { path: screenPath('progress'), label: t.navItems.progress, icon: ChartLine },
  { path: screenPath('profile'), label: t.navItems.profile, icon: UserRound },
];
