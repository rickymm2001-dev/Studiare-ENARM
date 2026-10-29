import { useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { screenKeyOfPath } from '@/features/tour/anchors';
import { t } from '@/i18n/core';
import { cn } from '@/ui/cn';

interface ScreenHeaderProps {
  title: string;
  /** Título de la pestaña del navegador, si es distinto del h1. Inicio saluda en el h1 (D-116) */
  documentTitle?: string;
  /** La explicación de la pantalla, en cursiva bajo el título como el héroe de la portada (D-150) */
  description?: string;
  /** El kicker en mayúsculas espaciadas arriba del título, como en la portada */
  kicker?: string;
  badges?: ReactNode;
  /** Controles a la derecha del título, alineados abajo */
  actions?: ReactNode;
  className?: string;
}

/**
 * Título de pantalla, en el contenido, en marino y con el kicker y la explicación a la vista, como
 * el héroe de la portada (D-150). El h1 recibe el foco al navegar y el título de la pestaña se
 * actualiza. La racha, el nivel y el alumno viven en la barra pizarra de arriba (HeaderStats)
 */
export function ScreenHeader({
  title,
  documentTitle,
  description,
  kicker,
  badges,
  actions,
  className,
}: ScreenHeaderProps) {
  // La clave de la pantalla es el ancla del recorrido guiado (B15, 4.3). Sale de la ruta, así ninguna pantalla se toca
  const screenKey = screenKeyOfPath(useLocation().pathname);
  return (
    <header
      data-tour-screen={screenKey}
      className={cn(
        'animate-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4',
        className,
      )}
    >
      <title>{t.app.documentTitle(documentTitle ?? title)}</title>
      <div className="flex min-w-0 max-w-3xl flex-col gap-2">
        {kicker || badges ? (
          <div className="flex flex-wrap items-center gap-2">
            {kicker ? <span className="eyebrow">{kicker}</span> : null}
            {badges}
          </div>
        ) : null}
        <h1 tabIndex={-1} className="screen-title outline-none">
          {title}
        </h1>
        {description ? <p className="screen-lead">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
