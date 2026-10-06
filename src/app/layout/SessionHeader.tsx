import type { ReactNode } from 'react';
import { t } from '@/i18n/es-MX';

interface SessionHeaderProps {
  title: string;
  /** Avance y tiempo de la sesión, en una sola línea junto al título */
  meta?: ReactNode;
  /** Etiquetas obligatorias, como contenido de demostración o datos simulados */
  badges?: ReactNode;
  /** Controles a la derecha, como cambiar de tema o el Pomodoro */
  actions?: ReactNode;
}

/**
 * Encabezado del modo enfoque (D-078). Durante una sesión no hay racha, nivel ni descripción,
 * solo el título, el avance y las acciones, para que el caso clínico quede arriba
 */
export function SessionHeader({ title, meta, badges, actions }: SessionHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <title>{t.app.documentTitle(title)}</title>
      <h1 tabIndex={-1} className="text-lg font-extrabold text-fg outline-none sm:text-xl">
        {title}
      </h1>
      {meta ? (
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-fg-muted">{meta}</div>
      ) : null}
      {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
