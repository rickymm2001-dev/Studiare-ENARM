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
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {stats ? <HeaderStats /> : null}
        </div>
      </div>
      {description ? <p className="text-sm text-fg-muted sm:text-base">{description}</p> : null}
    </header>
  );
}
