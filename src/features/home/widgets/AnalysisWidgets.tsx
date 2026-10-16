// Análisis de Inicio (D-116). Temas para reforzar y sesgos o trampas que te hacen fallar. Cada uno dice
// lo mismo que Progreso pero en chico, porque salen del mismo modelo del alumno (B14), y muestra calibrando,
// con cuánto falta, hasta tener datos suficientes (4.3). Los temas van del que más urge reforzar al que
// menos, con el peso de las tarjetas que se olvidan, y dicen cuándo le cuestan a la mayoría de los alumnos.
import { BookOpenCheck, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { StudentModel } from '@/data/model/contracts';
import type { AppEvent } from '@/data/schemas/events';
import type { WeakTopic } from '@/engines/studentModel';
import { t } from '@/i18n/es-MX';
import { modelTexts } from '@/i18n/model';
import { Badge } from '@/ui/components/badge';
import { BranchMark } from '@/ui/components/branch-tag';
import { Button } from '@/ui/components/button';
import { ProgressBar } from '@/ui/components/progress-bar';
import { SkeletonRows } from '@/ui/components/skeleton';
import { CalibratingNote } from '@/ui/states/states';
import { topicsCalibration } from '../../progress/analysis';
import { biasCalibration, biasProfileRows } from '../../progress/focusItems';
import { masteryDot } from '../../progress/masteryChip';
import { useAnalysis } from '../../progress/useAnalysis';
import type { ReadySession } from '../../shared/RequireSession';
import { ALL_BRANCHES, readWeakTopicsSettings } from './analysisSettings';

interface AnalysisWidgetProps {
  session: ReadySession;
  events: readonly AppEvent[];
  /** Los ajustes guardados del widget, sin validar. Cada widget los lee con su lector */
  settings: Readonly<Record<string, unknown>>;
}

/**
 * Esqueleto con las filas que van a llegar y su misma altura, en lugar del texto de carga (H04 de
 * la revisión de diseño de B2). El aviso de carga solo lo oye el lector de pantalla
 */
function WidgetLoading({
  rows,
  rowClassName,
  className,
}: {
  rows: number;
  rowClassName: string;
  className?: string;
}) {
  return (
    <SkeletonRows
      label={t.states.loading.label}
      rows={rows}
      rowClassName={rowClassName}
      className={className}
    />
  );
}

/** Enlace chico al final del widget para ir a la pantalla completa */
function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button asChild variant="link" size="sm" className="self-start px-0">
      <Link to={to}>{children}</Link>
    </Button>
  );
}

/** Un tema a reforzar con su dominio, lo que dice el modelo de él y los atajos para practicarlo */
export function WeakTopicRow({
  topic,
  item,
}: {
  topic: WeakTopic;
  /** Lo que el modelo del alumno dice de este tema. Sin él, la fila solo trae lo básico */
  item?: StudentModel['reinforce'][number] | undefined;
}) {
  const text = t.widgets.weakTopics;
  // La rama se lee por su nombre, con la marca de su color al lado (D-128), y el porcentaje va en texto
  // neutro con el color de estado solo en un punto (H02)
  return (
    <li className="flex items-center gap-2 py-1.5">
      <BranchMark branch={topic.branch} className="h-8" />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{topic.name}</span>
        <span className="truncate text-xs text-fg-muted">{topic.branchName}</span>
        {item?.why === 'cards_fading' ? (
          <span className="text-xs text-fg-muted">{modelTexts.reinforce.fading}</span>
        ) : null}
        {item?.populationHard ? (
          <span className="text-xs text-fg-muted">{modelTexts.reinforce.hard}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tabular-nums">
        <span aria-hidden className={masteryDot(topic.mastery)} />
        <span className="sr-only">{t.progress.masteryLabel} </span>
        {Math.round(topic.mastery * 100)}%
      </span>
      {item?.action === 'review_cards' ? (
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link to={screenPath('review')} aria-label={modelTexts.reinforce.reviewCards(topic.name)}>
            <BookOpenCheck aria-hidden />
          </Link>
        </Button>
      ) : null}
      <Button asChild variant="secondary" size="icon" className="shrink-0">
        <Link
          to={`${screenPath('simulatorSetup')}?topic=${encodeURIComponent(topic.key)}`}
          aria-label={text.practice(topic.name)}
        >
          <Play aria-hidden />
        </Link>
      </Button>
    </li>
  );
}

export function WeakTopicsWidget({ session, events, settings }: AnalysisWidgetProps) {
  const text = t.widgets.weakTopics;
  const analysis = useAnalysis(session, events);
  const { count, branch } = readWeakTopicsSettings(settings);
  // Una línea por tema, de la altura de su fila con el botón de practicar
  if (!analysis) return <WidgetLoading rows={count} rowClassName="h-10" className="gap-4" />;

  // Con una rama elegida solo cuenta lo que se sabe de esa rama
  const calibration = topicsCalibration(
    analysis.byTopic,
    DEFAULT_THRESHOLDS.topics.minResponsesPerTopic,
    branch === ALL_BRANCHES ? null : branch,
  );
  if (calibration)
    return (
      <CalibratingNote current={calibration.have} target={calibration.need} unit={text.unit} />
    );

  const topics = analysis.weakTopics
    .filter((topic) => branch === ALL_BRANCHES || topic.branch === branch)
    .slice(0, count);
  const reinforce = new Map(analysis.model.model.reinforce.map((item) => [item.key, item]));
  if (topics.length === 0)
    return (
      <p className="text-sm text-fg-muted">
        {branch === ALL_BRANCHES ? text.none : text.noneInBranch}
      </p>
    );

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-fg-muted">{text.hint}</p>
      <ul className="flex flex-col divide-y divide-line">
        {topics.map((topic) => (
          <WeakTopicRow key={topic.key} topic={topic} item={reinforce.get(topic.key)} />
        ))}
      </ul>
      <SeeAll to={screenPath('progress')}>{text.seeAll}</SeeAll>
    </div>
  );
}

export function BiasPatternWidget({ session, events }: AnalysisWidgetProps) {
  const text = t.widgets.biasPattern;
  const analysis = useAnalysis(session, events);
  // Tres filas de nombre y barra, como las que va a mostrar
  if (!analysis) return <WidgetLoading rows={3} rowClassName="h-8" />;

  const calibration = biasCalibration(analysis.report);
  if (calibration)
    return (
      <CalibratingNote current={calibration.have} target={calibration.need} unit={text.unit} />
    );

  const rows = biasProfileRows(analysis.report);
  if (rows.length === 0) return <p className="text-sm text-fg-muted">{text.none}</p>;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        {text.hint}
        {analysis.model.model.bias.baseline === 'population'
          ? ` ${modelTexts.bias.populationNote}`
          : ''}
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.tag} className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
              {row.pattern ? <Badge>{text.pattern}</Badge> : null}
              <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                {Math.round(row.share * 100)}%
              </span>
            </span>
            <ProgressBar value={row.share * 100} max={100} label={text.row(row.name, row.share)} />
          </li>
        ))}
      </ul>
      <SeeAll to={screenPath('progress')}>{text.seeAll}</SeeAll>
    </div>
  );
}
