import type { ReactNode } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { TOP_BAR_SLOT, useInTopBar } from './TopBarContext';

interface SessionHeaderProps {
  title: string;
  /** Avance y tiempo de la sesión, en una sola línea junto al título */
  meta?: ReactNode;
  /** Controles a la derecha, como cambiar de tema o el Pomodoro */
  actions?: ReactNode;
}

/**
 * Encabezado del modo enfoque (D-078). Durante una sesión no hay racha, nivel ni descripción,
 * solo el título, el avance y las acciones, para que el caso clínico quede arriba
 */
export function SessionHeader({ title, meta, actions }: SessionHeaderProps) {
  // Dentro del marco va en la barra blanca de arriba, igual que ScreenHeader (D-117)
  const inBar = useInTopBar();
  return (
    <header className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', inBar && TOP_BAR_SLOT)}>
      <title>{t.app.documentTitle(title)}</title>
      <h1 tabIndex={-1} className="screen-title shrink-0 text-fg outline-none">
        {title}
      </h1>
      {meta ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 text-sm text-fg-muted">
          {meta}
        </div>
      ) : null}
      {actions ? (
        <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-nowrap">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
