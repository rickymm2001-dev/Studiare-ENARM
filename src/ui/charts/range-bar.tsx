// Barra de rango en tres zonas con un marcador (D-150), como los indicadores clave. Las zonas van en
// los tonos suaves de correcto, aviso y peligro, en el orden que pide la medida (para el tiempo por
// pregunta lo bueno queda a la izquierda, para los aciertos a la derecha), y las tres difieren también
// en claridad, no solo en tono. Los textos de los extremos y la meta los pone quien la usa.
import { cn } from '@/ui/cn';

export type RangeZone = 'good' | 'mid' | 'bad';

const ZONE_CLASS: Record<RangeZone, string> = {
  good: 'bg-success-soft',
  mid: 'bg-warning-soft',
  bad: 'bg-danger-soft',
};

export function RangeBar({
  zones,
  position,
  label,
  ticks,
  className,
}: {
  /** Las tres zonas de izquierda a derecha */
  zones: readonly [RangeZone, RangeZone, RangeZone];
  /** Dónde va el marcador, de 0 a 100 */
  position: number;
  /** Lo que lee el lector de pantalla */
  label: string;
  /** Los textos bajo la barra, por ejemplo el mínimo, la meta y el máximo */
  ticks?: readonly [string, string, string];
  className?: string;
}) {
  const left = Math.min(Math.max(position, 0), 100);
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        role="img"
        aria-label={label}
        className="relative py-1"
        style={{ '--marker': `${String(left)}%` } as React.CSSProperties}
      >
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {zones.map((zone, index) => (
            <span key={index} className={cn('flex-1', ZONE_CLASS[zone])} />
          ))}
        </div>
        <span
          aria-hidden
          className="absolute top-0 h-[18px] w-[3px] -translate-x-1/2 rounded-sm bg-fg"
          style={{ left: 'var(--marker)' }}
        />
      </div>
      {ticks ? (
        <div className="flex justify-between text-xs text-fg-muted">
          {ticks.map((tick, index) => (
            <span key={index}>{tick}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
