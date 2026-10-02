import type { ReactNode } from 'react';
import { t } from '@/i18n/es-MX';

interface ScreenHeaderProps {
  title: string;
  description?: string;
  badges?: ReactNode;
}

/** Título de pantalla. El h1 recibe el foco al navegar y el título de la pestaña se actualiza */
export function ScreenHeader({ title, description, badges }: ScreenHeaderProps) {
  return (
    <header className="flex flex-col gap-2">
      <title>{t.app.documentTitle(title)}</title>
      {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      <h1 tabIndex={-1} className="text-2xl font-bold text-fg outline-none sm:text-3xl">
        {title}
      </h1>
      {description ? <p className="max-w-reading text-fg-muted">{description}</p> : null}
    </header>
  );
}
