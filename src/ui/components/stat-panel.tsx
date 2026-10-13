import type { ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Cifras clave de una pantalla en una superficie lisa con borde fino (B2 del plan del cambio).
 * Las celdas van en una fila, separadas por una línea, con el texto del color de la página
 */
export function StatPanel({
  label,
  quad = false,
  className,
  children,
}: {
  /** Nombre de la tarjeta para el lector de pantalla */
  label: string;
  /** Para cuatro celdas. En el teléfono van dos por dos y desde sm en una fila */
  quad?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        'animate-rise grid rounded-lg border border-line bg-surface text-fg',
        quad
          ? 'grid-cols-2 [&>*]:border-line [&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none sm:[&>*:nth-child(n+3)]:border-t-0 sm:[&>*:not(:first-child)]:border-l'
          : 'auto-cols-fr grid-flow-col divide-x divide-line',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Una cifra con su etiqueta chica arriba y, si hace falta, una línea de apoyo o una barra */
export function StatCell({
  icon,
  label,
  srLabel,
  value,
  caption,
  phoneIcon = true,
  children,
}: {
  icon: ReactNode;
  /** Etiqueta corta */
  label: string;
  /** Texto extra solo para el lector de pantalla, por ejemplo la etiqueta completa */
  srLabel?: string;
  value: ReactNode;
  caption?: ReactNode;
  /** false oculta el ícono en el teléfono, cuando las celdas son muchas y angostas */
  phoneIcon?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-1 px-3 py-3 sm:px-4 sm:py-3">
      <span className="flex items-center gap-1.5 text-xs leading-tight font-medium text-fg-muted">
        <span
          aria-hidden
          className={cn('shrink-0 [&_svg]:size-3.5', !phoneIcon && 'hidden sm:inline')}
        >
          {icon}
        </span>
        <span>
          {label}
          {srLabel ? <span className="sr-only"> {srLabel}</span> : null}
        </span>
      </span>
      <span className="text-xl leading-tight font-bold tabular-nums sm:text-2xl">{value}</span>
      {caption ? <span className="text-xs text-fg-muted">{caption}</span> : null}
      {children ? <div className="mt-auto pt-1">{children}</div> : null}
    </div>
  );
}
