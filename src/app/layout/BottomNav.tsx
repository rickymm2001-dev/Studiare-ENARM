// Dock de abajo en el teléfono, con los mismos datos de navigation.ts. Va en pizarra con la sección
// activa en una píldora cielo, como el diseño de D-150. Lleva las secciones marcadas para la barra y
// Más, que abre una hoja con las demás (4.28). En computadora no se ve, ahí el menú va en línea en la
// barra superior (TopNav.tsx).
import { Ellipsis, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { navAnchorOfPath } from '@/features/tour/anchors';
import { t } from '@/i18n/core';
import { cn } from '@/ui/cn';
import {
  isMoreActive,
  isNavItemActive,
  moreSections,
  phoneBarItems,
  type NavItem,
  type RoleNav,
} from '../navigation';
import { MoreSheet } from './MoreSheet';

/** Para que el marco diga qué controla la navegación */
export const NAV_ID = 'menu-principal';

function itemClass(active: boolean) {
  return cn(
    'flex min-h-nav flex-col items-center justify-center gap-1 px-1 text-xs font-semibold text-slate-muted',
    'hover:text-slate-fg',
    active && 'text-slate-fg',
  );
}

function ItemIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-7 w-11 items-center justify-center rounded-full transition-colors [&_svg]:size-5',
        active && 'bg-indicator text-white',
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  );
}

function DockLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavItemActive(item, pathname);
  return (
    <Link
      to={item.path}
      aria-current={active ? 'page' : undefined}
      // El ancla del recorrido guiado (B15, 4.3)
      data-tour={navAnchorOfPath(item.path)}
      className={itemClass(active)}
    >
      <ItemIcon icon={item.icon} active={active} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function BottomNav({ nav }: { nav: RoleNav }) {
  const { pathname } = useLocation();
  const more = moreSections(nav);
  const items = phoneBarItems(nav);
  const columns = items.length + (more.length > 0 ? 1 : 0);
  const moreActive = isMoreActive(nav, pathname);
  return (
    <nav
      id={NAV_ID}
      aria-label={t.nav.label}
      // El cristal toma la pizarra como superficie, igual que la barra de arriba
      className="glass fixed inset-x-0 bottom-0 z-20 [--enarm-surface:var(--enarm-slate)] pb-[env(safe-area-inset-bottom)] text-slate-fg shadow-nav lg:hidden"
    >
      <ul
        className="grid px-1.5 pt-1"
        style={{ gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <li key={item.path}>
            <DockLink item={item} pathname={pathname} />
          </li>
        ))}
        {more.length > 0 ? (
          <li>
            <MoreSheet
              sections={more}
              active={moreActive}
              placement="phone"
              triggerClassName={cn(itemClass(moreActive), 'w-full')}
              trigger={
                <>
                  <ItemIcon icon={Ellipsis} active={moreActive} />
                  <span className="truncate">{t.navItems.more}</span>
                </>
              }
            />
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
