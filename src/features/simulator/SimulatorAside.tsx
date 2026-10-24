// El lateral de Armar tu simulador (D-150). Una tarjeta panel con lo que entrena la configuración de
// ahora, en viñetas con palomita cielo, y una tarjeta con las tres últimas sesiones reales de la
// bitácora. Las dos pintan lo que les pasan, sin inventar cifras.
import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { AppEvent } from '@/data/schemas/events';
import { t } from '@/i18n/es-MX';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { accuracyPercent, recentSessions, sessionDayLabel } from './recentSessions';

export function TrainingCard({ items }: { items: readonly string[] }) {
  return (
    <Card tone="panel" lift={false} aria-labelledby="simulador-entrena">
      <CardHeader>
        <CardTitle id="simulador-entrena" className="text-lg">
          {t.simulator.trains.title}
        </CardTitle>
      </CardHeader>
      <ul className="flex flex-col gap-2 text-sm leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-ink" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function RecentSessionsCard({
  events,
  timeZone,
  now,
}: {
  events: readonly AppEvent[];
  timeZone: string;
  now: Date;
}) {
  const copy = t.simulator.recent;
  const sessions = recentSessions(events, 3);
  const words = { today: t.overdue.today, yesterday: copy.yesterday };
  return (
    <Card lift={false} aria-labelledby="simulador-sesiones">
      <CardHeader>
        <CardTitle id="simulador-sesiones" className="text-lg">
          {copy.title}
        </CardTitle>
      </CardHeader>
      {sessions.length === 0 ? (
        <p className="text-sm text-fg-muted">{copy.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sessions.map((session) => {
            const percent = accuracyPercent(session);
            return (
              <li
                key={session.sessionId}
                className="flex items-center justify-between gap-3 rounded-md bg-cream px-3.5 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-bold">
                    {copy.item(copy.modes[session.mode], session.items)}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {copy.meta(
                      sessionDayLabel(session.endedAt, now, timeZone, words),
                      Math.max(1, Math.round(session.durationMs / 60_000)),
                    )}
                  </span>
                </div>
                {percent === null ? (
                  <span className="text-xs font-semibold text-fg-muted">{copy.unscored}</span>
                ) : (
                  <span className="text-lg font-extrabold text-heading tabular-nums">
                    {percent} %
                    <span className="sr-only">
                      {' '}
                      {copy.accuracy(session.correct ?? 0, session.items)}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        to={screenPath('progress')}
        className="mt-3 inline-block text-sm font-bold text-primary-ink hover:underline"
      >
        {copy.seeAll}
      </Link>
    </Card>
  );
}
