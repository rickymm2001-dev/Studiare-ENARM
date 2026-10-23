// Estadísticas de un mazo que el alumno sigue (V4-B3). Cuántas tarjetas hay por estado, cuáles ya
// tocan o están atrasadas, las sanguijuelas, la última vez que lo estudió, el histograma de intervalos y
// la retención estimada, que calibra hasta tener suficientes tarjetas en repaso. Todo sale del motor
// puro src/engines/deckStats.ts.
import { Hourglass } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import { deckStats, INTERVAL_BUCKETS } from '@/engines/deckStats';
import { deckStatsText } from '@/i18n/deckStats';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Disclosure } from '@/ui/components/disclosure';

const number = (value: number) => value.toLocaleString('es-MX');

/** Sin tarjetas suspendidas. Una constante para que no cambie en cada render */
const NO_SUSPENDED: readonly (FsrsCardState | null)[] = [];

export function DeckStatsPanel({
  states,
  suspendedStates = NO_SUSPENDED,
  timeZone,
  leechLapses = DEFAULT_THRESHOLDS.fsrs.leechLapses,
  leechHref,
}: {
  /** El estado FSRS de cada tarjeta del mazo que Repasar ofrece. null si nunca se ha visto */
  states: readonly (FsrsCardState | null)[];
  /**
   * El de las suspendidas del mazo. No cuentan en las cifras de hoy, pero sus olvidos y su último repaso
   * siguen siendo del mazo, así que entran en las sanguijuelas y en la última vez
   */
  suspendedStates?: readonly (FsrsCardState | null)[];
  timeZone: string;
  /** Olvidos desde los que una tarjeta es sanguijuela. Por omisión el umbral del modelo */
  leechLapses?: number;
  /** A dónde lleva ver las sanguijuelas del mazo, que es Buscar tarjetas con el filtro puesto */
  leechHref?: string;
}) {
  const stats = useMemo(
    () => deckStats({ states, suspendedStates, now: new Date(), timeZone, leechLapses }),
    [states, suspendedStates, timeZone, leechLapses],
  );
  const text = t.deckStats;
  const extra = deckStatsText;
  const largest = Math.max(1, ...Object.values(stats.intervals));
  const figures = [
    { label: text.fresh, value: stats.fresh },
    { label: text.learning, value: stats.learning },
    { label: text.review, value: stats.review },
    { label: text.mature, value: stats.mature, hint: text.matureHint },
    { label: text.dueToday, value: stats.dueToday },
    { label: text.overdue, value: stats.overdue },
  ];
  return (
    <Disclosure title={text.title} summary={text.summary(stats.dueToday, stats.total)}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {figures.map((figure) => (
          <div key={figure.label} className="flex flex-col">
            <dt className="text-xs text-fg-muted">{figure.label}</dt>
            <dd className="text-lg font-bold tabular-nums">
              {number(figure.value)}
              {figure.hint ? (
                <span className="block text-xs font-normal text-fg-muted">{figure.hint}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-semibold">{extra.leeches}</dt>
          <dd className="flex flex-col gap-1 text-sm">
            {stats.reviewed === 0 ? (
              <span className="flex flex-wrap items-center gap-2 text-fg-muted">
                <Badge className="[&_svg]:size-3.5">
                  <Hourglass aria-hidden />
                  {t.insights.calibratingLabel}
                </Badge>
                {extra.leechesCalibrating}
              </span>
            ) : stats.leeches === 0 ? (
              <span className="text-fg-muted">{extra.leechesNone}</span>
            ) : (
              <>
                <span className="text-lg font-bold tabular-nums">
                  {extra.leechesValue(stats.leeches)}
                </span>
                {stats.leechesSuspended > 0 ? (
                  <span className="text-fg-muted">
                    {extra.leechesSuspended(stats.leechesSuspended)}
                  </span>
                ) : null}
                {leechHref ? (
                  <Link to={leechHref} className="font-medium text-primary-ink underline">
                    {extra.seeLeeches}
                  </Link>
                ) : null}
              </>
            )}
            <span className="text-xs text-fg-muted">{extra.leechesHint(leechLapses)}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-semibold">{extra.lastStudied}</dt>
          <dd className="text-sm">
            {stats.daysSinceLastReview === null ? (
              <span className="text-fg-muted">{extra.neverStudied}</span>
            ) : (
              <span className="text-lg font-bold">
                {extra.lastStudiedValue(stats.daysSinceLastReview)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold">{text.retention}</h4>
        {stats.retention === null ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge className="[&_svg]:size-3.5">
              <Hourglass aria-hidden />
              {t.insights.calibratingLabel}
            </Badge>
            {text.calibrating(stats.retentionNeeded)}
          </p>
        ) : (
          <>
            <p className="text-lg font-bold tabular-nums">{text.retentionValue(stats.retention)}</p>
            <p className="text-xs text-fg-muted">{text.retentionHint}</p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold">{text.intervals}</h4>
        <ul className="flex flex-col gap-1">
          {INTERVAL_BUCKETS.map((bucket) => {
            const count = stats.intervals[bucket.key];
            return (
              <li key={bucket.key} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-2">
                <span className="text-sm">{text.buckets[bucket.key]}</span>
                <span aria-hidden className="h-2 rounded-sm bg-muted">
                  <span
                    className="block h-2 rounded-sm bg-indicator"
                    style={{ width: `${(count / largest) * 100}%` }}
                  />
                </span>
                <span className="text-right text-sm tabular-nums">{number(count)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Disclosure>
  );
}
