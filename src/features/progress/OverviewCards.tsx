// Las tarjetas grandes de arriba de Progreso (D-150). Aciertos por rama en barras con el color de
// cada rama, el pulso de estudio en medidor con sus partes, el perfil por rama en radar y las
// preguntas por día de la semana contra la semana pasada. Todo sale de los motores que ya usa la
// pantalla y calibra con su umbral donde falta.
import { Hourglass } from 'lucide-react';
import { branchSection } from '@/data/schemas/content';
import { topicTaxonomy } from '@/demo/content';
import type { PulseResult, PulseTone } from '@/engines/studyPulse';
import type { WeekComparison } from '@/engines/questionsByDay';
import type { CategoryMastery } from '@/engines/topics';
import type { WindowTally } from '@/engines/progressSummary';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { BarsVsLine } from '@/ui/charts/bars-vs-line';
import { Gauge } from '@/ui/charts/gauge';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { BranchRadar, type RadarAxis } from './BranchRadar';
import { MASTERY_GOAL } from './indicatorsView';

/** Las ramas clínicas en el orden de la taxonomía, que es el de los ejes del radar */
const CLINICAL_BRANCHES = topicTaxonomy.branches.filter(
  (branch) => branchSection(branch) === 'clinical',
);

const branchName = (key: string, fallback: string) => t.branchNames[key] ?? fallback;

// ============================================================================ Aciertos por rama

export function BranchAccuracyCard({
  byBranch,
  minResponses,
  className,
}: {
  byBranch: ReadonlyMap<string, CategoryMastery>;
  /** Respuestas que pide una rama para mostrar su dominio */
  minResponses: number;
  className?: string;
}) {
  const text = t.progress.branchAccuracy;
  const rows = CLINICAL_BRANCHES.map((branch) => {
    const entry = byBranch.get(branch.key);
    const state = entry?.state ?? null;
    return {
      key: branch.key,
      name: branchName(branch.key, branch.name),
      answered: entry?.tally.trials ?? 0,
      mastery: state?.kind === 'ready' ? Math.round(state.mastery * 100) : null,
      needed: state?.kind === 'calibrating' ? state.responsesNeeded : minResponses,
    };
  }).sort((a, b) => (b.mastery ?? -1) - (a.mastery ?? -1) || b.answered - a.answered);
  const withAnswers = rows.filter((row) => row.answered > 0);
  const fewest = withAnswers.length > 1 ? withAnswers.at(-1) : undefined;
  return (
    <Card aria-labelledby="aciertos-rama-titulo" className={cn('flex flex-col gap-4', className)}>
      <CardHeader className="mb-0">
        <CardTitle id="aciertos-rama-titulo">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {withAnswers.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const tone = toneClasses(row.key);
            return (
              <li
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)_4.5rem]"
              >
                <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
                  <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', tone.bar)} />
                  <span className="truncate">{row.name}</span>
                </span>
                {row.mastery === null ? (
                  <>
                    <div
                      role="img"
                      aria-label={text.calibrating(
                        row.name,
                        row.answered,
                        row.answered + row.needed,
                      )}
                      className="col-span-2 h-3.5 overflow-hidden rounded-full bg-muted sm:col-span-1"
                    />
                    <Badge className="justify-self-end [&_svg]:size-3.5 sm:justify-self-end">
                      <Hourglass aria-hidden />
                      {t.insights.calibratingLabel}
                    </Badge>
                  </>
                ) : (
                  <>
                    <div
                      role="img"
                      aria-label={text.bar(row.name, row.mastery)}
                      className="col-span-2 h-3.5 overflow-hidden rounded-full bg-muted sm:col-span-1"
                    >
                      <div
                        className={cn('h-full rounded-full', tone.bar)}
                        style={{ width: `${String(row.mastery)}%` }}
                      />
                    </div>
                    <span className="text-right text-sm font-bold text-heading tabular-nums">
                      {row.mastery} %
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {fewest ? (
        <p className="text-sm text-fg-muted">{text.fewest(fewest.name, fewest.answered)}</p>
      ) : null}
    </Card>
  );
}

// ============================================================================ Pulso de estudio

const PULSE_STROKE: Record<PulseTone, string> = {
  good: 'stroke-success',
  near: 'stroke-warning',
  low: 'stroke-danger',
};

const PULSE_TEXT: Record<PulseTone, string> = {
  good: 'text-success',
  near: 'text-warning',
  low: 'text-danger',
};

export function PulseCard({ pulse, className }: { pulse: PulseResult; className?: string }) {
  const text = t.progress.pulse;
  return (
    <Card
      tone="cream"
      aria-labelledby="pulso-titulo"
      className={cn('flex flex-col gap-4', className)}
    >
      <CardTitle id="pulso-titulo">{text.title}</CardTitle>
      <div className="flex flex-wrap items-center gap-5">
        <Gauge
          value={pulse.calibrating ? 0 : pulse.score}
          max={100}
          strokeClass={pulse.calibrating ? 'stroke-muted' : PULSE_STROKE[pulse.tone]}
          label={pulse.calibrating ? text.calibratingLabel : text.label(pulse.score)}
          width={200}
        >
          {pulse.calibrating ? (
            <span className="text-lg font-bold text-fg-muted">
              {t.progress.summary.calibrating}
            </span>
          ) : (
            <span className="text-3xl font-extrabold tracking-tight tabular-nums">
              {pulse.score}
              <span className="text-sm font-semibold text-fg-muted">{text.of100}</span>
            </span>
          )}
        </Gauge>
        <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
          {pulse.calibrating ? (
            <>
              <span className="text-xl font-extrabold text-fg-muted">
                {t.progress.summary.calibrating}
              </span>
              <span className="text-sm leading-relaxed">{text.calibratingHint}</span>
            </>
          ) : (
            <>
              <span className={cn('text-xl font-extrabold', PULSE_TEXT[pulse.tone])}>
                {text.tone[pulse.tone]}
              </span>
              <span className="text-sm leading-relaxed">{text.toneHint[pulse.tone]}</span>
            </>
          )}
        </div>
      </div>
      {pulse.calibrating ? (
        <p role="status" className="text-sm text-fg-muted">
          {text.needed(pulse.needed.activeDays, pulse.needed.answered, pulse.needed.reviews)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {(['consistency', 'accuracy', 'retention'] as const).map((part) => (
            <li key={part} className="flex justify-between gap-3">
              <span className="text-fg-muted">
                {text.part(text.parts[part], pulse.parts[part].max)}
              </span>
              <strong className="tabular-nums">{pulse.parts[part].points}</strong>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ============================================================================ Tu perfil por rama

/** Cuántas ramas con dominio listo pide el radar para dibujarse */
const RADAR_MIN_READY = 3;

export function BranchProfileCard({
  byBranch,
  before,
  minResponses,
  className,
}: {
  byBranch: ReadonlyMap<string, CategoryMastery>;
  /** Aciertos por rama de hace un mes, de 30 a 59 días atrás */
  before: ReadonlyMap<string, WindowTally>;
  /** Respuestas que pide una rama para contar en la serie de hace un mes */
  minResponses: number;
  className?: string;
}) {
  const text = t.progress.radar;
  const axes: RadarAxis[] = CLINICAL_BRANCHES.map((branch) => {
    const state = byBranch.get(branch.key)?.state;
    const past = before.get(branch.key);
    return {
      key: branch.key,
      label: text.short[branch.key] ?? branchName(branch.key, branch.name),
      value: state?.kind === 'ready' ? Math.round(state.mastery * 100) : null,
      before:
        past && past.answered >= minResponses
          ? Math.round((past.correct / past.answered) * 100)
          : null,
    };
  });
  const ready = axes.filter((axis) => axis.value !== null);
  const beforeReady = axes.filter((axis) => axis.before !== null);
  const describe = (pick: (axis: RadarAxis) => number | null) =>
    axes
      .flatMap((axis) => {
        const value = pick(axis);
        return value === null ? [] : [text.point(axis.label, value)];
      })
      .join(', ');
  return (
    <Card aria-labelledby="radar-titulo" className={cn('flex flex-col gap-3', className)}>
      <CardTitle id="radar-titulo">{text.title}</CardTitle>
      {ready.length < RADAR_MIN_READY ? (
        <p role="status" className="text-sm text-fg-muted">
          {text.calibrating(ready.length, RADAR_MIN_READY)}
        </p>
      ) : (
        <>
          <BranchRadar
            axes={axes}
            target={MASTERY_GOAL}
            label={text.label(
              `${describe((axis) => axis.value)}.`,
              beforeReady.length >= RADAR_MIN_READY ? `${describe((axis) => axis.before)}.` : null,
              MASTERY_GOAL,
            )}
            className="self-center"
          />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-sm bg-chart-done" />
              {text.you}
            </li>
            {beforeReady.length >= RADAR_MIN_READY ? (
              <li className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-3 rounded-sm bg-indicator opacity-40" />
                {text.before}
              </li>
            ) : null}
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="w-3 border-t-2 border-dashed border-chart-compare" />
              {text.target(MASTERY_GOAL)}
            </li>
          </ul>
        </>
      )}
    </Card>
  );
}

// ============================================================================ Preguntas por día

export function WeekdayCard({ week, className }: { week: WeekComparison; className?: string }) {
  const text = t.progress.weekday;
  const diff = week.totalCurrent - week.totalPrevious;
  return (
    <Card aria-labelledby="semana-dias-titulo" className={cn('flex flex-col gap-3', className)}>
      <CardTitle id="semana-dias-titulo">{text.title}</CardTitle>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-3xl leading-none font-extrabold tracking-tight tabular-nums">
          {week.totalCurrent.toLocaleString('es-MX')}
        </span>
        <span
          className={cn(
            'text-sm font-bold',
            diff > 0 ? 'text-success' : diff < 0 ? 'text-danger' : 'text-fg-muted',
          )}
        >
          {diff > 0 ? text.more(diff) : diff < 0 ? text.fewer(-diff) : text.same}
        </span>
        <span className="text-sm text-fg-muted">{text.compare(week.averageCurrent)}</span>
      </p>
      <BarsVsLine
        current={week.current}
        previous={week.previous}
        labels={text.days}
        caption={text.caption}
        currentName={text.thisWeek}
        previousName={text.lastWeek}
      />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm bg-chart-scheduled" />
          {text.thisWeek}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full border-2 border-chart-compare" />
          {text.lastWeek}
        </li>
      </ul>
    </Card>
  );
}
