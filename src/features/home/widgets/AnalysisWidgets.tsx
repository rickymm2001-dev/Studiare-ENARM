// Widgets de análisis de Inicio (9.1). Temas débiles, patrón de sesgo, carga futura y última hipótesis
// del tutor. Cada uno dice lo mismo que su pantalla pero en chico, usa los mismos motores y muestra
// calibrando, con cuánto falta, hasta tener datos suficientes (4.3). Solo cargan lo que necesitan
// cuando están en el tablero.
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
import { useDecksAndCards } from '../../decks/useDecksAndCards';
import { topicsCalibration } from '../../progress/analysis';
import { LoadBars } from '../../progress/FutureLoadCard';
import { biasCalibration, biasProfileRows } from '../../progress/focusItems';
import { formatDay, loadSummary } from '../../progress/loadFormat';
import { masteryChip } from '../../progress/masteryChip';
import { useAnalysis } from '../../progress/useAnalysis';
import { useFutureLoad } from '../../progress/useFutureLoad';
import type { ReadySession } from '../../shared/RequireSession';
import { TOPIC_NAMES } from '../../shared/topics';
import { latestHypothesis } from '../../tutor/tutorModel';
import {
  artifactStatuses,
  useTutorData,
  useTutorView,
  type TutorData,
} from '../../tutor/useTutorData';
import { ALL_BRANCHES, readFutureLoadSettings, readWeakTopicsSettings } from './analysisSettings';

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

/** Mientras carga, la proyección no ve ningún mazo. Esta referencia fija evita recalcular */
const NO_CONTENT = { decks: [], cards: [] } as const;

export function FutureLoadWidget({ session, events, settings }: AnalysisWidgetProps) {
  const text = t.widgets.futureLoad;
  const content = useDecksAndCards();
  const { days } = readFutureLoadSettings(settings);
  const load = useFutureLoad(session, events, content ?? NO_CONTENT, days);
  if (content === undefined) return <WidgetLoading />;

  if (load === null || load.cardCount === 0)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">{text.empty}</p>
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link to={screenPath('decks')}>{text.goToDecks}</Link>
        </Button>
      </div>
    );

  const { peakText, average } = loadSummary(load);
  return (
    <div className="flex flex-col gap-2">
      <LoadBars load={load} className="h-16" />
      <div aria-hidden className="flex justify-between text-xs text-fg-muted">
        <span>{formatDay(load.days[0]?.day ?? '')}</span>
        <span>{formatDay(load.days.at(-1)?.day ?? '')}</span>
      </div>
      <p className="text-sm">{text.summary(average, peakText)}</p>
      <SeeAll to={screenPath('progress')}>{text.seeAll}</SeeAll>
    </div>
  );
}

export function LatestHypothesisWidget({ session, events }: AnalysisWidgetProps) {
  // El tutor carga el banco completo para buscar confusiones, por eso se separa en dos pasos
  const data = useTutorData(session.user.id, events);
  if (!data) return <WidgetLoading />;
  return <LatestHypothesis session={session} events={events} data={data} />;
}

function LatestHypothesis({
  session,
  events,
  data,
}: {
  session: ReadySession;
  events: readonly AppEvent[];
  data: TutorData;
}) {
  const tutor = t.tutor;
  const text = t.widgets.latestHypothesis;
  const view = useTutorView(session, events, data);
  const statuses = artifactStatuses(session.user.id, data.artifacts, [
    ...view.confirmed,
    ...view.forming,
  ]);
  // Una que el alumno descartó no se le vuelve a mostrar
  const latest = latestHypothesis(
    view.confirmed.filter((hypothesis) => statuses.get(hypothesis.key) !== 'rejected'),
  );
  // Una que el alumno descartó no vuelve a salir, ni siquiera como patrón que se está formando
  const forming = view.forming.find((hypothesis) => statuses.get(hypothesis.key) !== 'rejected');
  const areaName = (area: string) => TOPIC_NAMES.get(area) ?? area;

  if (latest) {
    const rule = tutor.rules[latest.rule as keyof typeof tutor.rules];
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{tutor.confirmedBadge}</Badge>
          <Badge variant="neutral">{tutor.confidence[latest.confidence]}</Badge>
          <span className="text-xs text-fg-muted">{tutor.findings(latest.recentFindings)}</span>
        </div>
        <p className="leading-snug font-semibold">{rule.title}</p>
        <p className="text-sm">{rule.hypothesis(areaName(latest.area))}</p>
        {statuses.get(latest.key) === 'approved' ? (
          <p className="text-xs text-fg-muted">{text.helpful}</p>
        ) : null}
        <SeeAll to={screenPath('tutor')}>{text.open}</SeeAll>
      </div>
    );
  }

  if (forming) {
    const title = tutor.rules[forming.rule as keyof typeof tutor.rules].title;
    const need = forming.recentFindings + forming.findingsNeeded;
    const label = tutor.formingRow(title, areaName(forming.area), forming.recentFindings, need);
    return (
      <div className="flex flex-col gap-2">
        <Badge variant="neutral" className="self-start">
          {text.forming}
        </Badge>
        <p className="text-sm">{label}</p>
        <ProgressBar value={forming.recentFindings} max={need} label={label} className="h-2" />
        <SeeAll to={screenPath('tutor')}>{text.open}</SeeAll>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary">
        {tutor.calibrating(view.recentErrors)}
      </p>
      <SeeAll to={screenPath('tutor')}>{text.open}</SeeAll>
    </div>
  );
}
