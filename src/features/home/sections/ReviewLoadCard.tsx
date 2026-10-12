// Carga de repaso en Inicio (D-118). Una columna por cada uno de los próximos 7 días, hoy incluido,
// con las tarjetas que te tocan ese día, repasos y nuevas juntas. Sale de la misma proyección y los
// mismos límites que la carga futura de Progreso y el planificador, así las cifras coinciden. Cada
// columna dice su cifra arriba, al pasar el cursor se ve el desglose y para el lector de pantalla hay
// una tabla con los mismos datos. Sustituye a la gráfica de repasos programados y realizados por mes
// de D-116, que no se entendía.
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { DayLoad } from '@/engines/fsrs';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import type { FutureLoad } from '../../progress/futureLoad';

const text = t.home.load;

/** Días que muestra la gráfica, hoy incluido */
export const LOAD_DAYS = 7;

// Los días son de calendario, así que se formatean en UTC para que no se corran
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const weekdayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' });
const dayNumberFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', timeZone: 'UTC' });
const longDayFormat = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const shortDay = (day: string) => capitalize(weekdayFormat.format(asDate(day)).replace('.', ''));
/** Inicial del día, L a D, la misma que usa el calendario */
const initialDay = (day: string) =>
  t.widgets.heatmap.weekdays[(asDate(day).getUTCDay() + 6) % 7] ?? shortDay(day);
const longDay = (day: string) => capitalize(longDayFormat.format(asDate(day)));
const totalOf = (day: DayLoad) => day.reviews + day.newCards;

export function ReviewLoadCard({ load }: { load: FutureLoad | null }) {
  const titleId = useId();
  const days = load?.days.slice(0, LOAD_DAYS) ?? [];
  const total = days.reduce((sum, day) => sum + totalOf(day), 0);
  return (
    <Card aria-labelledby={titleId} className="flex flex-col p-5">
      {/* h3 como las demás tarjetas de Tus repasos, que ya tiene su h2 */}
      <h3 id={titleId} className="mb-2 text-lg font-bold text-fg sm:text-xl">
        {text.title}
      </h3>
      {load === null ? (
        <div className="mt-1 flex grow flex-col items-center justify-center gap-3 rounded-md border border-dashed border-line-strong bg-muted/60 px-4 py-6 text-center">
          <p className="text-sm text-fg-muted">{text.empty}</p>
          <Button asChild variant="secondary" size="sm">
            <Link to={screenPath('decks')}>{text.goToDecks}</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm sm:text-base">
            {total > 0 ? text.summary(total, Math.round(total / days.length)) : text.none}{' '}
            {text.linkBefore}
            <Link
              to={screenPath('progress')}
              aria-label={text.linkLabel}
              className="font-semibold text-primary underline underline-offset-4"
            >
              {text.link}
            </Link>
            {text.linkAfter}
          </p>
          <DayColumns days={days} total={total} />
        </>
      )}
    </Card>
  );
}

/** Columnas por día. Una sola serie, así que no lleva leyenda. El título de la tarjeta la nombra */
function DayColumns({ days, total }: { days: readonly DayLoad[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = days.map(totalOf);
  const max = Math.max(1, ...totals);
  const peak = totals.indexOf(Math.max(0, ...totals));
  const peakDay = days[peak];
  const dayName = (index: number, day: string) => (index === 0 ? text.today : longDay(day));
  const label =
    total > 0 && peakDay
      ? text.chartLabel(total, dayName(peak, peakDay.day), totals[peak] ?? 0)
      : text.chartEmpty;
  const active = hover === null ? undefined : days[hover];

  return (
    // Contenedor para que los nombres de los días se acorten cuando la tarjeta es angosta
    <figure className="@container mt-4 flex grow flex-col gap-2">
      <div
        role="img"
        aria-label={label}
        className="relative min-h-44 grow"
        onMouseLeave={() => {
          setHover(null);
        }}
      >
        <div className="absolute inset-0 flex border-b border-line">
          {days.map((day, index) => {
            const value = totals[index] ?? 0;
            return (
              // La zona de la columna entera responde al cursor, más grande que la barra
              <div
                key={day.day}
                className="relative flex min-w-0 flex-1 flex-col items-center justify-end"
                onMouseEnter={() => {
                  setHover(index);
                }}
              >
                <span className="mb-1 text-xs font-semibold text-fg tabular-nums">
                  {value.toLocaleString('es-MX')}
                </span>
                {/* Barra de 24 px como máximo, con la punta redondeada y pegada a la base */}
                <span
                  className={cn(
                    'w-3/5 max-w-6 rounded-t-[4px] bg-primary transition-opacity',
                    hover !== null && hover !== index && 'opacity-60',
                  )}
                  style={{ height: `calc((100% - 1.25rem) * ${String(value / max)})` }}
                />
              </div>
            );
          })}
        </div>
        {active && hover !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 w-max max-w-48 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-card"
            style={
              hover < days.length / 2
                ? { left: `${String((hover / days.length) * 100)}%` }
                : { right: `${String(((days.length - hover - 1) / days.length) * 100)}%` }
            }
          >
            <p className="font-semibold">{dayName(hover, active.day)}</p>
            <p className="tabular-nums">{text.dayTotal(totalOf(active))}</p>
            <p className="text-fg-muted">{text.dayDetail(active.reviews, active.newCards)}</p>
          </div>
        ) : null}
      </div>
      <div aria-hidden className="flex">
        {days.map((day, index) => (
          <span
            key={day.day}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center text-[0.6875rem] leading-tight text-fg-muted @2xs:text-xs',
              index === 0 && 'font-semibold text-fg',
            )}
          >
            {index === 0 ? (
              <span>{text.today}</span>
            ) : (
              <>
                {/* En una tarjeta angosta va la inicial y con espacio la abreviatura */}
                <span className="@2xs:hidden">{initialDay(day.day)}</span>
                <span className="hidden @2xs:inline">{shortDay(day.day)}</span>
              </>
            )}
            <span className="tabular-nums">{dayNumberFormat.format(asDate(day.day))}</span>
          </span>
        ))}
      </div>
      <figcaption className="text-xs text-fg-muted">{text.estimate}</figcaption>
      {/* La tabla va dentro de un div oculto. Una tabla no se deja encoger a 1 px y ensancharía la
          página en el teléfono */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{text.day}</th>
              <th scope="col">{text.reviews}</th>
              <th scope="col">{text.fresh}</th>
              <th scope="col">{text.total}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, index) => (
              <tr key={day.day}>
                <th scope="row">{dayName(index, day.day)}</th>
                <td>{day.reviews}</td>
                <td>{day.newCards}</td>
                <td>{totalOf(day)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
