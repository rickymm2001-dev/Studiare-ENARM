// Conócete (D-074). Muestra el informe del motor de autoconocimiento en tres áreas con un resumen
// de fortalezas y focos. Cada hallazgo dice qué se ve en tus datos y qué hacer al respecto.
import { CheckCircle2, Eye, Hourglass, Lightbulb, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { biasTaxonomy, biasTips } from '@/demo/content';
import type { Insight, InsightArea, InsightLevel, InsightReport } from '@/engines/insights';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';

const text = t.insights;
const biasByKey = new Map(biasTaxonomy.biases.map((bias) => [bias.key, bias]));
const tipByKey = new Map(biasTips.tips.map((tip) => [tip.biasKey, tip.tip]));

const levelStyle: Record<InsightLevel, { icon: ReactNode; chip: string; border: string }> = {
  strength: {
    icon: <CheckCircle2 aria-hidden />,
    chip: 'bg-success-soft text-success',
    border: 'border-l-success',
  },
  watch: {
    icon: <Eye aria-hidden />,
    chip: 'bg-warning-soft text-warning',
    border: 'border-l-warning',
  },
  focus: {
    icon: <Target aria-hidden />,
    chip: 'bg-danger-soft text-danger',
    border: 'border-l-danger',
  },
};

/** Título, frase y acción de un hallazgo listo */
function describe(insight: Insight): { title: string; body: string; action: string } {
  const state = insight.state;
  const values = state.kind === 'ready' ? state.values : {};
  const refs = state.kind === 'ready' ? state.refs : {};
  const level = state.kind === 'ready' ? state.level : 'watch';
  if (insight.id.startsWith('bias:')) {
    const tag = insight.id.slice(5);
    const bias = biasByKey.get(tag);
    return {
      title: bias?.name ?? tag,
      body: `${text.biasText(values.attraction ?? 0, values.baseline ?? 0)} ${bias?.distractorDefinition ?? ''}`,
      action: tipByKey.get(tag) ?? text.biasFallbackAction,
    };
  }
  const copy = text.copy[insight.id];
  if (!copy) return { title: insight.id, body: '', action: '' };
  return {
    title: copy.title,
    body: copy.text(values, refs, level),
    action: copy.action(values, refs, level),
  };
}

export function InsightsPanel({ report }: { report: InsightReport }) {
  const areas: InsightArea[] = ['exam', 'traps', 'study'];
  return (
    <section aria-labelledby="conocete-titulo" className="flex flex-col gap-4">
      <div>
        <h2 id="conocete-titulo" className="font-display text-xl font-extrabold">
          {text.title}
        </h2>
        <p className="text-sm text-fg-muted">{text.description}</p>
        <p className="mt-1 text-xs text-fg-muted">{text.disclaimer}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SummaryList
          title={text.focus}
          items={report.focus.slice(0, 4)}
          empty={text.noFocus}
          level="focus"
        />
        <SummaryList
          title={text.strengths}
          items={report.strengths.slice(0, 4)}
          empty={text.noStrengths}
          level="strength"
        />
      </div>

      {areas.map((area) => {
        const items = report.insights.filter(
          (insight) => insight.area === area && insight.id !== 'bias_profile',
        );
        const profile = report.insights.find((insight) => insight.id === 'bias_profile');
        return (
          <Card key={area} aria-labelledby={`area-${area}`}>
            <CardHeader>
              <CardTitle id={`area-${area}`}>{text.areas[area].title}</CardTitle>
              <CardDescription>{text.areas[area].hint}</CardDescription>
            </CardHeader>
            {items.some((insight) => insight.state.kind === 'ready') ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items
                  .filter((insight) => insight.state.kind === 'ready')
                  .map((insight) => (
                    <InsightItem key={insight.id} insight={insight} />
                  ))}
              </div>
            ) : null}
            {area === 'traps' && profile ? <BiasProfile insight={profile} /> : null}
            <CalibratingList
              items={items.filter((insight) => insight.state.kind === 'calibrating')}
            />
          </Card>
        );
      })}
    </section>
  );
}

function SummaryList({
  title,
  items,
  empty,
  level,
}: {
  title: string;
  items: Insight[];
  empty: string;
  level: InsightLevel;
}) {
  const style = levelStyle[level];
  return (
    <Card className={cn('border-l-4', style.border)}>
      <h3 className="mb-2 flex items-center gap-2 font-semibold [&_svg]:size-5">
        <span className={level === 'focus' ? 'text-danger' : 'text-success'}>{style.icon}</span>
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {items.map((insight) => {
            const { title: name, action } = describe(insight);
            return (
              <li key={insight.id}>
                <span className="font-semibold">{name}.</span>{' '}
                <span className="text-fg-muted">{action}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function InsightItem({ insight }: { insight: Insight }) {
  const state = insight.state;
  if (state.kind === 'calibrating') {
    const title = insight.id.startsWith('bias')
      ? text.copy.biases?.title
      : text.copy[insight.id]?.title;
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold">{title ?? insight.id}</h4>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-fg-muted [&_svg]:size-3.5">
            <Hourglass aria-hidden />
            {text.calibratingLabel}
          </span>
        </div>
        <p className="text-sm text-fg-muted">
          {text.calibrating(state.have, state.need, state.unit)}
        </p>
        <ProgressBar
          value={Math.min(state.have, state.need)}
          max={Math.max(state.need, 1)}
          label={text.calibrating(state.have, state.need, state.unit)}
        />
      </div>
    );
  }
  const style = levelStyle[state.level];
  const { title, body, action } = describe(insight);
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-l-4 border-line p-3',
        style.border,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold">{title}</h4>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold [&_svg]:size-3.5',
            style.chip,
          )}
        >
          {style.icon}
          {text.levels[state.level]}
        </span>
      </div>
      <p className="text-sm">{body}</p>
      <p className="mt-auto flex gap-1.5 rounded-md bg-muted p-2 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
        <Lightbulb aria-hidden className="text-primary" />
        <span>
          <span className="sr-only">{text.whatToDo}. </span>
          {action}
        </span>
      </p>
    </div>
  );
}

function BiasProfile({ insight }: { insight: Insight }) {
  if (insight.state.kind !== 'ready') return null;
  const { values, refs } = insight.state;
  const rows = [0, 1, 2].flatMap((index) => {
    const tag = refs[`tag${index}`];
    return tag ? [{ tag, share: values[`share${index}`] ?? 0 }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      <h4 className="font-semibold">{text.profileTitle}</h4>
      <p className="text-sm text-fg-muted">{text.profileHint}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.tag} className="flex flex-col gap-1 rounded-lg border border-line p-3">
            <span className="text-sm font-semibold">{biasByKey.get(row.tag)?.name ?? row.tag}</span>
            <ProgressBar value={row.share * 100} max={100} label={text.profileShare(row.share)} />
            <span className="text-xs text-fg-muted">{text.profileShare(row.share)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lecturas que siguen calibrando, en una lista compacta para no llenar la pantalla */
function CalibratingList({ items }: { items: Insight[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-dashed border-line p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg-muted [&_svg]:size-4">
        <Hourglass aria-hidden />
        {text.calibratingLabel}
      </p>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((insight) => {
          if (insight.state.kind !== 'calibrating') return null;
          const { have, need, unit } = insight.state;
          const title = insight.id.startsWith('bias')
            ? text.copy.biases?.title
            : text.copy[insight.id]?.title;
          return (
            <li key={insight.id} className="flex flex-col gap-1 text-sm">
              <span className="flex justify-between gap-2">
                <span className="font-medium">{title ?? insight.id}</span>
                <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                  {Math.min(have, need)}/{need}
                </span>
              </span>
              <ProgressBar
                value={Math.min(have, need)}
                max={Math.max(need, 1)}
                label={text.calibrating(have, need, unit)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
