// Última corrida de la calibración nocturna (B14, 7.2 del plan de B14). Dice si la calibración está
// encendida, en qué modo, cómo terminó la última corrida y hace cuánto, de dónde leen los alumnos y, si
// pasaron más de 48 horas sin una corrida buena, el aviso con los pasos para volver a prenderla en
// GitHub. Sin la llave la corrida termina como not_configured y no deja registro, así que "nunca ha
// corrido" explica también esa causa.
import { ExternalLink } from 'lucide-react';
import {
  CALIBRATION_WORKFLOW_URL,
  type AdminCalibration,
  type CalibrationRun,
} from '@/data/cloud/calibrationAdmin';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import {
  agoText,
  calibrationHealth,
  dayText,
  reasonText,
  runTone,
  whenText,
} from './calibrationView';

const text = calibrationAdminTexts;

function LatestRun({ run, now }: { run: CalibrationRun; now: Date }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <Badge variant={runTone(run.status)}>{text.runStatus[run.status] ?? run.status}</Badge>
        <span>
          {[text.modes[run.mode] ?? run.mode, text.triggers[run.trigger] ?? run.trigger].join(
            ' · ',
          )}
        </span>
      </p>
      <p className="text-fg-muted">
        {text.status.startedAt(whenText(run.startedAt), agoText(run.startedAt, now))}
      </p>
      {run.reason ? <p className="text-fg-muted">{reasonText(run.reason)}</p> : null}
    </div>
  );
}

function StaleNotice({ hours, lastOkAt, now }: { hours: number; lastOkAt: string; now: Date }) {
  const copy = text.status.stale;
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm"
    >
      <p className="font-semibold">{copy.title}</p>
      <p>
        {text.status.lastGood(agoText(lastOkAt, now) || `hace ${hours} horas`)} {copy.body}
      </p>
      <ol className="list-decimal pl-5">
        {copy.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div>
        <Button asChild variant="secondary" size="sm">
          <a href={CALIBRATION_WORKFLOW_URL} target="_blank" rel="noopener noreferrer">
            {copy.open}
            <ExternalLink aria-hidden />
          </a>
        </Button>
      </div>
    </div>
  );
}

export function CalibrationStatusCard({ data, now }: { data: AdminCalibration; now: Date }) {
  const copy = text.status;
  const health = calibrationHealth(data, now);
  const latest = data.runs[0];
  const { enabled, mode } = data.settings.calibration;
  return (
    <Card aria-labelledby="calibracion-estado" className="flex flex-col gap-3">
      <CardHeader className="mb-0">
        <CardTitle id="calibracion-estado">{copy.title}</CardTitle>
      </CardHeader>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={enabled ? 'success' : 'neutral'}>{text.modes[mode] ?? mode}</Badge>
        <span>{enabled ? copy.switchOn : copy.switchOff}</span>
      </p>
      {latest ? (
        <LatestRun run={latest} now={now} />
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{copy.noRuns}</p>
          <p className="text-fg-muted">{copy.noRunsHelp}</p>
        </div>
      )}
      {health.kind === 'stale' && data.lastOkAt !== null ? (
        <StaleNotice hours={health.hours} lastOkAt={data.lastOkAt} now={now} />
      ) : null}
      {health.kind === 'no_good_run' ? (
        <p role="status" className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
          {copy.noGoodRun}
        </p>
      ) : null}
      <p className="text-sm text-fg-muted">
        {data.publication === null
          ? copy.publication.none
          : copy.publication.at(dayText(data.publication.at))}
      </p>
    </Card>
  );
}
