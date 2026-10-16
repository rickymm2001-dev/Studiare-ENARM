// Cómo vas frente a otros (B14, 5.4 del plan de B14, pantalla 10). Tu percentil de lo que ya hiciste en los
// últimos 30 días contra todos los alumnos con datos y contra los que buscan tu misma especialidad:
// aciertos en simuladores por rama, repasos hechos y constancia. Solo con grupos de 30 alumnos o más. Si
// no, dice calibrando y cuántos faltan. El percentil lo calcula tu navegador con los cortes que publica la
// noche, así tus datos no viajan. Nunca habla de puntaje, de probabilidad ni de lugares en una lista, y su
// pie fijo lo dice. En la demostración lleva la etiqueta de datos simulados.
import { Hourglass } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ComparisonCohort, ComparisonMetric } from '@/data/model/contracts';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { SPECIALTIES } from '@/config/specialties';
import { topicTaxonomy } from '@/demo/content';
import type { ComparisonFact } from '@/engines/comparison';
import { modelTexts } from '@/i18n/model';
import { BranchMark } from '@/ui/components/branch-tag';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { ProgressBar } from '@/ui/components/progress-bar';
import { SegmentedControl } from '@/ui/components/segmented';
import { LoadingState } from '@/ui/states/states';
import type { ComparisonState } from '../model/modelSnapshots';
import { settingsPath } from '../settings/sections';
import {
  buildComparisonView,
  nightOf,
  type ComparisonRow,
  type ComparisonView,
} from './comparisonView';

const text = modelTexts.comparison;
const BRANCH_ORDER = topicTaxonomy.branches.map((branch) => branch.key);
const BRANCH_NAMES: ReadonlyMap<string, string> = new Map(
  topicTaxonomy.branches.map((branch) => [branch.key, branch.name]),
);
const METRICS: readonly ComparisonMetric[] = ['sim_accuracy', 'reviews', 'consistency'];

/** 14 de octubre, para la noche que calculó la foto */
const dayInWords = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

function rowLabel(row: ComparisonRow): string {
  return row.metric === 'sim_accuracy'
    ? row.branch === '*'
      ? text.total
      : (BRANCH_NAMES.get(row.branch) ?? row.branch)
    : text.metrics[row.metric];
}

function RowBody({ row, days }: { row: ComparisonRow; days: number }) {
  if (row.kind === 'group_calibrating') {
    return (
      <p role="status" className="flex items-start gap-1.5 text-sm text-fg-muted">
        <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-semibold">{text.calibratingLabel}.</span>{' '}
          {text.groupCalibrating(row.missing)}
        </span>
      </p>
    );
  }
  if (row.kind === 'own_calibrating') {
    return (
      <p role="status" className="flex items-start gap-1.5 text-sm text-fg-muted">
        <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-semibold">{text.calibratingLabel}.</span>{' '}
          {row.have !== null && row.need !== null
            ? text.ownCalibratingBranch(row.have, row.need)
            : text.ownCalibratingActivity(days)}
        </span>
      </p>
    );
  }
  const { percentile } = row;
  const sentence = text.sentence[row.metric];
  const title = percentile.below5
    ? text.below5
    : percentile.above95
      ? text.above95
      : text.percentile(percentile.band);
  return (
    <>
      <p className="text-sm font-semibold">{title}</p>
      <ProgressBar
        value={percentile.band}
        max={100}
        label={`${rowLabel(row)}. ${title}`}
        className="h-2"
      />
      <p className="text-sm text-fg-muted">
        {percentile.below5
          ? sentence.low(days)
          : percentile.above95
            ? sentence.high(days)
            : sentence.mid(percentile.band, days)}
      </p>
    </>
  );
}

function Rows({ view, days }: { view: ComparisonView; days: number }) {
  return (
    <div className="flex flex-col gap-4">
      {METRICS.map((metric) => {
        const rows = view.rows.filter((row) => row.metric === metric);
        if (rows.length === 0) return null;
        const id = `comparacion-${metric}`;
        return (
          <section key={metric} aria-labelledby={id} className="flex flex-col gap-1.5">
            <h3 id={id} className="eyebrow text-fg-muted">
              {text.metrics[metric]}
            </h3>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {rows.map((row) => (
                <li key={`${row.metric}|${row.branch}`} className="flex flex-col gap-1 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {row.metric === 'sim_accuracy' && row.branch !== '*' ? (
                      <BranchMark branch={row.branch} className="h-5" />
                    ) : null}
                    {rowLabel(row)}
                  </span>
                  <RowBody row={row} days={days} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function ComparisonCard({
  state,
  facts,
}: {
  state: ComparisonState;
  /** Lo que ya hizo el alumno, para su percentil. Se calcula en este navegador */
  facts: readonly ComparisonFact[];
}) {
  const [cohort, setCohort] = useState<ComparisonCohort>('all');
  const snapshot = state.status === 'ready' ? state.snapshot : null;
  const views = useMemo(
    () =>
      snapshot === null
        ? null
        : {
            all: buildComparisonView({
              snapshot,
              cohort: 'all',
              facts,
              minBranchAnswers: FACTORY_MODEL_SETTINGS.thresholds.minBranchAnswers,
              branchOrder: BRANCH_ORDER,
            }),
            specialty: buildComparisonView({
              snapshot,
              cohort: 'specialty',
              facts,
              minBranchAnswers: FACTORY_MODEL_SETTINGS.thresholds.minBranchAnswers,
              branchOrder: BRANCH_ORDER,
            }),
          },
    [snapshot, facts],
  );

  const days = snapshot?.windowDays ?? 30;
  const night = snapshot === null ? null : nightOf(snapshot);
  // El segundo grupo existe cuando el alumno eligió especialidad y la foto trae sus celdas
  const hasSpecialty = snapshot?.specialty !== null && snapshot?.specialty !== undefined;
  const shown = hasSpecialty ? cohort : 'all';
  const view = views?.[shown];
  const specialtyName =
    snapshot?.specialty == null
      ? null
      : (SPECIALTIES.find(([key]) => key === snapshot.specialty)?.[1] ?? snapshot.specialty);

  return (
    <Card aria-labelledby="comparacion-titulo">
      <CardHeader className="mb-3">
        <CardTitle id="comparacion-titulo" className="flex flex-wrap items-center gap-2">
          {text.title}
          {state.status === 'ready' && state.source === 'demo' ? <SimulatedDataLabel /> : null}
        </CardTitle>
        <CardDescription>{text.description(days)}</CardDescription>
      </CardHeader>

      {state.status === 'loading' ? <LoadingState label={text.loading} /> : null}
      {state.status === 'unavailable' ? (
        <p role="status" className="flex items-start gap-1.5 text-sm text-fg-muted">
          <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{text.unavailable[state.reason]}</span>
        </p>
      ) : null}

      {state.status === 'ready' && view ? (
        <div className="flex flex-col gap-4">
          {hasSpecialty ? (
            <SegmentedControl
              label={text.cohortsLabel}
              options={[
                { value: 'all' as const, label: text.cohorts.all },
                {
                  value: 'specialty' as const,
                  label: text.cohorts.specialty,
                },
              ]}
              value={shown}
              onChange={setCohort}
            />
          ) : (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
              {text.noSpecialty}
              <Button asChild variant="link" size="sm" className="px-0">
                <Link to={settingsPath('perfil')}>{text.goToData}</Link>
              </Button>
            </p>
          )}
          {shown === 'specialty' && specialtyName !== null ? (
            <p className="text-sm font-medium">{text.specialtyFor(specialtyName)}</p>
          ) : null}
          {view.rows.length === 0 ? (
            <p role="status" className="flex items-start gap-1.5 text-sm text-fg-muted">
              <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">{text.calibratingLabel}.</span> {text.emptyGroup}
              </span>
            </p>
          ) : (
            <Rows view={view} days={days} />
          )}
          {state.source === 'demo' ? (
            <p className="text-sm text-fg-muted">{text.simulated}</p>
          ) : null}
          {night !== null ? (
            <p className="text-xs text-fg-muted">{text.calculated(dayInWords(night))}</p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 text-sm text-fg-muted">{text.footer}</p>
    </Card>
  );
}
