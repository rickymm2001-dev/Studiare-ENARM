// Lista de corridas de la calibración nocturna (B14, 7.2 del plan de B14). Las últimas 30, la más reciente
// primero, cada una con su estado, su modo, su disparador, el motivo si no terminó bien, una línea con lo
// que contó y todos sus conteos con nombre, y el enlace a su corrida de GitHub por su número. Solo
// números y códigos: la noche no guarda texto de alumnos ni de preguntas (3.11).
import { ExternalLink } from 'lucide-react';
import { calibrationRunUrl, type CalibrationRun } from '@/data/cloud/calibrationAdmin';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { labeledCounts, reasonText, runSummary, runTone, whenText } from './calibrationView';

const text = calibrationAdminTexts;

function RunLine({ run }: { run: CalibrationRun }) {
  const counts = labeledCounts(run.counts);
  const summary = runSummary(run);
  const url = calibrationRunUrl(run.githubRunId);
  return (
    <div className="flex flex-col gap-1.5 py-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <time dateTime={run.startedAt}>{whenText(run.startedAt)}</time>
        <Badge variant={runTone(run.status)}>{text.runStatus[run.status] ?? run.status}</Badge>
      </p>
      <p className="text-fg-muted">
        {[text.modes[run.mode] ?? run.mode, text.triggers[run.trigger] ?? run.trigger].join(' · ')}
      </p>
      {run.reason ? <p className="text-fg-muted">{reasonText(run.reason)}</p> : null}
      {summary.length > 0 ? <p className="text-fg-muted">{summary.join(' · ')}</p> : null}
      {url !== null && run.githubRunId !== null ? (
        <div>
          <Button asChild variant="link" size="sm" className="px-0">
            <a href={url} target="_blank" rel="noopener noreferrer">
              {text.runs.github(run.githubRunId)}
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </div>
      ) : null}
      <Disclosure title={text.runs.details}>
        {counts.length === 0 ? (
          <p className="text-fg-muted">{text.runs.noCounts}</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {counts.map((count) => (
              <div key={count.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-muted">{count.label}</dt>
                <dd className="font-medium tabular-nums">{count.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Disclosure>
    </div>
  );
}

export function CalibrationRunsCard({ runs }: { runs: readonly CalibrationRun[] }) {
  const copy = text.runs;
  return (
    <Card aria-labelledby="calibracion-corridas" className="flex flex-col gap-1">
      <CardHeader>
        <CardTitle id="calibracion-corridas">{copy.title}</CardTitle>
        {runs.length > 0 ? <CardDescription>{copy.hint(runs.length)}</CardDescription> : null}
      </CardHeader>
      {runs.length === 0 ? (
        <p className="text-sm text-fg-muted">{copy.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {runs.map((run) => (
            <li key={run.id}>
              <RunLine run={run} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
