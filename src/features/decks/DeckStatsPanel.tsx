// Estadísticas de un mazo que el alumno sigue (V4-B3). Cuántas tarjetas hay por estado, cuáles ya
// tocan o están atrasadas, el histograma de intervalos y la retención estimada, que calibra hasta
// tener suficientes tarjetas en repaso. Todo sale del motor puro src/engines/deckStats.ts.
import { Hourglass } from 'lucide-react';
import { useMemo } from 'react';
import type { FsrsCardState } from '@/data/schemas/common';
import { deckStats, INTERVAL_BUCKETS } from '@/engines/deckStats';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Disclosure } from '@/ui/components/disclosure';

const number = (value: number) => value.toLocaleString('es-MX');

export function DeckStatsPanel({
  states,
  timeZone,
}: {
  /** El estado FSRS de cada tarjeta del mazo. null si nunca se ha visto */
  states: readonly (FsrsCardState | null)[];
  timeZone: string;
}) {
  const stats = useMemo(() => deckStats({ states, now: new Date(), timeZone }), [states, timeZone]);
  const text = t.deckStats;
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
