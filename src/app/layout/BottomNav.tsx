// Navegación en teléfono y computadora (D-119 B3).
// Computadora: Menú lateral con Inicio, Repasar, Apuntes, Simular, Progreso, Tutor, Party arriba.
// Abajo a la izquierda, fija y separada: Configuración con ícono de engrane (Settings).
// Teléfono: Barra inferior con Inicio, Repasar, Simular, Progreso y Más (abre Apuntes, Tutor, Party, Configuración).
import { Ellipsis, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Dialog } from 'radix-ui';
import { usePreferences } from '@/app/preferences';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import {
  MOBILE_MORE_BY_ROLE,
  MOBILE_PRIMARY_NAV,
  settingsItem,
  type NavItem,
} from '../navigation';

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

export function BottomNav({
  items,
  collapsed = false,
}: {
  items: readonly NavItem[];
  /** Solo en computadora. En el teléfono la navegación inferior siempre está */
  collapsed?: boolean;
}) {
  const { pathname } = useLocation();
  const role = usePreferences((state) => state.role);
  const [moreOpen, setMoreOpen] = useState(false);

  const topItems = items.filter((item) => !item.bottom);
  const bottomItem = items.find((item) => item.bottom) ?? settingsItem;

  const mobilePrimary =
    role === 'physician'
      ? items.filter((item) => !item.bottom).slice(0, 4)
      : MOBILE_PRIMARY_NAV;
  const moreItems = MOBILE_MORE_BY_ROLE[role] ?? [];
  const isMoreActive = moreItems.some((item) => isActive(item, pathname));

  return (
    <>
      <nav
        id={NAV_ID}
        aria-label={t.nav.label}
        className={cn(
          'fixed inset-x-0 bottom-0 z-20 border-t border-line/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-nav backdrop-blur-md',
          'lg:top-topbar lg:right-auto lg:bottom-0 lg:left-0 lg:w-rail lg:flex lg:flex-col lg:justify-between lg:overflow-y-auto lg:border-t-0 lg:border-r lg:bg-surface lg:pt-3 lg:pb-3 lg:shadow-none lg:backdrop-blur-none',
          collapsed && 'lg:hidden',
        )}
      >
        {/* En computadora: riel vertical con ítems principales arriba y Configuración fija abajo */}
        <div className="hidden lg:flex lg:h-full lg:flex-col lg:justify-between">
          <ul className="flex flex-col gap-1">
            {topItems.map((item) => (
              <li
                key={item.path}
                className={cn(
                  item.groupStart && 'mx-3 mt-2 border-t border-line pt-2',
                )}
              >
                <Link
                  to={item.path}
                  aria-current={isActive(item, pathname) ? 'page' : undefined}
                  className={cn(
                    'mx-2 flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-fg-muted transition-colors hover:text-fg',
                    isActive(item, pathname) && 'font-semibold text-primary-ink',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-8 w-14 items-center justify-center rounded-md transition-colors [&_svg]:size-5',
                      isActive(item, pathname) && 'bg-primary-soft text-primary-ink',
                    )}
                  >
                    <item.icon strokeWidth={2} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>

          {bottomItem ? (
            <div className="mt-auto border-t border-line pt-2">
              <Link
                to={bottomItem.path}
                aria-current={isActive(bottomItem, pathname) ? 'page' : undefined}
                className={cn(
                  'mx-2 flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-fg-muted transition-colors hover:text-fg',
                  isActive(bottomItem, pathname) && 'font-semibold text-primary-ink',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-8 w-14 items-center justify-center rounded-md transition-colors [&_svg]:size-5',
                    isActive(bottomItem, pathname) && 'bg-primary-soft text-primary-ink',
                  )}
                >
                  <bottomItem.icon strokeWidth={2} />
                </span>
                <span className="truncate">{bottomItem.label}</span>
              </Link>
            </div>
          ) : null}
        </div>

        {/* En el teléfono: exactamente 5 casillas (4 principales + Más) */}
        <ul className="grid grid-cols-5 lg:hidden">
          {mobilePrimary.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                aria-current={isActive(item, pathname) ? 'page' : undefined}
                className={cn(
                  'flex min-h-nav flex-col items-center justify-center gap-1 px-1 text-xs font-medium text-fg-muted hover:text-fg',
                  isActive(item, pathname) && 'font-semibold text-primary-ink',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-8 w-14 items-center justify-center rounded-md transition-colors [&_svg]:size-5',
                    isActive(item, pathname) && 'bg-primary-soft text-primary-ink',
                  )}
                >
                  <item.icon strokeWidth={2} />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          ))}

          {/* Quinta casilla: Más */}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-current={isMoreActive ? 'page' : undefined}
              aria-expanded={moreOpen}
              className={cn(
                'flex w-full min-h-nav flex-col items-center justify-center gap-1 px-1 text-xs font-medium text-fg-muted hover:text-fg',
                isMoreActive && 'font-semibold text-primary-ink',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-8 w-14 items-center justify-center rounded-md transition-colors [&_svg]:size-5',
                  isMoreActive && 'bg-primary-soft text-primary-ink',
                )}
              >
                <Ellipsis strokeWidth={2} />
              </span>
              <span className="truncate">{t.navItems.more ?? 'Más'}</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* Diálogo "Más" en el teléfono */}
      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-raised outline-none lg:hidden">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <Dialog.Title className="text-base font-bold text-fg">
                {t.nav.more}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Cerrar"
                className="flex size-touch items-center justify-center rounded-full hover:bg-muted"
              >
                <X aria-hidden className="size-5" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              {t.nav.more}
            </Dialog.Description>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {moreItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  aria-current={isActive(item, pathname) ? 'page' : undefined}
                  className={cn(
                    'flex min-h-12 items-center gap-2.5 rounded-lg border border-line p-3 text-sm font-medium transition-colors hover:bg-muted',
                    isActive(item, pathname) &&
                      'border-indicator bg-primary-soft font-semibold text-primary-ink',
                  )}
                >
                  <item.icon className="size-5 shrink-0" strokeWidth={2} />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
