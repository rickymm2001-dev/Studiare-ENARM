// Radar del dominio por rama (D-150), como el de Tu perfil por rama. Una rejilla de polígonos, la
// serie del alumno en marino con relleno, la de hace un mes en cielo si hay datos y la meta en una
// línea punteada ámbar. Cada eje lleva la etiqueta corta de su rama en la tinta de esa rama, y el
// color nunca va solo porque el nombre está al lado. Para el lector de pantalla hay una etiqueta
// con los valores, que arma quien lo usa. Un eje sin valor no dibuja su punto.
import { branchTone, type BranchTone } from '@/ui/branches';
import { cn } from '@/ui/cn';

export interface RadarAxis {
  key: string;
  /** La etiqueta corta junto al eje */
  label: string;
  /** De 0 a 100. null mientras calibra */
  value: number | null;
  /** La misma medida hace un mes. null sin datos */
  before: number | null;
}

const CENTER = 110;
const RADIUS = 90;
const LABEL_RADIUS = RADIUS + 20;
/** Las tres rejillas, de afuera hacia adentro, como fracción del radio */
const RINGS = [1, 2 / 3, 1 / 3] as const;

/** Las clases van completas para que Tailwind las encuentre */
const LABEL_FILL: Record<BranchTone, string> = {
  mi: 'fill-mi-ink',
  ped: 'fill-ped-ink',
  gyo: 'fill-gyo-ink',
  cir: 'fill-cir-ink',
  fam: 'fill-fam-ink',
  urg: 'fill-urg-ink',
  neutral: 'fill-fg-muted',
};

const round = (value: number) => Math.round(value * 10) / 10;

/** El punto de un eje a cierta fracción del radio. El primer eje apunta arriba */
function pointAt(index: number, count: number, fraction: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return {
    x: round(CENTER + Math.cos(angle) * RADIUS * fraction),
    y: round(CENTER + Math.sin(angle) * RADIUS * fraction),
  };
}

const polygon = (points: readonly { x: number; y: number }[]) =>
  points.map((point) => `${String(point.x)},${String(point.y)}`).join(' ');

export function BranchRadar({
  axes,
  target,
  label,
  className,
}: {
  axes: readonly RadarAxis[];
  /** La meta, de 0 a 100 */
  target: number;
  /** Lo que lee el lector de pantalla */
  label: string;
  className?: string;
}) {
  const count = axes.length;
  const seriesPoints = (pick: (axis: RadarAxis) => number | null) =>
    axes.flatMap((axis, index) => {
      const value = pick(axis);
      return value === null ? [] : [pointAt(index, count, Math.min(Math.max(value, 0), 100) / 100)];
    });
  const current = seriesPoints((axis) => axis.value);
  const before = seriesPoints((axis) => axis.before);
  return (
    <svg
      viewBox="-30 -4 280 238"
      role="img"
      aria-label={label}
      className={cn('block h-auto w-full max-w-[20rem] font-sans', className)}
    >
      {RINGS.map((fraction) => (
        <polygon
          key={fraction}
          points={polygon(axes.map((_, index) => pointAt(index, count, fraction)))}
          fill="none"
          strokeWidth={1}
          className="stroke-line"
        />
      ))}
      <path
        d={axes
          .map((_, index) => {
            const edge = pointAt(index, count, 1);
            return `M${String(CENTER)} ${String(CENTER)} L${String(edge.x)} ${String(edge.y)}`;
          })
          .join(' ')}
        strokeWidth={1}
        className="stroke-line"
      />
      <polygon
        points={polygon(axes.map((_, index) => pointAt(index, count, target / 100)))}
        fill="none"
        strokeWidth={2}
        strokeDasharray="5 4"
        className="stroke-chart-compare"
      />
      {before.length >= 3 ? (
        <polygon
          points={polygon(before)}
          fillOpacity={0.3}
          strokeWidth={2}
          strokeLinejoin="round"
          className="fill-indicator stroke-indicator"
        />
      ) : null}
      {current.length >= 3 ? (
        <polygon
          points={polygon(current)}
          fillOpacity={0.35}
          strokeWidth={2.5}
          strokeLinejoin="round"
          className="fill-chart-done stroke-chart-done"
        />
      ) : null}
      {current.map((point) => (
        <circle
          key={`${String(point.x)}-${String(point.y)}`}
          cx={point.x}
          cy={point.y}
          r={3.5}
          className="fill-chart-done"
        />
      ))}
      {axes.map((axis, index) => {
        const point = pointAt(index, count, LABEL_RADIUS / RADIUS);
        const anchor =
          Math.abs(point.x - CENTER) < 1 ? 'middle' : point.x > CENTER ? 'start' : 'end';
        return (
          <text
            key={axis.key}
            x={point.x}
            y={point.y + 4}
            textAnchor={anchor}
            fontSize={11}
            fontWeight={700}
            className={LABEL_FILL[branchTone(axis.key)]}
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}
