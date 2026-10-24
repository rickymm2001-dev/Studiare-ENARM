// Tarjeta de cifra (D-150). Ícono en círculo cielo, nombre, menú opcional a la derecha, la cifra
// grande con su cambio y una gráfica chica abajo, como las de la referencia de tableros.
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { Card, type CardTone } from './card';

export function StatCard({
  icon,
  title,
  value,
  delta,
  caption,
  actions,
  tone = 'surface',
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  /** El cambio frente al periodo anterior. up sube en verde, down baja en rojo */
  delta?: { text: string; direction: 'up' | 'down' | 'flat' };
  caption?: ReactNode;
  /** Un botón de menú o un filtro, a la derecha del nombre */
  actions?: ReactNode;
  tone?: CardTone;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card tone={tone} className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink [&_svg]:size-5"
        >
          {icon}
        </span>
        <h3 className="min-w-0 truncate text-base font-bold text-fg">{title}</h3>
        {actions ? <div className="ml-auto shrink-0">{actions}</div> : null}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-3xl leading-none font-extrabold tracking-tight tabular-nums">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-sm font-bold',
              delta.direction === 'up' && 'text-success',
              delta.direction === 'down' && 'text-danger',
              delta.direction === 'flat' && 'text-fg-muted',
            )}
          >
            {delta.direction === 'up' ? <ArrowUp aria-hidden className="size-3.5" /> : null}
            {delta.direction === 'down' ? <ArrowDown aria-hidden className="size-3.5" /> : null}
            {delta.text}
          </span>
        ) : null}
        {caption ? <span className="text-sm text-fg-muted">{caption}</span> : null}
      </p>
      {children}
    </Card>
  );
}
