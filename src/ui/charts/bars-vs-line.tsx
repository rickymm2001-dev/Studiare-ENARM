// Barras de este periodo con la línea del periodo anterior encima (D-150), como las preguntas por
// día de la semana contra la semana pasada. La barra más alta va en marino y las demás en cielo, la
// línea en el ámbar de comparación con sus puntos. Para el lector de pantalla hay una tabla.
import { cn } from '@/ui/cn';

const WIDTH = 320;
const HEIGHT = 130;
const BASE = 110;
const TOP = 20;
const BAR = 22;

export function BarsVsLine({
  current,
  previous,
  labels,
  caption,
  currentName,
  previousName,
  className,
}: {
  current: readonly number[];
  previous: readonly number[];
  labels: readonly string[];
  /** El nombre de la tabla para el lector de pantalla */
  caption: string;
  currentName: string;
  previousName: string;
  className?: string;
}) {
  const max = Math.max(...current, ...previous, 1);
  const slot = WIDTH / Math.max(labels.length, 1);
  const x = (index: number) => slot * index + slot / 2;
  const y = (value: number) => BASE - (value / max) * (BASE - TOP);
  const peak = current.indexOf(Math.max(...current));
  const points = previous
    .map((value, index) => `${String(x(index))},${String(y(value))}`)
    .join(' ');
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        aria-hidden
        className="block w-full font-sans"
        style={{ height: 'auto' }}
      >
        <line x1={0} x2={WIDTH} y1={BASE} y2={BASE} className="stroke-line" strokeWidth={1} />
        {current.map((value, index) => (
          <rect
            key={index}
            x={x(index) - BAR / 2}
            y={y(value)}
            width={BAR}
            height={Math.max(BASE - y(value), 0)}
            rx={5}
            className={index === peak ? 'fill-chart-done' : 'fill-chart-scheduled'}
          />
        ))}
        {previous.length > 1 ? (
          <polyline
            points={points}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-chart-compare"
          />
        ) : null}
        {previous.map((value, index) => (
          <circle
            key={`p-${String(index)}`}
            cx={x(index)}
            cy={y(value)}
            r={3.5}
            strokeWidth={2}
            className="fill-surface stroke-chart-compare"
          />
        ))}
        {labels.map((label, index) => (
          <text
            key={label}
            x={x(index)}
            y={HEIGHT - 4}
            textAnchor="middle"
            fontSize={10}
            className="fill-fg-muted"
          >
            {label}
          </text>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{caption}</th>
            {labels.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{currentName}</th>
            {current.map((value, index) => (
              <td key={index}>{value.toLocaleString('es-MX')}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">{previousName}</th>
            {previous.map((value, index) => (
              <td key={index}>{value.toLocaleString('es-MX')}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
