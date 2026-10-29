// Tarjeta base. Esquinas de 20 px, borde fino y sube con sombra suave al pasar el puntero, como las
// de la portada (D-150). Con tone cambia el tinte, crema para repasos, panel para análisis, salvia
// para Party y marino para la destacada, que lleva texto blanco.
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';

export type CardTone = 'surface' | 'cream' | 'panel' | 'sage' | 'navy';

const TONES: Record<CardTone, string> = {
  surface: 'border-line bg-surface',
  cream: 'border-line bg-cream',
  panel: 'border-line bg-panel',
  sage: 'border-line bg-sage',
  navy: 'border-primary bg-primary text-primary-fg shadow-navy',
};

export function Card({
  className,
  tone = 'surface',
  lift = true,
  ...props
}: ComponentProps<'section'> & {
  tone?: CardTone;
  /** false deja la tarjeta quieta al pasar el puntero, para formularios y tablas largas */
  lift?: boolean;
}) {
  return (
    <section
      className={cn(
        'animate-rise rounded-lg border p-5',
        TONES[tone],
        lift && 'card-lift',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-2 flex flex-col gap-0.5', className)} {...props} />;
}

/**
 * Título de la tarjeta. Es h2, salvo dentro de una sección de página que ya tiene su h2, como las de
 * Configuración, donde va como h3 para que los títulos sigan su orden
 */
export function CardTitle({
  className,
  as: Heading = 'h2',
  ...props
}: ComponentProps<'h2'> & { as?: 'h2' | 'h3' }) {
  return <Heading className={cn('text-lg font-bold text-fg', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm leading-relaxed text-fg-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-3', className)} {...props} />;
}
