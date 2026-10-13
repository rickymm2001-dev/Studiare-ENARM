// Carga de repaso en Inicio (D-116). Por mes, cuántos repasos estaban programados y cuántos hizo el
// alumno, de dos meses atrás a dos adelante, con el promedio por día de este mes y un enlace a la
// carga completa en Progreso. Los colores salen de los tokens de la gráfica, validados para
// daltonismo en claro y en oscuro. Para el lector de pantalla hay una tabla con los mismos datos.
// La gráfica mide su espacio y lo llena todo, sin estirar el texto (D-117).
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { MonthlyLoad, MonthlyLoadPoint } from '@/engines/monthlyLoad';
import { t } from '@/i18n/es-MX';
import { Card } from '@/ui/components/card';
import { useElementSize } from '@/ui/hooks/use-element-size';
import { niceMax } from './chartScale';

const text = t.home.load;
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

/** Medida mientras no hay cómo medir, como en las pruebas con jsdom */
const FALLBACK = { width: 320, height: 200 };
const PAD = { top: 12, right: 16, bottom: 28, left: 42 };

export function ReviewLoadCard({ load }: { load: MonthlyLoad }) {
  const titleId = useId();
  return (
    <Card aria-labelledby={titleId} className="flex flex-col p-5">
      {/* h3 como las demás tarjetas de Tus repasos, que ya tiene su h2 */}
      <h3 id={titleId} className="mb-2 text-base font-semibold text-fg">
        {text.title}
      </h3>
      <p className="text-sm sm:text-base">
        {load.averagePerDayThisMonth > 0
          ? text.average(load.averagePerDayThisMonth)
          : text.averageNone}{' '}
        {text.linkBefore}
        <Link
          to={screenPath('progress')}
          aria-label={text.linkLabel}
          className="font-semibold text-primary-ink underline underline-offset-4"
        >
          {text.link}
        </Link>
        {text.linkAfter}
      </p>
      {load.hasData ? (
        <LoadChart points={load.points} />
      ) : (
        // Alineado a la izquierda y sin marco punteado, como EmptyState (H17 de la revisión de B2).
        // Ocupa el lugar de la gráfica para que la tarjeta siga a la altura de su fila (D-117)
        <p className="mt-3 grow text-sm text-fg-muted">{text.empty}</p>
      )}
    </Card>
  );
}

function LoadChart({ points }: { points: readonly MonthlyLoadPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const { width: WIDTH, height: HEIGHT } = useElementSize(box, FALLBACK);
  const max = niceMax(
    Math.max(0, ...points.map((point) => Math.max(point.scheduled, point.done ?? 0))),
  );
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const x = (index: number) => PAD.left + index * step;
  const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight;
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const line = (values: (number | null)[]) =>
    values
      .map((value, index) => (value === null ? null : `${x(index)},${y(value)}`))
      .filter((value): value is string => value !== null)
      .join(' ');
  const scheduled = points.map((point) => point.scheduled);
  const done = points.map((point) => point.done);
  const active = hover === null ? null : points[hover];

  return (
    <figure className="mt-3 flex grow flex-col gap-2">
      {/* La caja crece con la tarjeta y la gráfica se dibuja a su medida exacta */}
      <div ref={box} className="relative min-h-48 grow">
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
          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + innerHeight}
              className="stroke-line-strong"
              strokeWidth={1}
            />
          ) : null}
          <polyline
            points={line(scheduled)}
            fill="none"
            className="stroke-chart-scheduled"
            strokeWidth={2}
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
      <figcaption className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-muted">
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
