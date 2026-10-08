import type { ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Tarjeta oscura con degradado para las cifras clave de una pantalla (D-079). Las celdas van en
 * una fila, separadas por una línea fina, con el texto en blanco sobre el degradado de la marca
 */
export function StatPanel({
  label,
  className,
  children,
}: {
  /** Nombre de la tarjeta para el lector de pantalla */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        'bg-hero animate-rise grid auto-cols-fr grid-flow-col divide-x divide-white/15 rounded-xl text-white shadow-raised',
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
  /** Etiqueta corta, porque va en mayúsculas y letra mono */
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
    <div className="flex h-full min-w-0 flex-col gap-1 px-3 py-3 sm:px-5 sm:py-4">
      <span className="flex items-center gap-1.5 font-mono text-[0.625rem] leading-tight font-semibold tracking-[0.1em] text-white/80 uppercase sm:text-[0.6875rem] sm:tracking-[0.14em]">
        <span
          aria-hidden
          className={cn('shrink-0 text-white [&_svg]:size-3.5', !phoneIcon && 'hidden sm:inline')}
        >
          {icon}
        </span>
        <span>
          {label}
          {srLabel ? <span className="sr-only"> {srLabel}</span> : null}
        </span>
      </span>
      <span className="font-display text-xl leading-tight font-extrabold tabular-nums sm:text-3xl">
        {value}
      </span>
      {caption ? <span className="text-xs text-white/80">{caption}</span> : null}
      {children ? <div className="mt-auto pt-1">{children}</div> : null}
    </div>
  );
}
