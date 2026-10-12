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
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { ProgressBar } from '@/ui/components/progress-bar';
import { CalibratingNote } from '@/ui/states/states';
import { topicsCalibration } from '../../progress/analysis';
import { biasCalibration, biasProfileRows } from '../../progress/focusItems';
import { masteryChip } from '../../progress/masteryChip';
import { useAnalysis } from '../../progress/useAnalysis';
import type { ReadySession } from '../../shared/RequireSession';
import { ALL_BRANCHES, readWeakTopicsSettings } from './analysisSettings';

interface AnalysisWidgetProps {
  session: ReadySession;
  events: readonly AppEvent[];
  /** Los ajustes guardados del widget, sin validar. Cada widget los lee con su lector */
  settings: Readonly<Record<string, unknown>>;
}

function WidgetLoading() {
  return (
    <p role="status" className="text-sm text-fg-muted">
      {t.states.loading.label}
    </p>
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
  if (!analysis) return <WidgetLoading />;

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
      <ul className="flex flex-col divide-y divide-line">
        {topics.map((topic) => (
          <li key={topic.key} className="flex items-center gap-2 py-1.5">
            <span
              aria-hidden
              className={cn('h-8 w-1 shrink-0 rounded-full', toneClasses(topic.branch).bar)}
            />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{topic.name}</span>
              <span className="truncate text-xs text-fg-muted">{topic.branchName}</span>
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-sm font-bold tabular-nums',
                masteryChip(topic.mastery),
              )}
            >
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
  if (!analysis) return <WidgetLoading />;

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
              {row.pattern ? <Badge variant="danger">{text.pattern}</Badge> : null}
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
