// Más. En el teléfono abre una hoja desde abajo con lo que no cabe en la barra (4.28) y en
// computadora un panel bajo la barra superior con lo que no cabe en línea (D-150). Es un diálogo de
// Radix, así que atrapa el foco, se cierra con Escape y se nombra con su título. Queda marcado cuando
// la pantalla abierta es una de las suyas.
import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { NAV_MORE_ANCHOR, NAV_TOP_MORE_ANCHOR } from '@/features/tour/anchors';
import { t } from '@/i18n/core';
import { cn } from '@/ui/cn';
import { isNavItemActive, type MoreSection } from '../navigation';

/** Desde este ancho se ve la barra superior en línea y no el dock del teléfono. Es el lg de Tailwind */
export const TOP_NAV_QUERY = '(min-width: 64rem)';

export function MoreSheet({
  sections,
  active,
  placement,
  trigger,
  triggerClassName,
}: {
  sections: readonly MoreSection[];
  active: boolean;
  /** phone es la hoja de abajo del teléfono y desk el panel bajo la barra de computadora */
  placement: 'phone' | 'desk';
  /** Lo que va dentro del botón que abre la hoja */
  trigger: ReactNode;
  triggerClassName: string;
}) {
  const { pathname } = useLocation();
  // La hoja recuerda en qué pantalla se abrió. Si la pantalla cambia, por ejemplo con el botón de
  // atrás, ya no está abierta
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  // La pantalla que se eligió en la hoja. Se navega cuando la hoja ya se cerró y el foco volvió a Más.
  // Si la pantalla nueva abre, el marco lleva el foco a su título (4.8). Si el aviso de cambios sin
  // guardar detiene el cambio y el alumno sigue editando, el foco vuelve a Más y no se pierde
  const target = useRef<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const id = useId();

  // Cada hoja es de un ancho. Si la ventana cruza el ancho de la barra en línea, se cierra
  useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(TOP_NAV_QUERY);
    const closeOnCross = (event: MediaQueryListEvent) => {
      if (event.matches === (placement === 'phone')) setOpenedAt(null);
    };
    query.addEventListener('change', closeOnCross);
    return () => {
      query.removeEventListener('change', closeOnCross);
    };
  }, [open, placement]);

  const phone = placement === 'phone';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpenedAt(next ? pathname : null);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-current={active ? 'true' : undefined}
          data-tour={phone ? NAV_MORE_ANCHOR : NAV_TOP_MORE_ANCHOR}
          className={triggerClassName}
        >
          {trigger}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm',
            phone ? 'lg:hidden' : 'max-lg:hidden',
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const next = target.current;
            if (next === null) return;
            target.current = null;
            event.preventDefault();
            triggerRef.current?.focus();
            void navigate(next);
          }}
          className={cn(
            'animate-rise fixed z-50 flex flex-col gap-3 overflow-y-auto border-line bg-surface px-4 pt-3 shadow-raised',
            phone
              ? 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:hidden'
              : 'top-[calc(var(--spacing-topbar)+0.5rem)] right-5 w-80 max-w-[calc(100vw-2.5rem)] rounded-lg border pb-4 max-lg:hidden',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-bold text-fg">{t.nav.more}</Dialog.Title>
            <Dialog.Close
              aria-label={t.nav.closeMore}
              className="flex size-touch shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
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
