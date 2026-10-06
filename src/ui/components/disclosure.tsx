import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Sección plegable con details y summary nativos (D-078). Muestra un título y un resumen de lo que
 * contiene, para que las opciones que se cambian poco no empujen hacia abajo lo importante
 */
export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  /** Resumen corto a la derecha del título, por ejemplo cuántos temas están marcados */
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  // Solo cuenta al montar. Después el alumno abre y cierra, y React no vuelve a tocar el atributo
  const [initialOpen] = useState(defaultOpen);
  return (
    <details className={cn('group rounded-lg border border-line', className)} open={initialOpen}>
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className="font-semibold">{title}</span>
          {summary ? (
            <span className="truncate text-sm text-fg-muted sm:ml-auto">{summary}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className={cn('flex flex-col gap-3 border-t border-line p-3', bodyClassName)}>
        {children}
      </div>
    </details>
  );
}
