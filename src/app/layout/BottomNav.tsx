// Navegación inferior en teléfono y riel lateral en pantallas anchas, con las mismas secciones.
import { Link, NavLink } from 'react-router';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import type { NavItem } from '../navigation';

export function BottomNav({ items, homePath }: { items: readonly NavItem[]; homePath: string }) {
  const mobileCount = items.filter((item) => !item.railOnly).length;
  return (
    <nav
      aria-label={t.nav.label}
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 border-t border-line/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-nav backdrop-blur-md',
        'lg:inset-y-0 lg:right-auto lg:left-0 lg:w-rail lg:border-t-0 lg:border-r lg:pt-3 lg:pb-0 lg:shadow-none',
      )}
    >
      {/* Símbolo de Studiare arriba del riel en computadora (D-071) */}
      <Link
        to={homePath}
        aria-label={t.app.logoAlt}
        className="mx-auto mb-3 hidden size-12 items-center justify-center rounded-xl lg:flex"
      >
        <img src={`${import.meta.env.BASE_URL}favicon-64x64.png`} alt="" className="size-9" />
      </Link>
      <ul
        className="grid lg:flex lg:flex-col lg:gap-1"
        style={{ gridTemplateColumns: `repeat(${mobileCount}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <li key={item.path} className={item.railOnly ? 'hidden lg:block' : undefined}>
            <NavLink
              to={item.path}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  'flex min-h-nav flex-col items-center justify-center gap-1 px-1 text-xs font-medium text-fg-muted',
                  'hover:text-fg lg:min-h-14 lg:rounded-md lg:mx-2',
                  isActive && 'text-primary font-semibold',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-8 w-14 items-center justify-center rounded-full transition-all [&_svg]:size-5',
                      isActive && 'bg-primary text-primary-fg shadow-raised',
                    )}
                  >
                    <item.icon strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
