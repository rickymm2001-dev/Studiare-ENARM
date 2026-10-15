// Costo de la IA en la nube (B12, 2.5). Debajo del gasto de hoy, lo que gastó la IA de la nube en un
// periodo, por motor, por modo (al momento o por lote, a mitad de costo) y por resultado, y lo que
// cuesta un alumno al mes. Sale de admin_ai_cost_report, que revisa que seas admin y, con el segundo
// factor, que lo hayas dado. No lleva el texto de nadie. Solo con la cuenta de la nube conectada.
import { Coins, TriangleAlert, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useCloud } from '@/app/cloudState';
import { fetchCostReport, type CostResult } from '@/data/cloud/aiCosts';
import { loadCloud } from '@/data/cloud/client';
import { AI_ENGINES } from '@/engines/aiContracts';
import { adminText } from '@/i18n/admin';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { meridaMonthToDate } from '../physician/meridaMonth';
import { askSecondFactor } from '../physician/secondFactor';
import { useRepoQuery } from '../physician/useRepoQuery';
import { failedCalls, outcomeRows, spentRows, validRange } from './cloudCostsView';
import { formatInt, formatUsd } from './format';

const text = adminText.adminCosts.cloud;
const engineNames = adminText.adminCosts.engines;
const percent = (value: number) =>
  `${(value * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`;

export function CloudCostsCard() {
  const linked = useCloud((store) => store.state.status === 'linked');
  const initial = meridaMonthToDate(new Date());
  const [draft, setDraft] = useState(initial);
  const [range, setRange] = useState(initial);
  const { state, reload } = useRepoQuery<CostResult>(
    async () => {
      const cloud = await loadCloud();
      if (!cloud) return { ok: false, reason: 'network' };
      return fetchCostReport(cloud, range, askSecondFactor);
    },
    `${range.from}|${range.to}`,
    linked,
  );
  const valid = validRange(draft);

  return (
    <Card aria-labelledby="costos-nube" className="flex flex-col gap-3">
      <CardHeader className="mb-0">
        <CardTitle id="costos-nube">{text.title}</CardTitle>
        <CardDescription>{linked ? text.hint : text.needsCloud}</CardDescription>
      </CardHeader>
      {linked ? (
        <>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) setRange(draft);
            }}
          >
            <TextField
              label={text.from}
              type="date"
              value={draft.from}
              onChange={(event) => {
                setDraft({ ...draft, from: event.target.value });
              }}
            />
            <TextField
              label={text.to}
              type="date"
              value={draft.to}
              error={valid ? null : text.invalidRange}
              onChange={(event) => {
                setDraft({ ...draft, to: event.target.value });
              }}
            />
            <Button type="submit" disabled={!valid}>
              {text.show}
            </Button>
          </form>
          {state.status === 'loading' ? <LoadingState /> : null}
          {state.status === 'failed' ? (
            <ErrorState description={text.failures.unknown ?? ''} onRetry={reload} />
          ) : null}
          {state.status === 'ready' && !state.value.ok ? (
            <ErrorState
              description={text.failures[state.value.reason] ?? text.failures.unknown ?? ''}
              onRetry={reload}
            />
          ) : null}
          {state.status === 'ready' && state.value.ok ? (
            <Report report={state.value.report} />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function Report({ report }: { report: Extract<CostResult, { ok: true }>['report'] }) {
  if (report.calls === 0) {
    return (
      <p role="status" className="text-sm text-fg-muted">
        {text.empty}
      </p>
    );
  }
  const engines = spentRows(report.byEngine, report.totalUsd, AI_ENGINES);
  const modes = spentRows(report.byMode, report.totalUsd, ['sync', 'batch']);
  const outcomes = outcomeRows(report.byOutcome);
  const perStudent = report.perStudentMonthlyUsd;
  return (
    <div className="flex flex-col gap-4">
      <StatPanel label={text.statsLabel} quad>
        <StatCell
          icon={<Coins />}
          label={text.total}
          value={formatUsd(report.totalUsd)}
          caption={text.totalCaption(report.calls)}
        />
        <StatCell
          icon={<Users />}
          label={text.students}
          value={formatInt(report.students)}
          caption={text.studentsCaption(report.users)}
        />
        <StatCell
          icon={<Wallet />}
          label={text.paidToday}
          value={formatInt(report.paidStudentsToday)}
          caption={text.paidTodayCaption}
        />
        <StatCell
          icon={<TriangleAlert />}
          label={text.failed}
          value={formatInt(failedCalls(report.byOutcome))}
          caption={text.failedCaption}
        />
      </StatPanel>

      <section aria-labelledby="costo-por-alumno" className="flex flex-col gap-2">
        <h3 id="costo-por-alumno" className="font-semibold">
          {text.perStudentTitle}
        </h3>
        <p className="text-sm text-fg-muted">{text.perStudentHint}</p>
        {report.students === 0 ? (
          <p className="text-sm">{text.noStudents}</p>
        ) : (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                [text.mean, perStudent.mean],
                [text.median, perStudent.p50],
                [text.p90, perStudent.p90],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-md bg-muted p-3">
                <dt className="text-xs font-semibold text-fg-muted">{label}</dt>
                <dd className="text-lg font-bold">{text.perStudentValue(formatUsd(value))}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <Breakdown
        title={text.engineTitle}
        rows={engines.map((row) => ({
          ...row,
          name: engineNames[row.key as keyof typeof engineNames],
        }))}
      />
      <Breakdown
        title={text.modeTitle}
        rows={modes.map((row) => ({ ...row, name: text.modes[row.key] ?? row.key }))}
      />

      <section aria-labelledby="costo-resultados" className="flex flex-col gap-2">
        <h3 id="costo-resultados" className="font-semibold">
          {text.outcomeTitle}
        </h3>
        <ul className="flex flex-col divide-y divide-line text-sm">
          {outcomes.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 py-1.5">
              <span>{text.outcomes[row.key] ?? row.key}</span>
              <span className="font-medium">{formatInt(row.calls)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; name: string; calls: number; costUsd: number; share: number }[];
}) {
  const id = `costo-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-fg-muted">
              <th scope="col" className="py-1 pr-2">
                {text.columns.name}
              </th>
              <th scope="col" className="py-1 pr-2 text-right">
                {text.columns.calls}
              </th>
              <th scope="col" className="py-1 pr-2 text-right">
                {text.columns.cost}
              </th>
              <th scope="col" className="py-1 text-right">
                {text.columns.share}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                  {row.name}
                </th>
                <td className="py-1.5 pr-2 text-right">{formatInt(row.calls)}</td>
                <td className="py-1.5 pr-2 text-right">{formatUsd(row.costUsd)}</td>
                <td className="py-1.5 text-right">{percent(row.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
