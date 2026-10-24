// Medidor de medio círculo (D-150), como el pulso de estudio. Un arco gris y encima el arco lleno en
// el color del estado. La cifra va abajo al centro, puesta por quien lo usa.
import { cn } from '@/ui/cn';

/** Medio perímetro del arco de radio 90 en el lienzo de 220 por 120 */
const ARC = 'M20 110 A90 90 0 0 1 200 110';
const ARC_LENGTH = Math.PI * 90;

export function Gauge({
  value,
  max,
  strokeClass,
  label,
  width = 220,
  className,
  children,
}: {
  value: number;
  max: number;
  /** Clase de trazo de la paleta, como stroke-success */
  strokeClass: string;
  /** Lo que lee el lector de pantalla */
  label: string;
  width?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const height = Math.round((width * 120) / 220);
  return (
    <div className={cn('relative shrink-0', className)} style={{ width, height }}>
      <svg
        viewBox="0 0 220 120"
        width={width}
        height={height}
        role="img"
        aria-label={label}
        className="absolute inset-0"
      >
        <path d={ARC} fill="none" strokeWidth={22} strokeLinecap="round" className="stroke-muted" />
        {fraction > 0 ? (
          <path
            d={ARC}
            fill="none"
            strokeWidth={22}
            strokeLinecap="round"
            strokeDasharray={`${String(fraction * ARC_LENGTH)} ${String(ARC_LENGTH + 1)}`}
            className={strokeClass}
          />
        ) : null}
      </svg>
      {children ? (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center leading-none">
          {children}
        </div>
      ) : null}
    </div>
  );
}
