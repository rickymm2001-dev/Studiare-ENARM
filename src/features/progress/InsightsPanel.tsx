// Conócete (D-074, D-078). Arriba tus focos de la semana, cada uno con un atajo para practicarlo.
// Abajo las lecturas del motor de autoconocimiento en tres áreas, cada una como una fila de una
// línea con su estado que se abre al tocarla para ver qué se ve en tus datos y qué hacer.
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  Hourglass,
  Lightbulb,
  ListOrdered,
  Play,
  Target,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  INSIGHT_MINIMUMS,
  type Insight,
  type InsightArea,
  type InsightLevel,
  type InsightReport,
} from '@/engines/insights';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { DraftBadge } from '../shared/DraftBadge';
import {
  biasProfileRows,
  describeInsight,
  weeklyFocusItems,
  type BiasProfileRow as BiasProfileRowData,
  type WeakTopic,
} from './focusItems';

const text = t.insights;
const levelStyle: Record<InsightLevel, { icon: ReactNode; chip: string; color: string }> = {
  strength: {
    icon: <CheckCircle2 aria-hidden />,
    chip: 'bg-success-soft text-success',
    color: 'text-success',
  },
  watch: { icon: <Eye aria-hidden />, chip: 'bg-warning-soft text-warning', color: 'text-warning' },
  focus: { icon: <Target aria-hidden />, chip: 'bg-danger-soft text-danger', color: 'text-danger' },
};
const levelOrder: Record<InsightLevel, number> = { focus: 0, watch: 1, strength: 2 };

const calibratingTitle = (insight: Insight) =>
  (insight.id.startsWith('bias') ? text.copy.biases?.title : text.copy[insight.id]?.title) ??
  insight.id;

/**
 * Tus focos de la semana. Hasta 3, mezclando técnica y la subespecialidad más débil cuando hay una
 * con dominio bajo. Cada uno lleva a practicarlo
 */
export function WeeklyFocus({
  report,
  weakTopics,
}: {
  report: InsightReport;
  weakTopics: readonly WeakTopic[];
}) {
  const items = weeklyFocusItems(report, weakTopics);
  return (
    <Card aria-labelledby="focos-titulo" className="border-l-4 border-l-danger">
      <CardHeader className="mb-3">
        <CardTitle id="focos-titulo" className="flex items-center gap-2 [&_svg]:size-5">
          <Target aria-hidden className="text-danger" />
          {t.progress.focusTitle(items.length)}
        </CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {report.totals.answers < INSIGHT_MINIMUMS.answers
            ? t.progress.focusCalibrating(report.totals.answers, INSIGHT_MINIMUMS.answers)
            : text.noFocus}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li key={item.key} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-danger-soft text-xs font-bold text-danger"
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                      {item.kind}
                    </p>
                    <p className="leading-snug font-semibold">{item.title}</p>
                  </div>
                  <Button asChild size="sm" variant="secondary" className="shrink-0">
                    <Link to={item.to}>
                      <Play aria-hidden />
                      {item.review ? t.progress.reviewNow : t.progress.practice}
                      <span className="sr-only">. {item.title}</span>
                    </Link>
                  </Button>
                </div>
                <p className="text-sm text-fg-muted">{item.action}</p>
                {item.draft ? <DraftBadge /> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function InsightsPanel({ report }: { report: InsightReport }) {
  const areas: InsightArea[] = ['exam', 'traps', 'study'];
  const profileRows = biasProfileRows(report);
  return (
    <Card aria-labelledby="conocete-titulo">
      <CardHeader className="mb-3">
        <CardTitle id="conocete-titulo">{text.title}</CardTitle>
        <CardDescription>{text.disclaimer}</CardDescription>
      </CardHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        {areas.map((area) => {
          const items = report.insights.filter(
            (insight) => insight.area === area && insight.id !== 'bias_profile',
          );
          const readyItems = items
            .filter((insight) => insight.state.kind === 'ready')
            .sort(
              (a, b) =>
                (a.state.kind === 'ready' ? levelOrder[a.state.level] : 3) -
                (b.state.kind === 'ready' ? levelOrder[b.state.level] : 3),
            );
          const waiting = items.filter((insight) => insight.state.kind === 'calibrating');
          return (
            <section
              key={area}
              aria-labelledby={`area-${area}`}
              className="flex min-w-0 flex-col gap-1.5"
            >
              <h3
                id={`area-${area}`}
                title={text.areas[area].hint}
                className="text-xs font-bold tracking-wide text-fg-muted uppercase"
              >
                {text.areas[area].title}
              </h3>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {readyItems.map((insight) => (
                  <li key={insight.id}>
                    <InsightRow insight={insight} />
                  </li>
                ))}
                {area === 'traps' ? <BiasProfileRow rows={profileRows} /> : null}
                {waiting.map((insight) => (
                  <li key={insight.id}>
                    <CalibratingRow insight={insight} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

/** Fila plegable de una lectura. El resumen cabe en una línea y el detalle se abre al tocarla */
function Row({
  lead,
  title,
  tail,
  children,
}: {
  lead: ReactNode;
  title: string;
  tail: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 px-3 py-1.5 hover:bg-muted [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="shrink-0 [&_svg]:size-4">
          {lead}
        </span>
        <span className="min-w-0 flex-1 text-sm leading-snug font-medium">{title}</span>
        {tail}
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3 text-sm">{children}</div>
    </details>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  if (insight.state.kind !== 'ready') return null;
  const style = levelStyle[insight.state.level];
  const { title, body, action, draft } = describeInsight(insight);
  return (
    <Row
      lead={<span className={style.color}>{style.icon}</span>}
      title={title}
      tail={
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', style.chip)}>
          {text.levels[insight.state.level]}
        </span>
      }
    >
      <p>{body}</p>
      <p className="flex gap-1.5 rounded-md bg-muted p-2 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
        <Lightbulb aria-hidden className="text-primary" />
        <span>
          <span className="sr-only">{text.whatToDo}. </span>
          {action}
          {draft ? <DraftBadge className="ml-2" /> : null}
        </span>
      </p>
    </Row>
  );
}

function CalibratingRow({ insight }: { insight: Insight }) {
  if (insight.state.kind !== 'calibrating') return null;
  const { have, need, unit } = insight.state;
  return (
    <Row
      lead={<Hourglass className="text-fg-muted" />}
      title={calibratingTitle(insight)}
      tail={
        <span className="shrink-0 text-xs text-fg-muted tabular-nums">
          <span className="sr-only">{text.calibratingLabel} </span>
          {Math.min(have, need)}/{need}
        </span>
      }
    >
      <p className="text-fg-muted">
        {text.calibratingLabel}. {text.calibrating(have, need, unit)}
      </p>
      <ProgressBar
        value={Math.min(have, need)}
        max={Math.max(need, 1)}
        label={text.calibrating(have, need, unit)}
      />
    </Row>
  );
}

function BiasProfileRow({ rows }: { rows: readonly BiasProfileRowData[] }) {
  if (rows.length === 0) return null;
  return (
    <li>
      <Row lead={<ListOrdered className="text-primary" />} title={text.profileTitle} tail={null}>
        <p className="text-fg-muted">{text.profileHint}</p>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.tag} className="flex flex-col gap-1">
              <span className="flex justify-between gap-2">
                <span className="font-semibold">{row.name}</span>
                <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                  {Math.round(row.share * 100)}%
                </span>
              </span>
              <ProgressBar value={row.share * 100} max={100} label={text.profileShare(row.share)} />
            </li>
          ))}
        </ul>
      </Row>
    </li>
  );
}
