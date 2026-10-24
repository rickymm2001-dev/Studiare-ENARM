// Indicadores clave, sesgos que te atrapan y temas por reforzar (D-150). Los indicadores salen del
// informe de Conócete (indicatorsView.ts), los sesgos del perfil de trampas del mismo informe y los
// temas del modelo del alumno, los mismos que usan las tarjetas de abajo y los widgets de Inicio.
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { InsightReport } from '@/engines/insights';
import type { WeakTopic } from '@/engines/studentModel';
import type { TopicMastery } from '@/engines/topics';
import { t } from '@/i18n/es-MX';
import type { Vocabulary } from '@/i18n/vocabulary';
import { toneClasses } from '@/ui/branches';
import { RangeBar } from '@/ui/charts/range-bar';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardTitle } from '@/ui/components/card';
import { IndicatorCard } from '@/ui/components/indicator-card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { CalibratingNote } from '@/ui/states/states';
import { topicsCalibration } from './analysis';
import { biasCalibration, biasProfileRows } from './focusItems';
import type { IndicatorRow } from './indicatorsView';
import { masteryDot } from './masteryChip';

// ============================================================================ Indicadores clave

export function IndicatorsSection({
  rows,
  className,
}: {
  rows: readonly IndicatorRow[];
  className?: string;
}) {
  const text = t.progress.indicators;
  return (
    <section aria-labelledby="indicadores-titulo" className={cn('flex flex-col gap-3', className)}>
      <h2 id="indicadores-titulo" className="group-title">
        {text.title}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) =>
          row.kind === 'ready' ? (
            <IndicatorCard
              key={row.key}
              title={text.names[row.key]}
              state={row.state}
              tone={row.tone}
              value={row.value}
              unit={row.unit}
              note={row.note}
            >
              <RangeBar
                zones={row.zones}
                position={row.position}
                label={text.bar(text.names[row.key], `${row.value} ${row.unit}`)}
              />
            </IndicatorCard>
          ) : (
            <IndicatorCard
              key={row.key}
              title={text.names[row.key]}
              state={text.calibrating}
              tone="calibrating"
              value="—"
              note={row.note}
            >
              <ProgressBar
                value={row.have}
                max={Math.max(row.need, 1)}
                label={row.note}
                className="my-1"
              />
            </IndicatorCard>
          ),
        )}
      </div>
    </section>
  );
}

// ============================================================================ Sesgos que te atrapan

export function BiasesCard({
  report,
  vocabulary,
  className,
}: {
  report: InsightReport;
  vocabulary: Vocabulary;
  className?: string;
}) {
  const text = t.progress.biases;
  const calibration = biasCalibration(report);
  const rows = biasProfileRows(report);
  return (
    <Card
      tone="panel"
      aria-labelledby="sesgos-titulo"
      className={cn('flex flex-col gap-3', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <CardTitle id="sesgos-titulo">{text.title[vocabulary]}</CardTitle>
        {calibration ? <Badge variant="warning">{t.insights.calibratingLabel}</Badge> : null}
      </div>
      {calibration ? (
        <CalibratingNote
          current={calibration.have}
          target={calibration.need}
          unit={t.widgets.biasPattern.unit}
          className="bg-surface"
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.widgets.biasPattern.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.tag} className="flex flex-col gap-1.5 rounded-md bg-surface px-3.5 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <strong className="truncate">{row.name}</strong>
                  {row.pattern ? <Badge>{text.pattern}</Badge> : null}
                </span>
                <strong className="shrink-0 text-heading tabular-nums">
                  {Math.round(row.share * 100)} %
                </strong>
              </div>
              <ProgressBar
                value={row.share * 100}
                max={100}
                label={t.widgets.biasPattern.row(row.name, row.share)}
                className="h-2"
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ============================================================================ Temas por reforzar

/** Cuántos temas caben en la tarjeta. El resto vive en las ramas y en los focos de abajo */
const WEAK_TOPICS_SHOWN = 4;

export function WeakTopicsCard({
  weakTopics,
  byTopic,
  minResponses,
  className,
}: {
  weakTopics: readonly WeakTopic[];
  byTopic: ReadonlyMap<string, TopicMastery>;
  /** Respuestas que pide un tema para mostrar su dominio */
  minResponses: number;
  className?: string;
}) {
  const text = t.progress.weakTopics;
  const calibration = topicsCalibration(byTopic, minResponses);
  const topics = weakTopics.slice(0, WEAK_TOPICS_SHOWN);
  return (
    <Card
      tone="cream"
      aria-labelledby="reforzar-titulo"
      className={cn('flex flex-col gap-3', className)}
    >
      <CardTitle id="reforzar-titulo">{text.title}</CardTitle>
      {calibration ? (
        <CalibratingNote
          current={calibration.have}
          target={calibration.need}
          unit={t.widgets.weakTopics.unit}
          className="bg-surface"
        />
      ) : topics.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.widgets.weakTopics.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {topics.map((topic) => (
            <li key={topic.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn('size-2.5 shrink-0 rounded-full', toneClasses(topic.branch).bar)}
                />
                {/* El nombre lleva a practicar ese tema en el simulador, como los focos de la semana */}
                <Link
                  to={`${screenPath('simulatorSetup')}?topic=${encodeURIComponent(topic.key)}`}
                  aria-label={text.practice(topic.name)}
                  className="truncate font-medium underline-offset-4 hover:underline"
                >
                  {topic.name}
                </Link>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 font-bold tabular-nums">
                <span aria-hidden className={masteryDot(topic.mastery)} />
                <span className="sr-only">{t.progress.masteryLabel} </span>
                {Math.round(topic.mastery * 100)} %
              </span>
            </li>
          ))}
        </ul>
      )}
      {calibration || topics.length === 0 ? null : (
        <Button asChild className="self-start">
          <Link to={screenPath('simulatorSetup')}>{text.simulate}</Link>
        </Button>
      )}
    </Card>
  );
}
