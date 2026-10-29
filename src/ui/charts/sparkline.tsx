// Línea chica con su área sombreada en el mismo color, sin ejes (D-150). Para las tarjetas de cifra y
// los indicadores clave. La sombra es el color de la línea con opacidad, no un degradado. Se estira al
// ancho de su caja y conserva la altura.
import { cn } from '@/ui/cn';

const WIDTH = 200;

/** Una curva suave que pasa por los puntos, con el punto final marcado */
function pathOf(
  values: readonly number[],
  height: number,
): { line: string; area: string; lastY: number } {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? WIDTH / (values.length - 1) : WIDTH;
  const pad = 4;
  const points = values.map((value, index) => ({
    x: index * step,
    y: pad + (height - pad * 2) - ((value - min) / span) * (height - pad * 2),
  }));
  const [first] = points;
  if (!first) return { line: '', area: '', lastY: 0 };
  let line = `M${String(first.x)},${String(first.y)}`;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const point = points[index];
    if (!prev || !point) continue;
    const cx = (prev.x + point.x) / 2;
    line += ` C${String(cx)},${String(prev.y)} ${String(cx)},${String(point.y)} ${String(point.x)},${String(point.y)}`;
  }
  const last = points.at(-1) ?? first;
  const area = `${line} L${String(last.x)},${String(height)} L${String(first.x)},${String(height)} Z`;
  return { line, area, lastY: last.y };
}

export function Sparkline({
  values,
  strokeClass,
  fillClass,
  height = 48,
  label,
  className,
}: {
  values: readonly number[];
  /** Clase de trazo de la paleta, como stroke-success */
  strokeClass: string;
  /** Clase de relleno del mismo color, como fill-success */
  fillClass: string;
  height?: number;
  /** Lo que lee el lector de pantalla. Sin etiqueta la gráfica es decorativa */
  label?: string;
  className?: string;
}) {
  const { line, area, lastY } = pathOf(values, height);
  return (
    <svg
      viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
      preserveAspectRatio="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('block w-full', className)}
      style={{ height }}
    >
      {area ? <path d={area} className={fillClass} fillOpacity={0.14} /> : null}
      {line ? (
        <path
          d={line}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className={strokeClass}
        />
      ) : null}
      {values.length > 0 ? (
        <circle
          cx={WIDTH}
          cy={lastY}
          r={3.5}
          className={cn('stroke-surface', fillClass)}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
