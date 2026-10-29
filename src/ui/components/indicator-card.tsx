// Tarjeta de indicador (D-150), como las de Indicadores clave. Nombre, estado con su color a la
// derecha, cifra grande con su unidad, la gráfica chica (sparkline o barra de rango) y una nota.
// El estado lleva siempre texto, nunca solo color (4.7).
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { Card } from './card';

export type IndicatorTone = 'good' | 'near' | 'info' | 'calibrating';

const TONE_CLASS: Record<IndicatorTone, string> = {
  good: 'text-success',
  near: 'text-warning',
  info: 'text-primary-ink',
  calibrating: 'text-fg-muted',
};

export function IndicatorCard({
  title,
  state,
  tone,
  value,
  unit,
  note,
  children,
  className,
}: {
  title: string;
  /** El estado en palabras, como Óptima o Calibrando */
  state: string;
  tone: IndicatorTone;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col gap-2 rounded-xl p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-fg">{title}</h3>
        <span className={cn('text-xs font-bold', TONE_CLASS[tone])}>{state}</span>
      </div>
      <p className="flex items-baseline gap-1">
        <span className="text-2xl leading-none font-extrabold tracking-tight tabular-nums">
          {value}
        </span>
        {unit ? <span className="text-sm text-fg-muted">{unit}</span> : null}
      </p>
      {children}
      {note ? <p className="text-xs text-fg-muted">{note}</p> : null}
    </Card>
  );
}
