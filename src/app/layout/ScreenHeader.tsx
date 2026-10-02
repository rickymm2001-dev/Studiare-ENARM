import type { ReactNode } from 'react';
import { t } from '@/i18n/es-MX';

interface ScreenHeaderProps {
  title: string;
  description?: string;
  badges?: ReactNode;
  /** Controles a la derecha del título, a su misma altura */
  actions?: ReactNode;
}

/** Título de pantalla. El h1 recibe el foco al navegar y el título de la pestaña se actualiza */
export function ScreenHeader({ title, description, badges, actions }: ScreenHeaderProps) {
  return (
    <header className="animate-rise flex flex-col gap-2">
      <title>{t.app.documentTitle(title)}</title>
      {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      <div className="flex items-center justify-between gap-3">
        <h1 tabIndex={-1} className="text-3xl font-extrabold text-fg outline-none sm:text-4xl">
          {title}
        </h1>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {description ? <p className="max-w-reading text-fg-muted">{description}</p> : null}
    </header>
  );
}
