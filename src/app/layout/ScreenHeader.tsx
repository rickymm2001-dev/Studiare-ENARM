import type { ReactNode } from 'react';
import { t } from '@/i18n/es-MX';
import { HeaderStats } from './HeaderStats';

interface ScreenHeaderProps {
  title: string;
  description?: string;
  badges?: ReactNode;
  /** Controles a la derecha del título, a su misma altura */
  actions?: ReactNode;
  /** Racha, nivel y foto a la derecha del título. true por defecto (D-071) */
  stats?: boolean;
}

/** Título de pantalla. El h1 recibe el foco al navegar y el título de la pestaña se actualiza */
export function ScreenHeader({
  title,
  description,
  badges,
  actions,
  stats = true,
}: ScreenHeaderProps) {
  return (
    <header className="animate-rise flex flex-col gap-1.5">
      <title>{t.app.documentTitle(title)}</title>
      {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 tabIndex={-1} className="text-2xl font-extrabold text-fg outline-none sm:text-3xl">
          {title}
        </h1>
        {/* En el teléfono la acción baja a su propia línea para no salirse de la pantalla */}
        <div className="ml-auto flex min-w-0 flex-wrap-reverse items-center justify-end gap-2">
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          {stats ? <HeaderStats /> : null}
        </div>
      </div>
      {description ? <p className="text-sm text-fg-muted sm:text-base">{description}</p> : null}
    </header>
  );
}
