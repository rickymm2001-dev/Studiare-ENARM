// Menú en línea de la barra superior de computadora (D-150). Las primeras secciones van como enlaces
// con el subrayado cielo en la activa, como la barra de la portada, y las demás, los grupos de
// administración y Configuración se abren desde Más. En el teléfono no se ve, ahí va el dock de abajo
// (BottomNav.tsx).
import { ChevronDown } from 'lucide-react';
import { useLocation } from 'react-router';
import { Link } from 'react-router';
import { navAnchorOfPath } from '@/features/tour/anchors';
import { t } from '@/i18n/core';
import { cn } from '@/ui/cn';
import {
  isNavItemActive,
  isTopMoreActive,
  topBarItems,
  topMoreSections,
  type RoleNav,
} from '../navigation';
import { MoreSheet } from './MoreSheet';

export const TOP_NAV_ID = 'menu-superior';

const link =
  'inline-flex min-h-touch items-center border-b-2 border-transparent px-0.5 text-sm text-slate-fg transition-colors hover:border-indicator';

export function TopNav({ nav }: { nav: RoleNav }) {
  const { pathname } = useLocation();
  const more = topMoreSections(nav);
  const moreActive = isTopMoreActive(nav, pathname);
  return (
    <nav
      id={TOP_NAV_ID}
      aria-label={t.nav.label}
      className="ml-auto hidden items-center gap-5 lg:flex xl:gap-6"
    >
      {topBarItems(nav).map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-current={active ? 'page' : undefined}
            data-tour={navAnchorOfPath(item.path)}
            className={cn(link, active && 'border-indicator font-semibold')}
          >
            {item.label}
          </Link>
        );
      })}
      {more.length > 0 ? (
        <MoreSheet
          sections={more}
          active={moreActive}
          placement="desk"
          triggerClassName={cn(link, 'gap-1', moreActive && 'border-indicator font-semibold')}
          trigger={
            <>
              {t.navItems.more}
              <ChevronDown aria-hidden className="size-4" />
            </>
          }
        />
      ) : null}
    </nav>
  );
}
