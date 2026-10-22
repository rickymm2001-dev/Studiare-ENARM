// Navegación de abajo en el teléfono y riel lateral en computadora, con los mismos datos de
// navigation.ts. En computadora el riel empieza bajo la barra superior, se oculta con el botón del
// menú (D-117) y lleva Configuración fija abajo a la izquierda, separada del resto (comentario 3). En
// el teléfono la barra lleva las secciones marcadas para ella y Más, que abre una hoja con las demás
// (4.28). La hoja es un diálogo de Radix, así que atrapa el foco, se cierra con Escape y se nombra
// con su título.
import { Ellipsis, X, type LucideIcon } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { NAV_MORE_ANCHOR, navAnchorOfPath } from '@/features/tour/anchors';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import {
  isMoreActive,
  isNavItemActive,
  moreSections,
  phoneBarItems,
  type MoreSection,
  type NavItem,
  type RoleNav,
} from '../navigation';

/** Para que el botón del menú diga qué controla */
export const NAV_ID = 'menu-lateral';

/** Desde este ancho se ve el riel y no la barra de abajo. Es el lg de Tailwind */
const RAIL_QUERY = '(min-width: 64rem)';

function itemClass(active: boolean) {
  return cn(
    'flex min-h-nav flex-col items-center justify-center gap-1 px-1 text-xs font-medium text-fg-muted',
    'hover:text-fg lg:mx-2 lg:min-h-14 lg:rounded-md',
    active && 'font-semibold text-primary-ink',
  );
}

function ItemIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-8 w-14 items-center justify-center rounded-md transition-colors [&_svg]:size-5',
        active && 'bg-primary-soft text-primary-ink',
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  );
}

function RailLink({ item, pathname }: { item: NavItem; pathname: string }) {
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

export function BottomNav({
  nav,
  collapsed = false,
}: {
  nav: RoleNav;
  /** Solo en computadora. En el teléfono la navegación de abajo siempre está */
  collapsed?: boolean;
}) {
  const { pathname } = useLocation();
  const more = moreSections(nav);
  const columns = phoneBarItems(nav).length + (more.length > 0 ? 1 : 0);
  return (
    <nav
      id={NAV_ID}
      aria-label={t.nav.label}
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 border-t border-line/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-nav backdrop-blur-md',
        'lg:top-topbar lg:right-auto lg:bottom-0 lg:left-0 lg:flex lg:w-rail lg:flex-col lg:border-t-0 lg:border-r lg:bg-surface lg:pb-0 lg:shadow-none lg:backdrop-blur-none',
        collapsed && 'lg:hidden',
      )}
    >
      {/* Las secciones de arriba. Si no caben en la pantalla se desplazan y Configuración sigue a
          la vista abajo */}
      <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-2 lg:overflow-y-auto lg:py-3">
        <ul
          className="grid lg:flex lg:flex-col lg:gap-1"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {nav.main.map((item) => (
            <li key={item.path} className={cn(item.bar !== true && 'hidden lg:block')}>
              <RailLink item={item} pathname={pathname} />
            </li>
          ))}
          {more.length > 0 ? (
            <li className="lg:hidden">
              <MoreSheet sections={more} active={isMoreActive(nav, pathname)} pathname={pathname} />
            </li>
          ) : null}
        </ul>
        {nav.groups.map((group) => (
          <div key={group.label} className="hidden lg:flex lg:flex-col lg:gap-2">
            <div aria-hidden className="lg:mx-3 lg:border-t lg:border-line" />
            <ul aria-label={group.label} className="lg:flex lg:flex-col lg:gap-1">
              {group.items.map((item) => (
                <li key={item.path}>
                  <RailLink item={item} pathname={pathname} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* Configuración, fija abajo a la izquierda y separada con una línea (comentario 3) */}
      <ul className="hidden lg:flex lg:shrink-0 lg:flex-col lg:gap-1 lg:border-t lg:border-line lg:py-3">
        {nav.pinned.map((item) => (
          <li key={item.path}>
            <RailLink item={item} pathname={pathname} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Más, en la barra del teléfono. Abre una hoja desde abajo con lo que no cabe en la barra. Queda
 * marcada cuando la pantalla abierta es una de las suyas
 */
function MoreSheet({
  sections,
  active,
  pathname,
}: {
  sections: readonly MoreSection[];
  active: boolean;
  pathname: string;
}) {
  // La hoja recuerda en qué pantalla se abrió. Si la pantalla cambia, por ejemplo con el botón de
  // atrás, ya no está abierta
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  // La pantalla que se eligió en la hoja. Se navega cuando la hoja ya se cerró y el foco volvió a Más.
  // Si la pantalla nueva abre, el marco lleva el foco a su título (4.8). Si el aviso de cambios sin
  // guardar detiene el cambio y el alumno sigue editando, el foco vuelve a Más y no se pierde
  const target = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const id = useId();

  // La hoja es del teléfono. Si la ventana se ensancha hasta el riel, se cierra
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(RAIL_QUERY);
    const closeOnRail = (event: MediaQueryListEvent) => {
      if (event.matches) setOpenedAt(null);
    };
    query.addEventListener('change', closeOnRail);
    return () => {
      query.removeEventListener('change', closeOnRail);
    };
  }, [open]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpenedAt(next ? pathname : null);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-current={active ? 'true' : undefined}
          data-tour={NAV_MORE_ANCHOR}
          className={cn(itemClass(active), 'w-full')}
        >
          <ItemIcon icon={Ellipsis} active={active} />
          <span className="truncate">{t.navItems.more}</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const next = target.current;
            if (next === null) return;
            target.current = null;
            event.preventDefault();
            trigger.current?.focus();
            void navigate(next);
          }}
          className="animate-rise fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-3 overflow-y-auto rounded-t-xl border-t border-line bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-raised lg:hidden"
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold text-fg">{t.nav.more}</Dialog.Title>
            <Dialog.Close
              aria-label={t.nav.closeMore}
              className="flex size-touch shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-muted hover:text-fg"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          {sections.map((section, index) => {
            const labelId = `${id}-${String(index)}`;
            return (
              <div
                key={section.label ?? index}
                className={cn('flex flex-col gap-1', index > 0 && 'border-t border-line pt-3')}
              >
                {section.label ? (
                  <p id={labelId} className="eyebrow px-3">
                    {section.label}
                  </p>
                ) : null}
                <ul
                  aria-labelledby={section.label ? labelId : undefined}
                  className="flex flex-col gap-1"
                >
                  {section.items.map((item) => {
                    const current = isNavItemActive(item, pathname);
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          aria-current={current ? 'page' : undefined}
                          onClick={(event) => {
                            // Con una tecla especial el navegador la abre en otra pestaña o ventana
                            if (
                              event.button !== 0 ||
                              event.metaKey ||
                              event.altKey ||
                              event.ctrlKey ||
                              event.shiftKey
                            ) {
                              return;
                            }
                            event.preventDefault();
                            target.current = item.path === pathname ? null : item.path;
                            setOpenedAt(null);
                          }}
                          className={cn(
                            'flex min-h-12 items-center gap-3 rounded-md px-3 font-medium text-fg hover:bg-muted',
                            current && 'bg-primary-soft font-semibold text-primary-ink',
                          )}
                        >
                          <item.icon aria-hidden strokeWidth={2} className="size-5 shrink-0" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
