import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
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

/**
 * Título de pantalla. El h1 recibe el foco al navegar y el título de la pestaña se actualiza. La
 * explicación de la pantalla se lee una vez, así que queda tras un ícono de información (D-078)
 */
export function ScreenHeader({
  title,
  description,
  badges,
  actions,
  stats = true,
}: ScreenHeaderProps) {
  const [showInfo, setShowInfo] = useState(false);
  const infoId = useId();
  return (
    <header className="animate-rise flex flex-col gap-1.5">
      <title>{t.app.documentTitle(title)}</title>
      {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 sm:gap-x-3">
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          <h1 tabIndex={-1} className="text-xl font-extrabold text-fg outline-none sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <button
              type="button"
              aria-expanded={showInfo}
              aria-controls={infoId}
              aria-label={t.app.aboutScreen(title)}
              onClick={() => {
                setShowInfo((value) => !value);
              }}
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg [&_svg]:size-[1.125rem]',
                showInfo && 'bg-muted text-fg',
              )}
            >
              <Info aria-hidden />
            </button>
          ) : null}
        </div>
        {/* En el teléfono la acción baja a su propia línea para no salirse de la pantalla */}
        <div className="ml-auto flex min-w-0 flex-wrap-reverse items-center justify-end gap-2">
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          {stats ? <HeaderStats /> : null}
        </div>
      </div>
      {description ? (
        <p id={infoId} hidden={!showInfo} className="text-sm text-fg-muted sm:text-base">
          {description}
        </p>
      ) : null}
    </header>
  );
}
