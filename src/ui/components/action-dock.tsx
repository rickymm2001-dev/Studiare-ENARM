import type { ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Barra de acciones de una sesión (D-078). En el teléfono queda fija arriba de la navegación
 * inferior, para que confianza, revelar y calificar estén siempre a la mano sin desplazarse.
 * En computadora vuelve a su lugar normal dentro de la página
 */
export function ActionDock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2 border-t border-line/70 bg-surface/95 px-4 py-2.5 backdrop-blur',
        'lg:static lg:mx-0 lg:border-t-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
