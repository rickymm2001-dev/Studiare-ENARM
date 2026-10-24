// Anillo concéntrico (D-150). Hasta tres anillos, cada uno con su parte llena sobre un riel gris,
// como el estado de las tarjetas en Inicio. Los colores salen de los tokens por clase de trazo, así
// cambian con el modo. Para el lector de pantalla va el resumen en aria-label, que pone quien lo usa.
import { cn } from '@/ui/cn';

export interface Ring {
  /** De 0 a max. Más de max se recorta */
  value: number;
  max: number;
  /** Clase de trazo de la paleta, como stroke-indicator o stroke-chart-compare */
  strokeClass: string;
}

/** Giro de cada anillo desde las 12, para que no empiecen todos en el mismo punto, como en el diseño */
const STAGGER = [-90, -30, 0];

export function RingChart({
  rings,
  size = 180,
  thickness = 14,
  label,
  className,
  children,
}: {
  rings: readonly Ring[];
  size?: number;
  thickness?: number;
  /** Lo que lee el lector de pantalla */
  label: string;
  className?: string;
  /** Lo que va al centro, como una cifra */
  children?: React.ReactNode;
}) {
  const center = size / 2;
  const gap = thickness + 6;
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${String(size)} ${String(size)}`}
        width={size}
        height={size}
        role="img"
        aria-label={label}
        className="absolute inset-0"
      >
        {rings.slice(0, 3).map((ring, index) => {
          const radius = center - thickness / 2 - index * gap;
          const length = 2 * Math.PI * radius;
          const fraction = ring.max > 0 ? Math.min(Math.max(ring.value / ring.max, 0), 1) : 0;
          const rotate = STAGGER[index] ?? -90;
          return (
            <g key={index}>
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                strokeWidth={thickness}
                className="stroke-muted"
              />
              {fraction > 0 ? (
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  strokeWidth={thickness}
                  strokeLinecap="round"
                  strokeDasharray={`${String(fraction * length)} ${String(length)}`}
                  transform={`rotate(${String(rotate)} ${String(center)} ${String(center)})`}
                  className={ring.strokeClass}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
          {children}
        </div>
      ) : null}
    </div>
  );
}
