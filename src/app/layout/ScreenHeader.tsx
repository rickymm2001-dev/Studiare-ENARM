import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { HeaderStats } from './HeaderStats';
import { TOP_BAR_SLOT, useInTopBar } from './TopBarContext';

interface ScreenHeaderProps {
  title: string;
  /** Título de la pestaña del navegador, si es distinto del h1. Inicio saluda en el h1 (D-116) */
  documentTitle?: string;
  description?: string;
  badges?: ReactNode;
  /** Controles a la derecha del título, a su misma altura */
  actions?: ReactNode;
  /** Racha, nivel y foto a la derecha del título. true por defecto (D-071) */
  stats?: boolean;
}

/**
 * Título de pantalla. El h1 recibe el foco al navegar y el título de la pestaña se actualiza. La
 * explicación de la pantalla se lee una vez, así que queda tras un ícono de información (D-078).
 * Dentro del marco va en la barra blanca de arriba, separado del resto de la página (D-117)
 */
export function ScreenHeader({
  title,
  documentTitle,
  description,
  badges,
  actions,
  stats = true,
}: ScreenHeaderProps) {
  const [showInfo, setShowInfo] = useState(false);
  const infoId = useId();
  const inBar = useInTopBar();
  return (
    <>
      <header className={cn('flex flex-col gap-1.5', inBar ? TOP_BAR_SLOT : 'animate-rise')}>
        <title>{t.app.documentTitle(documentTitle ?? title)}</title>
        {badges ? <div className="flex shrink-0 flex-wrap gap-2">{badges}</div> : null}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 sm:gap-x-3 lg:flex-1 lg:flex-nowrap">
          <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
            <h1
              tabIndex={-1}
              className={cn('screen-title text-fg outline-none', inBar && 'lg:truncate')}
            >
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
          <div className="ml-auto flex min-w-0 flex-wrap-reverse items-center justify-end gap-2 lg:shrink-0 lg:flex-nowrap">
            {actions ? <div className="flex flex-wrap gap-2 lg:flex-nowrap">{actions}</div> : null}
            {stats ? <HeaderStats /> : null}
          </div>
        </div>
      </header>
      {/* La explicación va fuera de la barra, al principio del contenido, para que la barra no crezca */}
      {description ? (
        <p id={infoId} hidden={!showInfo} className="text-sm text-fg-muted sm:text-base">
          {description}
        </p>
      ) : null}
    </>
  );
}
