// Análisis de Inicio (D-116). Temas para reforzar y sesgos o trampas que te hacen fallar. Cada uno dice
// lo mismo que Progreso pero en chico, usa los mismos motores y muestra calibrando, con cuánto falta,
// hasta tener datos suficientes (4.3).
import { Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { AppEvent } from '@/data/schemas/events';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
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
  if (topics.length === 0)
    return (
      <p className="text-sm text-fg-muted">
        {branch === ALL_BRANCHES ? text.none : text.noneInBranch}
      </p>
    );

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-fg-muted">{text.hint}</p>
      {/* La rama se lee por su nombre, sin barra de color (H20 de la revisión de B2), y el
          porcentaje va en texto neutro con el color solo en un punto (H02) */}
      <ul className="flex flex-col divide-y divide-line">
        {topics.map((topic) => (
          <li key={topic.key} className="flex items-center gap-2 py-1.5">
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{topic.name}</span>
              <span className="truncate text-xs text-fg-muted">{topic.branchName}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tabular-nums">
              <span aria-hidden className={masteryDot(topic.mastery)} />
              <span className="sr-only">{t.progress.masteryLabel} </span>
              {Math.round(topic.mastery * 100)}%
            </span>
            <Button asChild variant="secondary" size="icon" className="shrink-0">
              <Link
                to={`${screenPath('simulatorSetup')}?topic=${encodeURIComponent(topic.key)}`}
                aria-label={text.practice(topic.name)}
              >
                <Play aria-hidden />
              </Link>
            </Button>
          </li>
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
      <p className="text-xs text-fg-muted">{text.hint}</p>
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
