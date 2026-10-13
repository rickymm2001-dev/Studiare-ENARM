// Pestañas de Repasar, Mazos, Explorar y Apuntes (D-087, D-085, D-092). Son una sola sección de la navegación y el alumno pasa de
// elegir qué repasar a administrar sus mazos sin buscar otra sección. Cada pestaña es su propia
// ruta, así los enlaces de siempre a Mazos siguen funcionando. Toman la forma de las pestañas de
// toda la app (H01 de la revisión de diseño de B2) y siguen siendo enlaces con aria-current.
import { Link, useLocation } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { segmentedItem, segmentedList } from '@/ui/components/segmented-classes';

const TABS = [
  { key: 'review', path: screenPath('review'), label: t.studyTabs.review },
  { key: 'decks', path: screenPath('decks'), label: t.studyTabs.decks },
  { key: 'explore', path: screenPath('explore'), label: t.studyTabs.explore },
] as const;

export function StudyTabs() {
  const { pathname } = useLocation();
  return (
    <nav aria-label={t.studyTabs.label} className={cn(segmentedList, 'w-fit')}>
      {TABS.map((tab) => {
        const active = pathname === tab.path;
        return (
          <Link
            key={tab.key}
            to={tab.path}
            aria-current={active ? 'page' : undefined}
            className={segmentedItem(active)}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
