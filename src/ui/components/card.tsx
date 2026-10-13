// Tarjeta base. Borde fino sobre superficie lisa, sin sombra (B2 del plan del cambio).
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('animate-rise rounded-lg border border-line bg-surface p-4', className)}
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
  return <Heading className={cn('text-base font-semibold text-fg', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-fg-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-3', className)} {...props} />;
}
