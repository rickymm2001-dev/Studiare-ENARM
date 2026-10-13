// Carga futura (7.1, pantalla 10). Barras con los repasos y las tarjetas nuevas de cada día de los
// próximos 30 o 60 días, con el promedio, el día más cargado y una tabla por semana para quien no
// ve la gráfica. Lo proyectado sale de futureLoad, la misma proyección y los mismos límites del
// planificador.
import { CalendarCheck, Gauge, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { SegmentedControl } from '@/ui/components/segmented';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { LOAD_HORIZONS, type FutureLoad, type LoadHorizon } from './futureLoad';
import { formatDay, loadSummary } from './loadFormat';

/** Barras de repasos y de tarjetas nuevas de cada día, con su resumen para el lector de pantalla */
export function LoadBars({ load, className }: { load: FutureLoad; className?: string }) {
  const max = Math.max(1, ...load.days.map((day) => day.reviews + day.newCards));
  return (
    <div
      role="img"
      aria-label={loadSummary(load).chartLabel}
      className={cn('flex items-end gap-px', className)}
    >
      {load.days.map((day) => {
        const reviews = (day.reviews / max) * 100;
        const fresh = (day.newCards / max) * 100;
        return (
          <div key={day.day} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="w-full rounded-t-sm bg-accent/60" style={{ height: `${fresh}%` }} />
            <div className="w-full bg-indicator" style={{ height: `${reviews}%` }} />
          </div>
        );
      })}
    </div>
  );
}

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

  const { peakText, average } = loadSummary(load);

  return (
    <Card aria-labelledby="carga-futura">
      {header}
      <div className="flex flex-col gap-3">
        <SegmentedControl
          label={text.horizonLabel}
          options={LOAD_HORIZONS.map((days) => ({ value: days, label: text.horizon(days) }))}
          value={horizon}
          onChange={onHorizon}
        />

        <LoadBars load={load} className="h-28" />
        <div aria-hidden className="flex justify-between text-xs text-fg-muted">
          <span>{formatDay(load.days[0]?.day ?? '')}</span>
          <span>{formatDay(load.days.at(-1)?.day ?? '')}</span>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm bg-indicator" />
            {text.reviews}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm bg-accent/60" />
            {text.fresh}
          </li>
        </ul>

        {/* Las cuatro cifras en un solo panel, sin cajas dentro de la tarjeta (H06 de la revisión
            de B2). Desde lg la tarjeta ocupa media columna, así que vuelven a ir dos por dos */}
        <StatPanel
          label={text.horizon(load.horizon)}
          quad
          className="lg:grid-flow-row lg:grid-cols-2 lg:[&>*:nth-child(3)]:border-l-0 lg:[&>*:nth-child(n+3)]:border-t"
        >
          <StatCell icon={<Gauge />} label={text.average} value={average.toLocaleString('es-MX')} />
          <StatCell icon={<TrendingUp />} label={text.peak} value={peakText} />
          <StatCell
            icon={<CalendarCheck />}
            label={text.total}
            value={load.totalReviews.toLocaleString('es-MX')}
          />
          <StatCell
            icon={<Sparkles />}
            label={text.newCards}
            value={load.totalNew.toLocaleString('es-MX')}
          />
        </StatPanel>

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
