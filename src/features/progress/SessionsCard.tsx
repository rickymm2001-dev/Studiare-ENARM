// Últimas sesiones (D-150). Una tabla con las sesiones que dejó la bitácora, nombre, modo, fecha,
// estado en etiqueta y aciertos, a partir de los eventos de inicio y cierre de sesión. El botón
// grande lleva a los resultados del examen solo cuando hay un examen terminado que mostrar.
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { SessionRow, SessionRowState } from '@/engines/progressSummary';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardTitle } from '@/ui/components/card';

const text = t.progress.sessions;

const STATE_VARIANT: Record<SessionRowState, 'success' | 'warning' | 'neutral'> = {
  completed: 'success',
  abandoned: 'warning',
  open: 'neutral',
};

const formatDate = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  });

const scoreOf = (row: SessionRow) =>
  row.correct !== null && row.items !== null && row.items > 0
    ? `${String(Math.round((row.correct / row.items) * 100))} %`
    : '—';

export function SessionsCard({
  rows,
  timeZone,
  examResultsAvailable,
  className,
}: {
  rows: readonly SessionRow[];
  timeZone: string;
  /** Hay un examen terminado cuyos resultados se pueden abrir */
  examResultsAvailable: boolean;
  className?: string;
}) {
  return (
    <Card
      lift={false}
      aria-labelledby="sesiones-titulo"
      className={cn('flex flex-col gap-3', className)}
    >
      <CardTitle id="sesiones-titulo">{text.title}</CardTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-muted">
                <th scope="col" className="px-2.5 py-2 font-semibold">
                  {text.columns.name}
                </th>
                <th scope="col" className="px-2.5 py-2 font-semibold">
                  {text.columns.mode}
                </th>
                <th scope="col" className="px-2.5 py-2 font-semibold">
                  {text.columns.date}
                </th>
                <th scope="col" className="px-2.5 py-2 font-semibold">
                  {text.columns.state}
                </th>
                <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                  {text.columns.score}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line hover:bg-cream">
                  <th scope="row" className="px-2.5 py-3 text-left font-semibold">
                    {text.name(row.kind, row.items)}
                  </th>
                  <td className="px-2.5 py-3 text-fg-muted">{text.modes[row.kind]}</td>
                  <td className="px-2.5 py-3 text-fg-muted">
                    <time dateTime={row.startedAt}>{formatDate(row.startedAt, timeZone)}</time>
                  </td>
                  <td className="px-2.5 py-3">
                    <Badge variant={STATE_VARIANT[row.state]}>{text.states[row.state]}</Badge>
                  </td>
                  <td className="px-2.5 py-3 text-right font-bold text-heading tabular-nums">
                    {scoreOf(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {examResultsAvailable ? (
        <Button asChild size="lg" className="justify-between">
          <Link to={screenPath('examResults')}>
            {text.seeResults}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      ) : null}
    </Card>
  );
}
