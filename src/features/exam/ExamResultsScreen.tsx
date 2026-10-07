// Resultados del examen (pantalla 9, 10.1). Lo que hizo el alumno en este examen por rama, tema,
// estructura de pregunta, trampa, tipo de reactivo y descarte, y la revisión de cada pregunta. Al
// entrar cierra el examen. Registra las respuestas con su XP y manda los errores al repaso. Son
// cifras de este examen. No predicen el puntaje del ENARM y los patrones acumulados siguen
// calibrando en Progreso.
import { Clock, Layers } from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { biasTaxonomy } from '@/demo/content';
import type { ExamScore } from '@/engines/exam';
import { t } from '@/i18n/es-MX';
import { taskNames } from '@/i18n/insights';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { DemoContentLabel } from '@/ui/components/labels';
import { ProgressBar } from '@/ui/components/progress-bar';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { TOPIC_NAMES } from '../shared/topics';
import { useUserEvents } from '../shared/useUserEvents';
import type { QuestionBundle } from '../simulator/useQuestion';
import { formatClock } from './clock';
import { ExamReview } from './ExamReview';
import { MIN_QUESTIONS_PER_TOPIC, examScoreOf, rankedTallies } from './examResults';
import { closeExam, loadExamBundles } from './examSession';
import { elapsedMs, isClosed, isFinished, type ExamState } from './examState';
import { loadExamState } from './examStorage';

const biasName = new Map(biasTaxonomy.biases.map((bias) => [bias.key, bias.name]));
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

export function ExamResultsScreen() {
  return (
    <RequireSession screen="examResults">
      {(session) => <ExamResults session={session} />}
    </RequireSession>
  );
}

function NoExam() {
  return (
    <>
      <ScreenHeader title={t.screens.examResults.title} badges={<DemoContentLabel />} />
      <Card>
        <CardHeader>
          <CardTitle>{t.examResults.noExam}</CardTitle>
        </CardHeader>
        <Button asChild className="self-start">
          <Link to={screenPath('simulatorSetup')}>{t.exam.goSetup}</Link>
        </Button>
      </Card>
    </>
  );
}

function ExamResults({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const events = useUserEvents(user.id);
  const [state, setState] = useState<ExamState | null>(() => loadExamState(user.id));
  const [bundles, setBundles] = useState<Map<string, QuestionBundle> | null>(null);
  const [error, setError] = useState(false);
  // Cada reintento del cierre cuenta para que el efecto vuelva a correr
  const [attempt, setAttempt] = useState(0);
  const closing = useRef(false);

  // Las preguntas del examen, una sola vez
  const questionIds = state?.questionIds;
  useEffect(() => {
    if (!questionIds) return;
    let cancelled = false;
    void loadExamBundles(api, questionIds).then((loaded) => {
      if (!cancelled) setBundles(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [api, questionIds]);

  // Cerrar el examen. Retoma donde se quedó si una recarga lo interrumpió
  const startClosing = useEffectEvent((exam: ExamState, loaded: Map<string, QuestionBundle>) => {
    closeExam({
      api,
      user,
      settings,
      state: exam,
      bundles: loaded,
      events: events ?? [],
      onProgress: setState,
    }).then(setState, () => {
      closing.current = false;
      setError(true);
    });
  });
  const ready = state !== null && isFinished(state) && bundles !== null && events !== undefined;
  useEffect(() => {
    if (!ready || closing.current || isClosed(state)) return;
    closing.current = true;
    startClosing(state, bundles);
  }, [ready, state, bundles, attempt]);

  const score = useMemo(
    () => (state && bundles ? examScoreOf(state, bundles) : null),
    [state, bundles],
  );

  if (!state) return <NoExam />;
  if (!isFinished(state)) return <Navigate to={screenPath('exam')} replace />;
  if (!bundles || !score) {
    return (
      <>
        <ScreenHeader title={t.screens.examResults.title} badges={<DemoContentLabel />} />
        <LoadingState label={t.exam.loading} />
      </>
    );
  }
  const saving = !isClosed(state);

  return (
    <>
      <ScreenHeader
        title={t.screens.examResults.title}
        description={t.screens.examResults.description}
        badges={<DemoContentLabel />}
      />
      <Summary
        state={state}
        score={score}
        saving={saving}
        error={error}
        onRetry={() => {
          setError(false);
          setAttempt((count) => count + 1);
        }}
      />
      <ErrorsCard state={state} score={score} sending={settings.errorsToReview} saving={saving} />
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <BranchCard score={score} />
        <StructureCard score={score} />
        <TrapsCard score={score} />
        <EliminationCard score={score} />
        <TopicsCard score={score} />
        <KindsCard score={score} />
      </div>
      <Card aria-labelledby="examen-leer">
        <CardHeader>
          <CardTitle id="examen-leer">{t.examResults.readTitle}</CardTitle>
          <CardDescription>{t.examResults.readBody}</CardDescription>
        </CardHeader>
      </Card>
      <ExamReview state={state} bundles={bundles} />
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to={screenPath('simulatorSetup')}>{t.examResults.anotherExam}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to={screenPath('home')}>{t.examResults.goHome}</Link>
        </Button>
      </div>
    </>
  );
}

/** El término va primero para los lectores de pantalla y la cifra se ve arriba */
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse justify-end rounded-lg bg-muted p-3">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-2xl font-extrabold tabular-nums">{children}</dd>
    </div>
  );
}

function Summary({
  state,
  score,
  saving,
  error,
  onRetry,
}: {
  state: ExamState;
  score: ExamScore;
  saving: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const text = t.examResults;
  const used = elapsedMs(state, state.finishedAtMs ?? state.startedAtMs);
  const perQuestion =
    score.averageMsPerAnswered === null ? null : Math.round(score.averageMsPerAnswered / 1000);
  return (
    <Card aria-labelledby="examen-resumen">
      <CardHeader>
        <CardTitle id="examen-resumen">{text.summaryTitle}</CardTitle>
        <CardDescription>{text.ended[state.endReason ?? 'completed']}</CardDescription>
      </CardHeader>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={text.accuracy(score.correct, score.total)}>
          {percent(score.correct, score.total)}%
        </Stat>
        <Stat label={text.answered}>{score.answered}</Stat>
        <Stat label={text.blank}>{score.blank}</Stat>
        <Stat label={text.marked}>{score.marked}</Stat>
      </dl>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
        <span className="flex items-center gap-1">
          <Clock aria-hidden className="size-4" />
          {text.time(formatClock(used), formatClock(state.totalMs))}
        </span>
        {perQuestion !== null ? <span>{text.perQuestion(perQuestion)}</span> : null}
        <span className="font-semibold text-success" aria-live="polite">
          {text.xp(state.xp)}
        </span>
      </p>
      {state.shortfall > 0 ? (
        <p className="mt-2 text-sm text-fg-muted">
          {text.shortfall(state.requested, state.questionIds.length)}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-fg-muted">{text.notPrediction}</p>
      {saving && !error ? (
        <p role="status" className="mt-2 text-sm font-medium text-primary">
          {text.saving}
        </p>
      ) : null}
      {error ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm font-medium text-danger">
            {text.saveError}
          </p>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {text.retry}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function ErrorsCard({
  state,
  score,
  sending,
  saving,
}: {
  state: ExamState;
  score: ExamScore;
  sending: boolean;
  saving: boolean;
}) {
  const text = t.examResults;
  return (
    <Card aria-labelledby="examen-errores">
      <CardHeader>
        <CardTitle id="examen-errores" className="flex items-center gap-2">
          <Layers aria-hidden className="size-5 text-primary" />
          {text.errorsTitle}
        </CardTitle>
        <CardDescription>
          {!sending
            ? text.errorsOff
            : saving || state.queuedErrors === null
              ? text.saving
              : score.missedIds.length === 0
                ? text.errorsNone
                : text.errorsSent(state.queuedErrors)}
        </CardDescription>
      </CardHeader>
      {sending && !saving && score.missedIds.length > 0 ? (
        <Button asChild className="self-start">
          <Link to={screenPath('review')}>{text.reviewNow}</Link>
        </Button>
      ) : null}
    </Card>
  );
}

function TallyRow({
  name,
  correct,
  answered,
  total,
}: {
  name: string;
  correct: number;
  answered: number;
  total: number;
}) {
  const label = `${name}. ${t.examResults.tally(correct, answered, total)}`;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-medium">{name}</span>
        <span className="text-sm text-fg-muted">
          {t.examResults.tally(correct, answered, total)}
        </span>
      </div>
      <ProgressBar value={correct} max={total} label={label} className="h-2" />
    </li>
  );
}

function BranchCard({ score }: { score: ExamScore }) {
  return (
    <Card aria-labelledby="examen-ramas">
      <CardHeader className="mb-3">
        <CardTitle id="examen-ramas">{t.examResults.branchesTitle}</CardTitle>
      </CardHeader>
      <ul className="flex flex-col gap-3">
        {rankedTallies(score.byBranch).map((row) => (
          <TallyRow
            key={row.key}
            name={t.branchNames[row.key] ?? row.key}
            correct={row.correct}
            answered={row.answered}
            total={row.total}
          />
        ))}
      </ul>
    </Card>
  );
}

function StructureCard({ score }: { score: ExamScore }) {
  const text = t.examResults;
  const tasks = rankedTallies(score.byTask).slice(0, 6);
  const comparable =
    score.byPolarity.affirmative.total >= MIN_QUESTIONS_PER_TOPIC &&
    score.byPolarity.negative.total >= MIN_QUESTIONS_PER_TOPIC;
  return (
    <Card aria-labelledby="examen-estructura">
      <CardHeader className="mb-3">
        <CardTitle id="examen-estructura">{text.structureTitle}</CardTitle>
      </CardHeader>
      <ul className="flex flex-col gap-3">
        {(['affirmative', 'negative'] as const).map((polarity) => {
          const tally = score.byPolarity[polarity];
          return tally.total === 0 ? null : (
            <TallyRow
              key={polarity}
              name={text.polarity[polarity]}
              correct={tally.correct}
              answered={tally.answered}
              total={tally.total}
            />
          );
        })}
      </ul>
      {comparable ? null : (
        <p className="mt-2 text-sm text-fg-muted">{text.structureCalibrating}</p>
      )}
      <h3 className="mt-4 mb-2 text-sm font-semibold">{text.taskTitle}</h3>
      <ul className="flex flex-col gap-3">
        {tasks.map((row) => (
          <TallyRow
            key={row.key}
            name={capitalize(taskNames[row.key] ?? row.key)}
            correct={row.correct}
            answered={row.answered}
            total={row.total}
          />
        ))}
      </ul>
    </Card>
  );
}

function TrapsCard({ score }: { score: ExamScore }) {
  const text = t.examResults;
  return (
    <Card aria-labelledby="examen-trampas">
      <CardHeader className="mb-3">
        <CardTitle id="examen-trampas">{text.trapsTitle}</CardTitle>
      </CardHeader>
      {score.biasTags.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.trapsNone}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {score.biasTags.slice(0, 6).map((entry) => (
            <li key={entry.tag} className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{biasName.get(entry.tag) ?? entry.tag}</span>
              <span className="shrink-0 text-sm whitespace-nowrap text-fg-muted">
                {text.trapCount(entry.wrongChoices)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EliminationCard({ score }: { score: ExamScore }) {
  const text = t.examResults;
  const { questionsWithElimination, eliminated, eliminatedCorrect } = score.elimination;
  return (
    <Card aria-labelledby="examen-descarte">
      <CardHeader className="mb-3">
        <CardTitle id="examen-descarte">{text.eliminationTitle}</CardTitle>
      </CardHeader>
      {eliminated === 0 ? (
        <p className="text-sm text-fg-muted">{text.eliminationNone}</p>
      ) : (
        <div className="flex flex-col gap-1.5 text-sm">
          <p>{text.eliminationBody(questionsWithElimination, eliminated)}</p>
          <p className={eliminatedCorrect > 0 ? 'font-medium text-danger' : 'text-fg-muted'}>
            {eliminatedCorrect > 0
              ? text.eliminationCorrect(eliminatedCorrect)
              : text.eliminationClean}
          </p>
        </div>
      )}
    </Card>
  );
}

function TopicsCard({ score }: { score: ExamScore }) {
  const text = t.examResults;
  const rows = rankedTallies(score.byTopic, MIN_QUESTIONS_PER_TOPIC).slice(0, 8);
  return (
    <Card aria-labelledby="examen-temas">
      <CardHeader className="mb-3">
        <CardTitle id="examen-temas">{text.topicsTitle}</CardTitle>
        <CardDescription>{text.topicsHint}</CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <TallyRow
            key={row.key}
            name={TOPIC_NAMES.get(row.key) ?? row.key}
            correct={row.correct}
            answered={row.answered}
            total={row.total}
          />
        ))}
      </ul>
    </Card>
  );
}

function KindsCard({ score }: { score: ExamScore }) {
  const text = t.examResults;
  const kinds = Object.entries(score.specialKinds);
  // Sin reactivos raros en este examen no hay nada que mostrar
  if (kinds.length === 0) return null;
  return (
    <Card aria-labelledby="examen-raros">
      <CardHeader className="mb-3">
        <CardTitle id="examen-raros">{text.kindsTitle}</CardTitle>
        <CardDescription>{text.kindsIntro}</CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-3">
        {kinds.map(([kind, tally]) => {
          const [name, hint] = text.kinds[kind] ?? [kind, ''];
          return (
            <li key={kind} className="flex flex-col">
              <TallyRow
                name={name}
                correct={tally.correct}
                answered={tally.answered}
                total={tally.total}
              />
              {hint ? <span className="mt-0.5 text-xs text-fg-muted">{hint}</span> : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
