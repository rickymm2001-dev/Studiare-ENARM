// Examen completo (pantalla 8, 10.1). Reloj con el tiempo total, navegación libre entre preguntas,
// marcar para revisar, descartar opciones y avisos de tiempo y de ritmo. No dice si acertó hasta
// los resultados. Todo cambio queda en el navegador al instante, así una recarga lo retoma, y la
// bitácora recibe lo que hace en el momento (question_shown y answer_changed). Las respuestas se
// registran al terminar, en examSession.
import { AlarmClock, ChevronLeft, ChevronRight, Flag, X } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { SessionHeader } from '@/app/layout/SessionHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { EXAM_SECONDS_PER_QUESTION } from '@/engines/exam';
import { nextTimeAlerts, type TimeAlert } from '@/engines/timeAlerts';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { ActionDock } from '@/ui/components/action-dock';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { DemoContentLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { clock } from '../simulator/practice';
import type { QuestionBundle } from '../simulator/useQuestion';
import { formatClock } from './clock';
import { alertMessage, alertVisibleMs } from './examAlerts';
import { loadExamBundles, showQuestion } from './examSession';
import {
  addFiredAlerts,
  answeredCount,
  answerOf,
  choose,
  finishExamState,
  goTo,
  isFinished,
  markedCount,
  markNudged,
  remainingMs,
  setConfidence,
  toggleEliminated,
  toggleMarked,
  elapsedMs,
  type ExamEndReason,
  type ExamState,
} from './examState';
import { loadExamState, saveExamState } from './examStorage';
import { ExamFinishDialog } from './ExamFinishDialog';
import { ExamNavigator } from './ExamNavigator';
import { ExamQuestion } from './ExamQuestion';
import { ExamTimer } from './ExamTimer';

export function ExamScreen() {
  return (
    <RequireSession screen="exam">{(session) => <ExamLoader session={session} />}</RequireSession>
  );
}

interface Ready {
  state: ExamState;
  bundles: Map<string, QuestionBundle>;
}

function ExamLoader({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user } = session;
  // El examen en curso vive en el navegador y se lee una vez al entrar
  const [stored] = useState(() => loadExamState(user.id));
  const [ready, setReady] = useState<Ready | null>(null);
  // Cargar y registrar la primera vista una sola vez, aunque React monte el efecto dos veces
  const started = useRef(false);

  useEffect(() => {
    if (!stored || isFinished(stored) || started.current) return;
    started.current = true;
    void (async () => {
      const bundles = await loadExamBundles(api, stored.questionIds);
      let state = stored;
      const id = state.questionIds[state.current];
      const first = showQuestion(state, state.current, id ? bundles.get(id) : undefined);
      if (first.shown) {
        state = first.state;
        saveExamState(state);
        await api.recordEvent(
          createEvent('question_shown', first.shown, {
            userId: user.id,
            tz: user.timeZone,
            sessionId: state.examId,
          }),
        );
      }
      setReady({ state, bundles });
    })();
  }, [api, stored, user.id, user.timeZone]);

  if (!stored) return <NoActiveExam />;
  if (isFinished(stored)) return <Navigate to={screenPath('examResults')} replace />;
  if (!ready) {
    return (
      <>
        <SessionHeader title={t.screens.exam.title} badges={<DemoContentLabel />} />
        <LoadingState label={t.exam.loading} />
      </>
    );
  }
  return <ExamRunner session={session} initial={ready.state} bundles={ready.bundles} />;
}

function NoActiveExam() {
  return (
    <>
      <SessionHeader title={t.screens.exam.title} badges={<DemoContentLabel />} />
      <Card>
        <CardHeader>
          <CardTitle>{t.exam.noActive}</CardTitle>
        </CardHeader>
        <Button asChild className="self-start">
          <Link to={screenPath('simulatorSetup')}>{t.exam.goSetup}</Link>
        </Button>
      </Card>
    </>
  );
}

interface Banner {
  alert: TimeAlert;
  message: string;
  at: number;
}

function ExamRunner({
  session,
  initial,
  bundles,
}: {
  session: ReadySession;
  initial: ExamState;
  bundles: Map<string, QuestionBundle>;
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const { user } = session;
  // La referencia es la verdad y el estado de React solo pinta, así dos cambios seguidos no se pisan
  const stateRef = useRef(initial);
  const [state, setState] = useState(initial);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  // Al cambiar de pregunta el foco pasa al enunciado, así el lector de pantalla lo lee. La primera
  // pregunta no lo pide para no quitarle el foco a la página al entrar
  const [focusPrompt, setFocusPrompt] = useState(false);
  const ctx = { userId: user.id, tz: user.timeZone, sessionId: initial.examId };

  const commit = (change: (current: ExamState) => ExamState) => {
    const next = change(stateRef.current);
    if (next === stateRef.current) return;
    stateRef.current = next;
    saveExamState(next);
    setState(next);
  };

  const finish = (reason: ExamEndReason) => {
    commit((current) => finishExamState(current, clock(), reason));
    void navigate(screenPath('examResults'), { replace: true });
  };

  /**
   * Con el tiempo agotado el examen cierra por tiempo en vez de aceptar el cambio, como en el
   * examen real. Sin esto una respuesta elegida entre el límite y el siguiente tic contaría. true si
   * cerró
   */
  const closeIfTimeIsUp = () => {
    if (remainingMs(stateRef.current, clock()) > 0) return false;
    finish('time_up');
    return true;
  };

  const edit = (change: (current: ExamState) => ExamState) => {
    if (!closeIfTimeIsUp()) commit(change);
  };

  const currentId = state.questionIds[state.current] ?? '';
  const answer = answerOf(state, currentId);

  /** Fija las opciones de la pregunta actual y registra su primera vista */
  const showCurrent = () => {
    const current = stateRef.current;
    const id = current.questionIds[current.current];
    const result = showQuestion(current, current.current, id ? bundles.get(id) : undefined);
    if (!result.shown) return;
    commit(() => result.state);
    void api.recordEvent(createEvent('question_shown', result.shown, ctx));
  };

  const visit = (index: number) => {
    if (closeIfTimeIsUp()) return;
    const at = clock();
    commit((current) => goTo(current, index, at));
    setNudge(null);
    setFocusPrompt(true);
    showCurrent();
  };

  const onChoose = (optionId: string) => {
    if (closeIfTimeIsUp()) return;
    const at = clock();
    const current = stateRef.current;
    const result = choose(current, currentId, optionId, at);
    if (!result.changed) return;
    commit(() => result.state);
    const spent = answerOf(current, currentId).msSpent + Math.max(0, at - current.enteredAtMs);
    void api.recordEvent(
      createEvent(
        'answer_changed',
        {
          questionVersionId: currentId,
          fromOptionVersionId: result.from,
          toOptionVersionId: optionId,
          msSinceShown: Math.round(spent),
        },
        ctx,
      ),
    );
  };

  /** Un segundo del examen. Cierra por tiempo, da los avisos y detecta si se atoró */
  const onTick = useEffectEvent(() => {
    const at = clock();
    const current = stateRef.current;
    if (isFinished(current)) return;
    if (remainingMs(current, at) <= 0) {
      finish('time_up');
      return;
    }
    setBanner((shown) => (shown && at - shown.at > alertVisibleMs(shown.alert) ? null : shown));
    if (!current.alerts) return;

    const answered = answeredCount(current);
    const result = nextTimeAlerts({
      totalMs: current.totalMs,
      elapsedMs: elapsedMs(current, at),
      totalQuestions: current.questionIds.length,
      answeredQuestions: answered,
      fired: new Set(current.firedAlerts),
    });
    if (result.consumed.length > 0) commit((s) => addFiredAlerts(s, result.consumed));
    if (result.show) {
      setBanner({
        alert: result.show,
        message: alertMessage(result.show, { answered, total: current.questionIds.length }),
        at,
      });
    }

    // Más del doble del ritmo en una pregunta sin contestar. Se avisa una vez por pregunta
    const id = current.questionIds[current.current];
    const here = answerOf(current, id ?? '');
    if (id !== undefined && here.optionId === null && !here.nudged) {
      const spent = here.msSpent + Math.max(0, at - current.enteredAtMs);
      if (spent > 2 * EXAM_SECONDS_PER_QUESTION * 1000) {
        commit((s) => markNudged(s, id));
        setNudge(t.exam.stuck(formatClock(spent)));
      }
    }
  });
  useEffect(() => {
    const timer = window.setInterval(() => {
      onTick();
    }, 1000);
    // Primera revisión sin esperar un segundo, por si se reanuda con el tiempo ya agotado
    const first = window.setTimeout(() => {
      onTick();
    }, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, []);

  const total = state.questionIds.length;
  const answered = answeredCount(state);
  const marked = markedCount(state);
  const bundle = bundles.get(currentId);
  const shownIds = state.shownOptions[currentId];
  const firstBlank = state.questionIds.findIndex((id) => answerOf(state, id).optionId === null);
  const firstMarked = state.questionIds.findIndex((id) => answerOf(state, id).marked);

  return (
    <>
      <SessionHeader
        title={t.screens.exam.title}
        meta={
          <>
            <span>{t.exam.progress(state.current + 1, total)}</span>
            <span>{t.exam.answeredCount(answered, total)}</span>
          </>
        }
        badges={<DemoContentLabel />}
        actions={
          <>
            <ExamTimer startedAtMs={state.startedAtMs} totalMs={state.totalMs} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFinishOpen(true);
              }}
            >
              {t.exam.finish}
            </Button>
          </>
        }
      />

      {/* Los avisos de tiempo salen arriba y se leen en voz alta sin quitar el foco de la pregunta */}
      <div role="status" aria-live="polite">
        {banner ? (
          <div
            className={cn(
              'fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 mx-auto flex max-w-reading items-start gap-3 rounded-lg border p-3 shadow-raised lg:top-6 lg:right-6 lg:left-auto lg:mx-0 lg:w-auto lg:max-w-md',
              banner.alert.severity === 'critical'
                ? 'border-danger bg-danger-soft text-fg'
                : banner.alert.severity === 'warning'
                  ? 'border-warning bg-warning-soft text-fg'
                  : 'border-line bg-surface text-fg',
            )}
          >
            <AlarmClock aria-hidden className="mt-0.5 size-5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{banner.message}</p>
            <button
              type="button"
              aria-label={t.exam.dismiss}
              className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
              onClick={() => {
                setBanner(null);
              }}
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      {bundle && shownIds ? (
        <ExamQuestion
          key={currentId}
          bundle={bundle}
          shownIds={shownIds}
          answer={answer}
          highlight={state.highlight}
          askConfidence={state.askConfidence}
          nudge={nudge}
          position={t.exam.progress(state.current + 1, total)}
          focusPrompt={focusPrompt}
          onChoose={onChoose}
          onToggleDiscard={(optionId) => {
            edit((current) => toggleEliminated(current, currentId, optionId));
          }}
          onConfidence={(level) => {
            edit((current) => setConfidence(current, currentId, level));
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.exam.loading}</CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* Anterior, marcar y siguiente, siempre a la mano en el teléfono (D-078) */}
      <ActionDock className="lg:max-w-reading">
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            disabled={state.current === 0}
            onClick={() => {
              visit(state.current - 1);
            }}
          >
            <ChevronLeft aria-hidden />
            {t.exam.previous}
          </Button>
          <Button
            variant={answer.marked ? 'primary' : 'secondary'}
            aria-pressed={answer.marked}
            className="h-auto min-h-touch py-1.5 text-sm whitespace-normal"
            onClick={() => {
              edit((current) => toggleMarked(current, currentId));
            }}
          >
            <Flag aria-hidden />
            {answer.marked ? t.exam.unmark : t.exam.mark}
          </Button>
          <Button
            variant="secondary"
            disabled={state.current >= total - 1}
            onClick={() => {
              visit(state.current + 1);
            }}
          >
            {t.exam.next}
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </ActionDock>

      <ExamNavigator state={state} onGo={visit} />

      <ExamFinishDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        answered={answered}
        blank={total - answered}
        marked={marked}
        onConfirm={() => {
          setFinishOpen(false);
          finish('completed');
        }}
        onGoBlank={() => {
          setFinishOpen(false);
          visit(firstBlank);
        }}
        onGoMarked={() => {
          setFinishOpen(false);
          visit(firstMarked);
        }}
      />
    </>
  );
}
