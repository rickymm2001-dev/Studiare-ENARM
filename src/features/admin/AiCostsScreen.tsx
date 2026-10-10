// Costos de IA y bitácora de llamadas (pantalla 23, 8.1). Admin y dueño ven cuánto se ha gastado, cuánto
// por motor y por día, cuánto costaría un alumno al mes y cada llamada con su modelo, sus tokens, su
// costo, su latencia y cómo terminó. El gasto de las respuestas simuladas es teórico y se dice con
// texto. Antes de proyectar espera a tener llamadas y días suficientes.
import { Coins, Gauge, Layers, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/app/session';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { readStoredOverrides } from '@/config/overridesStore';
import { DEFAULT_TIME_ZONE } from '@/data/schemas/common';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { AI_ENGINES, type AiEngine } from '@/engines/aiContracts';
import { projectMonthlyPerStudent, summarizeCosts, type CallMode } from '@/engines/aiCosts';
import { t } from '@/i18n/es-MX';
import { adminText } from '@/i18n/admin';
import { Badge } from '@/ui/components/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { ProgressBar } from '@/ui/components/progress-bar';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { CalibratingState, EmptyState, LoadingState } from '@/ui/states/states';
import { formatDateTime, formatInt, formatUsd, shortId } from './format';
import { useAiAdmin } from './useAiAdmin';

const LOG_ROWS = 50;
const DAY_ROWS = 14;
const ALL = 'all';
const MODES: readonly CallMode[] = ['real', 'mock', 'template'];
const OUTCOMES = ['ok', 'retried_ok', 'fallback', 'error'] as const;

export function AiCostsScreen() {
  const text = adminText.adminCosts;
  const api = useDataApi();
  const session = useSession();
  const timeZone = session.status === 'ready' ? session.user.timeZone : DEFAULT_TIME_ZONE;
  const calls = useLiveData(() => api.repos.aiCallLog.list(), [api.repos]);
  const admin = useAiAdmin();
  const [estimate] = useState(() => readStoredOverrides()?.aiCostEstimateUsd ?? null);
  const [engine, setEngine] = useState(ALL);
  const [mode, setMode] = useState(ALL);
  const [outcome, setOutcome] = useState(ALL);

  const header = <ScreenHeader title={text.title} description={t.screens.aiCosts.description} />;
  if (calls === undefined) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }

  const records = calls;
  const summary = summarizeCosts(records, timeZone);
  const projection = projectMonthlyPerStudent(records, timeZone);
  const failedShare =
    summary.total.calls === 0 ? 0 : Math.round((summary.total.failed / summary.total.calls) * 100);

  const filtered = records
    .filter(
      (call) =>
        (engine === ALL || call.engine === engine) &&
        (mode === ALL || call.mode === mode) &&
        (outcome === ALL || call.outcome === outcome),
    )
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      {header}

      <StatPanel label={text.stats.label} quad>
        <StatCell
          icon={<Coins />}
          label={text.stats.real}
          value={formatUsd(summary.real.costUsd)}
          caption={text.stats.realCaption(summary.real.calls)}
        />
        <StatCell
          icon={<Layers />}
          label={text.stats.simulated}
          value={formatUsd(summary.simulated.costUsd)}
          caption={text.stats.simulatedCaption(summary.simulated.calls)}
        />
        <StatCell
          icon={<Gauge />}
          label={text.stats.latency}
          value={`${formatInt(summary.total.avgLatencyMs)} ms`}
          caption={text.stats.latencyCaption}
        />
        <StatCell
          icon={<TriangleAlert />}
          label={text.stats.failed}
          value={`${failedShare}%`}
          caption={text.stats.failedCaption(summary.total.failed, summary.total.retried)}
        />
      </StatPanel>

      <Card aria-labelledby="costos-hoy">
        <CardHeader className="mb-2">
          <CardTitle id="costos-hoy">{text.today.title}</CardTitle>
          <CardDescription>{text.today.hint}</CardDescription>
        </CardHeader>
        {!admin.loaded ? (
          <LoadingState />
        ) : admin.usage ? (
          <div className="flex flex-col gap-2">
            <p>
              {text.today.spent(
                formatUsd(admin.usage.usage.spentUsd),
                formatUsd(admin.usage.limits.dailyBudgetUsd),
              )}
            </p>
            <ProgressBar
              value={admin.usage.usage.spentUsd}
              max={admin.usage.limits.dailyBudgetUsd}
              label={text.today.spentLabel}
            />
            <p className="text-sm text-fg-muted">
              {text.today.calls(admin.usage.usage.calls, admin.usage.usage.students)}
            </p>
            {admin.usage.mode === 'mock' ? (
              <p className="text-sm text-fg-muted">{text.today.mockNote}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">{text.today.noProxy}</p>
        )}
      </Card>

      {summary.total.calls === 0 ? (
        <EmptyState title={text.empty.title} description={text.empty.description} />
      ) : (
        <>
          <Card aria-labelledby="costos-motor">
            <CardHeader className="mb-2">
              <CardTitle id="costos-motor">{text.byEngine.title}</CardTitle>
              <CardDescription>{text.byEngine.hint}</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-fg-muted">
                    <th scope="col" className="py-1 pr-2">
                      {text.columns.engine}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right">
                      {text.columns.calls}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right">
                      {text.columns.realCost}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right">
                      {text.columns.simulatedCost}
                    </th>
                    <th scope="col" className="py-1 text-right">
                      {text.columns.latency}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byEngine.map((entry) => (
                    <tr key={entry.engine} className="border-t border-line">
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                        {text.engines[entry.engine]}
                      </th>
                      <td className="py-1.5 pr-2 text-right">
                        {formatInt(entry.real.calls + entry.simulated.calls)}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{formatUsd(entry.real.costUsd)}</td>
                      <td className="py-1.5 pr-2 text-right">
                        {formatUsd(entry.simulated.costUsd)}
                      </td>
                      <td className="py-1.5 text-right">
                        {formatInt(
                          Math.round(
                            (entry.real.avgLatencyMs * entry.real.calls +
                              entry.simulated.avgLatencyMs * entry.simulated.calls) /
                              Math.max(1, entry.real.calls + entry.simulated.calls),
                          ),
                        )}{' '}
                        ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {projection.ready ? (
            <Card aria-labelledby="costos-proyeccion">
              <CardHeader className="mb-2">
                <CardTitle id="costos-proyeccion">{text.projection.title}</CardTitle>
                <CardDescription>
                  {text.projection.basis(projection.basis, projection.students, projection.days)}
                </CardDescription>
              </CardHeader>
              <p className="text-2xl font-bold">
                {text.projection.value(formatUsd(projection.usdPerStudentMonth))}
              </p>
              {projection.basis === 'simulated' ? (
                <p className="mt-1 text-sm text-fg-muted">{text.projection.simulatedNote}</p>
              ) : null}
              <p className="mt-2 text-sm">
                {estimate === null
                  ? text.projection.noEstimate
                  : projection.usdPerStudentMonth > estimate
                    ? text.projection.above(formatUsd(estimate))
                    : text.projection.below(formatUsd(estimate))}
              </p>
            </Card>
          ) : (
            <CalibratingState
              current={projection.have}
              target={projection.need}
              unit={text.projection.units[projection.unit]}
              title={text.projection.title}
              description={text.projection.calibrating}
            />
          )}

          <Card aria-labelledby="costos-dias">
            <CardHeader className="mb-2">
              <CardTitle id="costos-dias">{text.byDay.title}</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-fg-muted">
                    <th scope="col" className="py-1 pr-2">
                      {text.columns.day}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right">
                      {text.columns.calls}
                    </th>
                    <th scope="col" className="py-1 pr-2 text-right">
                      {text.columns.realCost}
                    </th>
                    <th scope="col" className="py-1 text-right">
                      {text.columns.simulatedCost}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byDay.slice(0, DAY_ROWS).map((day) => (
                    <tr key={day.day} className="border-t border-line">
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                        {day.day}
                      </th>
                      <td className="py-1.5 pr-2 text-right">{formatInt(day.calls)}</td>
                      <td className="py-1.5 pr-2 text-right">{formatUsd(day.realCostUsd)}</td>
                      <td className="py-1.5 text-right">{formatUsd(day.simulatedCostUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card aria-labelledby="costos-bitacora">
            <CardHeader className="mb-2">
              <CardTitle id="costos-bitacora">{text.log.title}</CardTitle>
              <CardDescription>
                {text.log.hint(Math.min(LOG_ROWS, filtered.length), filtered.length)}
              </CardDescription>
            </CardHeader>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SelectField
                label={text.log.filterEngine}
                value={engine}
                onChange={(event) => {
                  setEngine(event.target.value);
                }}
                options={[
                  { value: ALL, label: text.log.all },
                  ...AI_ENGINES.map((value: AiEngine) => ({ value, label: text.engines[value] })),
                ]}
              />
              <SelectField
                label={text.log.filterMode}
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value);
                }}
                options={[
                  { value: ALL, label: text.log.all },
                  ...MODES.map((value) => ({ value, label: text.modes[value] })),
                ]}
              />
              <SelectField
                label={text.log.filterOutcome}
                value={outcome}
                onChange={(event) => {
                  setOutcome(event.target.value);
                }}
                options={[
                  { value: ALL, label: text.log.all },
                  ...OUTCOMES.map((value) => ({ value, label: text.outcomes[value] })),
                ]}
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-fg-muted">{text.log.none}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-fg-muted">
                      <th scope="col" className="py-1 pr-2">
                        {text.columns.when}
                      </th>
                      <th scope="col" className="py-1 pr-2">
                        {text.columns.engine}
                      </th>
                      <th scope="col" className="py-1 pr-2">
                        {text.columns.mode}
                      </th>
                      <th scope="col" className="py-1 pr-2">
                        {text.columns.model}
                      </th>
                      <th scope="col" className="py-1 pr-2 text-right">
                        {text.columns.tokens}
                      </th>
                      <th scope="col" className="py-1 pr-2 text-right">
                        {text.columns.cost}
                      </th>
                      <th scope="col" className="py-1 pr-2 text-right">
                        {text.columns.latency}
                      </th>
                      <th scope="col" className="py-1 pr-2">
                        {text.columns.outcome}
                      </th>
                      <th scope="col" className="py-1">
                        {text.columns.student}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, LOG_ROWS).map((call) => (
                      <tr key={call.id} className="border-t border-line align-top">
                        <td className="py-1.5 pr-2 whitespace-nowrap">{formatDateTime(call.at)}</td>
                        <td className="py-1.5 pr-2">{text.engines[call.engine]}</td>
                        <td className="py-1.5 pr-2">
                          <Badge variant={call.mode === 'real' ? 'info' : 'simulated'}>
                            {text.modes[call.mode]}
                          </Badge>
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-xs">{call.model}</td>
                        <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                          {text.log.tokens(
                            call.inputTokens + call.cacheWriteTokens + call.cacheReadTokens,
                            call.outputTokens,
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                          {formatUsd(call.estimatedCostUsd)}
                          {call.mode === 'real' ? null : (
                            <span className="sr-only"> {text.log.theoretical}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                          {formatInt(call.latencyMs)} ms
                        </td>
                        <td className="py-1.5 pr-2">{text.outcomes[call.outcome]}</td>
                        <td className="py-1.5 font-mono text-xs">{shortId(call.userId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
