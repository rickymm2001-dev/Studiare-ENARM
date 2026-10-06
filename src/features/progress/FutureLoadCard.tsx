// Carga futura (7.1, pantalla 10). Barras con los repasos y las tarjetas nuevas de cada día de los
// próximos 30 o 60 días, con el promedio, el día más cargado y una tabla por semana para quien no
// ve la gráfica. Lo proyectado sale de futureLoad, la misma proyección y los mismos límites del
// planificador.
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { LOAD_HORIZONS, type FutureLoad, type LoadHorizon } from './futureLoad';

const dayFormat = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
/** AAAA-MM-DD a 6 oct. El día es de calendario, así que se formatea en UTC para que no se corra */
const formatDay = (day: string) => dayFormat.format(new Date(`${day}T12:00:00Z`));

export function FutureLoadCard({
  load,
  horizon,
  onHorizon,
}: {
  /** null si no sigue ningún mazo */
  load: FutureLoad | null;
  horizon: LoadHorizon;
  onHorizon: (horizon: LoadHorizon) => void;
}) {
  const text = t.progress.futureLoad;
  const header = (
    <CardHeader className="mb-3">
      <CardTitle id="carga-futura">{text.title}</CardTitle>
      <CardDescription>{text.hint}</CardDescription>
    </CardHeader>
  );
  if (load === null || load.cardCount === 0) {
    return (
      <Card aria-labelledby="carga-futura">
        {header}
        <p className="text-sm text-fg-muted">{text.empty}</p>
        <Button asChild variant="secondary" size="sm" className="mt-2 self-start">
          <Link to={screenPath('decks')}>{text.goToDecks}</Link>
        </Button>
      </Card>
    );
  }

  const max = Math.max(1, ...load.days.map((day) => day.reviews + day.newCards));
  const peakText = load.peak
    ? text.peakValue(formatDay(load.peak.day), load.peak.reviews + load.peak.newCards)
    : '—';
  const average = Math.round(load.averageReviews);
  const chartLabel = load.peak
    ? text.chart(load.horizon, average, peakText)
    : text.chartEmpty(load.horizon);

  return (
    <Card aria-labelledby="carga-futura">
      {header}
      <div className="flex flex-col gap-3">
        <fieldset>
          <legend className="sr-only">{text.horizonLabel}</legend>
          <div className="flex gap-2">
            {LOAD_HORIZONS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={horizon === days}
                onClick={() => {
                  onHorizon(days);
                }}
                className={cn(
                  'min-h-9 rounded-full border-2 px-4 text-sm font-semibold transition-all',
                  horizon === days
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                {text.horizon(days)}
              </button>
            ))}
          </div>
        </fieldset>

        <div role="img" aria-label={chartLabel} className="flex h-28 items-end gap-px">
          {load.days.map((day) => {
            const reviews = (day.reviews / max) * 100;
            const fresh = (day.newCards / max) * 100;
            return (
              <div key={day.day} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <div className="w-full rounded-t-sm bg-accent/60" style={{ height: `${fresh}%` }} />
                <div className="w-full bg-primary" style={{ height: `${reviews}%` }} />
              </div>
            );
          })}
        </div>
        <div aria-hidden className="flex justify-between text-xs text-fg-muted">
          <span>{formatDay(load.days[0]?.day ?? '')}</span>
          <span>{formatDay(load.days.at(-1)?.day ?? '')}</span>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm bg-primary" />
            {text.reviews}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm bg-accent/60" />
            {text.fresh}
          </li>
        </ul>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label={text.average}>{average.toLocaleString('es-MX')}</Figure>
          <Figure label={text.peak}>{peakText}</Figure>
          <Figure label={text.total}>{load.totalReviews.toLocaleString('es-MX')}</Figure>
          <Figure label={text.newCards}>{load.totalNew.toLocaleString('es-MX')}</Figure>
        </dl>

        <Disclosure title={text.weeks}>
          <table className="w-full text-sm">
            <caption className="sr-only">{text.weeks}</caption>
            <thead>
              <tr className="text-left text-fg-muted">
                <th scope="col" className="py-1 pr-2 font-medium">
                  {text.horizonLabel}
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  {text.reviews}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {text.fresh}
                </th>
              </tr>
            </thead>
            <tbody>
              {load.weeks.map((week) => (
                <tr key={week.start} className="border-t border-line">
                  <th scope="row" className="py-1 pr-2 text-left font-normal">
                    {text.week(formatDay(week.start))}
                  </th>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {week.reviews.toLocaleString('es-MX')}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {week.newCards.toLocaleString('es-MX')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
      </div>
    </Card>
  );
}

/** El término va primero para los lectores de pantalla y la cifra se ve arriba */
function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse justify-end rounded-lg bg-muted p-3">
      <dt className="text-xs text-fg-muted sm:text-sm">{label}</dt>
      <dd className="text-lg font-extrabold tabular-nums sm:text-xl">{children}</dd>
    </div>
  );
}
