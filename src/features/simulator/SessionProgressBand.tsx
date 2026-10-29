// Banda crema con el avance de una sesión de preguntas (D-150). Dice en qué pregunta va, pinta la
// barra de avance y deja lugar a la derecha para el aviso de ritmo del examen o el tiempo de la
// práctica. Sale a los bordes del contenido, como la franja de la sesión, y en computadora se queda
// pegada bajo la barra pizarra si la pantalla lo pide con sticky.
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';
import { ProgressBar } from '@/ui/components/progress-bar';

export function SessionProgressBand({
  label,
  value,
  max,
  progressLabel,
  children,
  className,
}: {
  /** Pregunta N de M, en marino */
  label: string;
  value: number;
  max: number;
  /** Lo que lee el lector de pantalla de la barra */
  progressLabel: string;
  /** El aviso o el tiempo, a la derecha de la barra */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('-mx-5 border-b border-line bg-cream lg:-mx-8', className)}>
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 lg:px-8">
        <span className="text-sm font-bold text-heading tabular-nums">{label}</span>
        <ProgressBar
          value={value}
          max={max}
          label={progressLabel}
          className="h-2 min-w-40 flex-1 bg-line"
        />
        {children}
      </div>
    </div>
  );
}
