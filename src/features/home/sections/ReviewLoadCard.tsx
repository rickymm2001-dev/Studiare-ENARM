// Carga de repaso en Inicio (D-116, D-150). Por mes, cuántos repasos estaban programados y cuántos
// hizo el alumno, de dos meses atrás a dos adelante. Es la tarjeta de cifra del rediseño, con el
// promedio por día de este mes como cifra grande, la línea de programados en cielo con el sombreado
// degradado hacia abajo que pidió Ricardo (la única excepción a la regla sin degradados dentro de la
// app, junto con la portada, y la vigila src/ui/design.test.ts), la de realizados en marino, y un
// enlace a la carga completa en Progreso. Los colores salen de los tokens de la gráfica, validados
// para daltonismo en claro y en oscuro. Para el lector de pantalla hay una tabla con los mismos datos.
// La gráfica mide su espacio y lo llena todo, sin estirar el texto (D-117).
import { ChartColumn } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { MonthlyLoad, MonthlyLoadPoint } from '@/engines/monthlyLoad';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { StatCard } from '@/ui/components/stat-card';
import { useElementSize } from '@/ui/hooks/use-element-size';
import { niceMax } from './chartScale';

const text = t.home.load;
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

/** Medida mientras no hay cómo medir, como en las pruebas con jsdom */
const FALLBACK = { width: 320, height: 160 };
const PAD = { top: 12, right: 16, bottom: 28, left: 42 };

export function ReviewLoadCard({ load, className }: { load: MonthlyLoad; className?: string }) {
  return (
    <StatCard
      icon={<ChartColumn />}
      title={text.title}
      value={load.averagePerDayThisMonth.toLocaleString('es-MX')}
      caption={text.averageCaption}
      className={className}
    >
      {load.hasData ? (
        <LoadChart points={load.points} />
      ) : (
        // Alineado a la izquierda y sin marco punteado, como EmptyState (H17 de la revisión de B2).
        // Ocupa el lugar de la gráfica para que la tarjeta siga a la altura de su fila (D-117)
        <p className="grow text-sm text-fg-muted">{text.empty}</p>
      )}
      <Button asChild variant="link" size="sm" className="mt-auto self-start px-0">
        <Link to={screenPath('progress')}>{text.seeAll}</Link>
      </Button>
    </StatCard>
  );
}

function LoadChart({ points }: { points: readonly MonthlyLoadPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // El id del degradado no lleva los dos puntos de useId, que no caben en una referencia url()
  const gradientId = `carga-${useId().replace(/:/g, '')}`;
  const { width: WIDTH, height: HEIGHT } = useElementSize(box, FALLBACK);
  const max = niceMax(
    Math.max(0, ...points.map((point) => Math.max(point.scheduled, point.done ?? 0))),
  );
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const x = (index: number) => PAD.left + index * step;
  const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight;
  const bottom = PAD.top + innerHeight;
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const line = (values: (number | null)[]) =>
    values
      .map((value, index) => (value === null ? null : `${x(index)},${y(value)}`))
      .filter((value): value is string => value !== null)
      .join(' ');
  const scheduled = points.map((point) => point.scheduled);
  const done = points.map((point) => point.done);
  // El área bajo la línea de programados, cerrada hasta el piso de la gráfica
  const area =
    scheduled.length > 0
      ? `M${line(scheduled).split(' ').join(' L')} L${x(scheduled.length - 1)},${bottom} L${x(0)},${bottom} Z`
      : '';
  const active = hover === null ? null : points[hover];

  return (
    <figure className="flex grow flex-col gap-2">
      {/* La caja crece con la tarjeta y la gráfica se dibuja a su medida exacta */}
      <div ref={box} className="relative min-h-40 grow">
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          role="img"
          aria-label={text.chartLabel}
          className="absolute inset-0 overflow-visible"
          onMouseLeave={() => {
            setHover(null);
          }}
        >
          <defs>
            {/* Del color de la línea arriba al transparente abajo, con los tokens y no con un color a mano */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0"
                style={{ stopColor: 'var(--color-chart-scheduled)' }}
                stopOpacity={0.45}
              />
              <stop
                offset="1"
                style={{ stopColor: 'var(--color-chart-scheduled)' }}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-fg-muted text-xs tabular-nums"
              >
                {Math.round(tick).toLocaleString('es-MX')}
              </text>
            </g>
          ))}
          {points.map((point, index) => (
            <text
              key={point.month}
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-fg-muted text-xs"
            >
              {monthName(point.month)}
            </text>
          ))}
          {area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={bottom}
              className="stroke-line-strong"
              strokeWidth={1}
            />
          ) : null}
          <polyline
            points={line(scheduled)}
            fill="none"
            className="stroke-chart-scheduled"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={line(done)}
            fill="none"
            className="stroke-chart-done"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {scheduled.map((value, index) => (
            <circle
              key={`s-${String(index)}`}
              cx={x(index)}
              cy={y(value)}
              r={4}
              className="fill-chart-scheduled stroke-surface"
              strokeWidth={2}
            />
          ))}
          {done.map((value, index) =>
            value === null ? null : (
              <circle
                key={`d-${String(index)}`}
                cx={x(index)}
                cy={y(value)}
                r={4}
                className="fill-chart-done stroke-surface"
                strokeWidth={2}
              />
            ),
          )}
          {/* Zonas de toque más anchas que las marcas, una por mes */}
          {points.map((point, index) => (
            <rect
              key={`h-${point.month}`}
              x={x(index) - step / 2}
              y={PAD.top}
              width={Math.max(step, 24)}
              height={innerHeight}
              fill="transparent"
              onMouseEnter={() => {
                setHover(index);
              }}
            />
          ))}
        </svg>
        {active && hover !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-card"
            style={{
              left: `${(x(hover) / WIDTH) * 100}%`,
              transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})`,
            }}
          >
            <p className="font-semibold">{monthName(active.month)}</p>
            <p className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded-full bg-chart-scheduled" />
              {text.scheduled} {active.scheduled.toLocaleString('es-MX')}
            </p>
            <p className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded-full bg-chart-done" />
              {text.done} {active.done === null ? text.notYet : active.done.toLocaleString('es-MX')}
            </p>
          </div>
        ) : null}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded-full bg-chart-scheduled" />
          {text.scheduled}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded-full bg-chart-done" />
          {text.done}
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>{text.chartLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{text.month}</th>
            <th scope="col">{text.scheduled}</th>
            <th scope="col">{text.done}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <th scope="row">{monthName(point.month)}</th>
              <td>{point.scheduled}</td>
              <td>{point.done ?? text.notYet}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
