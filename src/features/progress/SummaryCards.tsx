// La fila de cifras de Progreso (D-150). Aciertos de 30 días con su cambio y su línea, retención de
// tarjetas maduras contra la meta, preguntas de 30 días con las barras de los últimos días y la racha
// en durazno con la actividad reciente. Cada cifra sale de un motor y dice calibrando con su umbral
// mientras no llega, nunca un número inventado.
import { BookOpenCheck, Flame, ListChecks, Target } from 'lucide-react';
import type { InsightReport } from '@/engines/insights';
import { INSIGHT_MINIMUMS } from '@/engines/insights';
import {
  accuracyDelta,
  percentOf,
  relativeDelta,
  SUMMARY_THRESHOLDS,
  SUMMARY_WINDOW,
  type ProgressSummary,
} from '@/engines/progressSummary';
import type { StreakState } from '@/engines/streak';
import { t } from '@/i18n/es-MX';
import { RangeBar } from '@/ui/charts/range-bar';
import { Sparkline } from '@/ui/charts/sparkline';
import { cn } from '@/ui/cn';
import { Card } from '@/ui/components/card';
import { StatCard } from '@/ui/components/stat-card';

const text = t.progress.summary;

/** La cifra mientras calibra, en lugar del número grande */
function Calibrating() {
  return <span className="text-lg font-bold text-fg-muted">{text.calibrating}</span>;
}

/** Barras chicas de una serie, con la más alta en marino y las demás en cielo. Lee como imagen */
function MiniBars({
  values,
  label,
  barClass,
  peakClass,
  className,
}: {
  values: readonly number[];
  label: string;
  barClass: string;
  peakClass: string;
  className?: string;
}) {
  const max = Math.max(...values, 1);
  const peak = values.indexOf(Math.max(...values));
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('grid h-14 items-end gap-1.5', className)}
      style={{ gridTemplateColumns: `repeat(${String(values.length)}, minmax(0, 1fr))` }}
    >
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(
            'block min-h-0.5 rounded-sm',
            index === peak && value > 0 ? peakClass : barClass,
          )}
          style={{ height: `${String(Math.max((value / max) * 100, value > 0 ? 6 : 2))}%` }}
        />
      ))}
    </div>
  );
}

export function SummaryCards({
  summary,
  report,
  desiredRetention,
  streak,
}: {
  summary: ProgressSummary;
  report: InsightReport;
  /** La retención que pide el alumno a FSRS, de 0 a 1 */
  desiredRetention: number;
  streak: StreakState;
}) {
  const { accuracy, questions, activity } = summary;
  const accuracyPercent =
    accuracy.current.answered >= SUMMARY_THRESHOLDS.answers ? percentOf(accuracy.current) : null;
  const accuracyChange = accuracyDelta(accuracy.current, accuracy.previous);
  const retention = report.insights.find((insight) => insight.id === 'retention');
  const questionsChange = relativeDelta(questions.current, questions.previous);
  const desiredPercent = Math.round(desiredRetention * 100);
  return (
    <section
      aria-label={text.label}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatCard
        icon={<Target />}
        title={text.accuracy}
        value={accuracyPercent === null ? <Calibrating /> : `${String(accuracyPercent)} %`}
        {...(accuracyChange === null
          ? {}
          : {
              delta: {
                text: text.accuracyDelta(accuracyChange),
                direction: accuracyChange > 0 ? 'up' : accuracyChange < 0 ? 'down' : 'flat',
              },
            })}
        caption={
          accuracyPercent === null
            ? text.calibratingAnswers(accuracy.current.answered, SUMMARY_THRESHOLDS.answers)
            : undefined
        }
      >
        {accuracy.trend.length >= 3 ? (
          <Sparkline
            values={accuracy.trend}
            strokeClass="stroke-indicator"
            fillClass="fill-indicator"
            height={56}
            label={text.accuracyTrendLabel(SUMMARY_WINDOW.trendDays)}
          />
        ) : null}
      </StatCard>

      <StatCard
        icon={<BookOpenCheck />}
        title={text.retention}
        value={
          retention?.state.kind === 'ready' ? (
            `${String(Math.round((retention.state.values.retention ?? 0) * 100))} %`
          ) : (
            <Calibrating />
          )
        }
        caption={
          retention?.state.kind === 'ready'
            ? text.retentionGoal(desiredPercent)
            : text.calibratingReviews(
                retention?.state.kind === 'calibrating' ? retention.state.have : 0,
                retention?.state.kind === 'calibrating'
                  ? retention.state.need
                  : INSIGHT_MINIMUMS.reviews,
              )
        }
      >
        {retention?.state.kind === 'ready' ? (
          <RangeBar
            zones={['bad', 'mid', 'good']}
            position={Math.round((retention.state.values.retention ?? 0) * 100)}
            label={`${text.retention}, ${String(Math.round((retention.state.values.retention ?? 0) * 100))} %. ${text.retentionGoal(desiredPercent)}`}
            ticks={['0', `${String(desiredPercent)} %`, '100']}
          />
        ) : null}
      </StatCard>

      <StatCard
        icon={<ListChecks />}
        title={text.questions}
        value={questions.current.toLocaleString('es-MX')}
        {...(questionsChange === null
          ? {}
          : {
              delta: {
                text: text.questionsDelta(questionsChange),
                direction: questionsChange > 0 ? 'up' : questionsChange < 0 ? 'down' : 'flat',
              },
            })}
        caption={text.questionsCaption}
      >
        <MiniBars
          values={questions.byDay}
          label={text.questionsBarsLabel(
            SUMMARY_WINDOW.questionDays,
            questions.byDay.reduce((sum, value) => sum + value, 0),
          )}
          barClass="bg-chart-scheduled"
          peakClass="bg-chart-done"
        />
      </StatCard>

      <StreakCard streak={streak} activity={activity} />
    </section>
  );
}

/**
 * La racha en durazno, con la misma forma que StatCard. Va aparte porque sus colores son los del
 * acento cálido y no los de las otras tarjetas
 */
function StreakCard({ streak, activity }: { streak: StreakState; activity: readonly number[] }) {
  return (
    <Card className="flex flex-col gap-3 border-accent-soft bg-accent-soft text-accent-ink">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent [&_svg]:size-5"
        >
          <Flame />
        </span>
        <h3 className="min-w-0 truncate text-base font-bold">{text.streak}</h3>
      </div>
      <p className="text-3xl leading-none font-extrabold tracking-tight tabular-nums">
        {streak.current.toLocaleString('es-MX')} {text.streakDays(streak.current)}
      </p>
      <MiniBars
        values={activity}
        label={text.streakBarsLabel(SUMMARY_WINDOW.activityDays)}
        barClass="bg-accent"
        peakClass="bg-accent"
        className="gap-1"
      />
      <p className="text-xs">{text.streakBest(streak.best)}</p>
    </Card>
  );
}
