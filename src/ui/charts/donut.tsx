// Dona con los porcentajes afuera de cada rebanada (D-150), como las tarjetas por rama. El centro
// queda libre para la cifra total. Cada rebanada lleva su clase de trazo de la paleta, así las ramas
// usan su color de D-128.
import { cn } from '@/ui/cn';

export interface DonutSegment {
  value: number;
  /** Clase de trazo de la paleta, como stroke-mi */
  strokeClass: string;
}

const RADIUS = 70;
const LENGTH = 2 * Math.PI * RADIUS;
const LABEL_RADIUS = 96;

export function Donut({
  segments,
  size = 200,
  label,
  className,
  children,
}: {
  segments: readonly DonutSegment[];
  size?: number;
  /** Lo que lee el lector de pantalla */
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  // El principio de cada rebanada es la suma de las anteriores
  const starts = segments.reduce<number[]>((acc, _segment, index) => {
    const previous = acc[index - 1] ?? 0;
    const before = index === 0 ? 0 : Math.max(segments[index - 1]?.value ?? 0, 0);
    acc.push(previous + (total > 0 ? before / total : 0));
    return acc;
  }, []);
  const slices = segments.map((segment, index) => {
    const fraction = total > 0 ? Math.max(segment.value, 0) / total : 0;
    const start = starts[index] ?? 0;
    const middle = (start + fraction / 2) * 2 * Math.PI - Math.PI / 2;
    return {
      ...segment,
      fraction,
      dash: Math.max(fraction * LENGTH - 3, 0),
      dashOffset: -start * LENGTH,
      labelX: 100 + Math.cos(middle) * LABEL_RADIUS,
      labelY: 100 + Math.sin(middle) * LABEL_RADIUS,
    };
  });
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg
        viewBox="-14 -14 228 228"
        width={size}
        height={size}
        role="img"
        aria-label={label}
        className="absolute inset-0 font-sans"
      >
        {total === 0 ? (
          <circle
            cx={100}
            cy={100}
            r={RADIUS}
            fill="none"
            strokeWidth={22}
            className="stroke-muted"
          />
        ) : null}
        {slices.map((slice, index) =>
          slice.fraction > 0 ? (
            <circle
              key={index}
              cx={100}
              cy={100}
              r={RADIUS}
              fill="none"
              strokeWidth={22}
              strokeDasharray={`${String(slice.dash)} ${String(LENGTH)}`}
              strokeDashoffset={slice.dashOffset}
              transform="rotate(-90 100 100)"
              className={slice.strokeClass}
            />
          ) : null,
        )}
        {slices.map((slice, index) =>
          slice.fraction >= 0.04 ? (
            <text
              key={`label-${String(index)}`}
              x={slice.labelX}
              y={slice.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={700}
              className="fill-fg-muted"
            >
              {`${String(Math.round(slice.fraction * 100))}%`}
            </text>
          ) : null,
        )}
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
          {children}
        </div>
      ) : null}
    </div>
  );
}
