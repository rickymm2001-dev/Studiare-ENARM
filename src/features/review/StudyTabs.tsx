// Pestañas de Repasar y Mazos (D-087). Son una sola sección de la navegación y el alumno pasa de
// elegir qué repasar a administrar sus mazos sin buscar otra sección. Cada pestaña es su propia
// ruta, así los enlaces de siempre a Mazos siguen funcionando.
import { Link, useLocation } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

const TABS = [
  { key: 'review', path: screenPath('review'), label: t.studyTabs.review },
  { key: 'decks', path: screenPath('decks'), label: t.studyTabs.decks },
] as const;

export function StudyTabs() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={t.studyTabs.label}
      className="flex w-fit gap-1 rounded-full bg-muted p-1 text-sm font-semibold"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.path;
        return (
          <Link
            key={tab.key}
            to={tab.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-9 items-center rounded-full px-4 text-fg-muted transition-colors hover:text-fg',
              active && 'bg-surface text-fg shadow-card',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
