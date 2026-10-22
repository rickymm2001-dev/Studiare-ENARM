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
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { createEvent } from '@/data/events/createEvent';
import { EXAM_SECONDS_PER_QUESTION } from '@/engines/exam';
import { nextTimeAlerts, type TimeAlert } from '@/engines/timeAlerts';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { ActionDock } from '@/ui/components/action-dock';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { Kbd, KeyHint } from '@/ui/components/key-hint';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useShortcuts } from '../shared/useShortcuts';
import { useVisibilityLog } from '../shared/useVisibilityLog';
import { clock } from '../simulator/practice';
import type { QuestionBundle } from '../simulator/useQuestion';
import { formatClock } from './clock';
import { alertMessage, alertVisibleMs, stuckAfterMs } from './examAlerts';
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
import { AnswerSheet, type SheetRow } from './AnswerSheet';
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
      const first = showQuestion(state, state.current, id ? bundles.get(id) : undefined, bundles);
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
        <SessionHeader title={t.screens.exam.title} />
        <LoadingState label={t.exam.loading} />
      </>
    );
  }
  return <ExamRunner session={session} initial={ready.state} bundles={ready.bundles} />;
}

function NoActiveExam() {
  return (
    <>
      <SessionHeader title={t.screens.exam.title} />
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
  // Cuánto se distrae en un examen de horas queda en la bitácora (6.3)
  useVisibilityLog({ userId: user.id, timeZone: user.timeZone, sessionId: initial.examId });

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
  const markLabel = answer.marked ? t.exam.unmark : t.exam.mark;

  /** Fija las opciones de la pregunta actual y registra su primera vista */
  const showCurrent = () => {
    const current = stateRef.current;
    const id = current.questionIds[current.current];
    const result = showQuestion(
      current,
      current.current,
      id ? bundles.get(id) : undefined,
      bundles,
    );
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

  /**
   * Llena la respuesta de una pregunta. Con la hoja de respuestas puede ser una que no es la que se ve,
   * así que el tiempo que llevaba solo se suma a la pregunta actual
   */
  const chooseFor = (questionId: string, optionId: string) => {
    if (closeIfTimeIsUp()) return;
    const at = clock();
    const current = stateRef.current;
    const result = choose(current, questionId, optionId, at);
    if (!result.changed) return;
    commit(() => result.state);
    const here = questionId === (current.questionIds[current.current] ?? '');
    const spent =
      answerOf(current, questionId).msSpent + (here ? Math.max(0, at - current.enteredAtMs) : 0);
    void api.recordEvent(
      createEvent(
        'answer_changed',
        {
          questionVersionId: questionId,
          fromOptionVersionId: result.from,
          toOptionVersionId: optionId,
          msSinceShown: Math.round(spent),
        },
        ctx,
      ),
    );
  };
  const onChoose = (optionId: string) => {
    chooseFor(currentId, optionId);
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
      // Una pregunta de inglés trae su texto, y su ritmo es el de todo el texto (B13)
      const question = bundles.get(id)?.question;
      const english = question?.language === 'en';
      const textSize = english
        ? current.questionIds.filter(
            (other) => bundles.get(other)?.question.caseId === (question.caseId ?? null),
          ).length
        : 1;
      if (
        spent >
        stuckAfterMs({
          english,
          textSize: question?.caseId ? textSize : 1,
          clinicalSeconds: EXAM_SECONDS_PER_QUESTION,
          englishSeconds: DEFAULT_THRESHOLDS.english.secondsPerItem,
        })
      ) {
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
  const sheetRows: SheetRow[] = state.questionIds.map((id, index) => ({
    number: index + 1,
    optionIds: state.shownOptions[id] ?? null,
    chosenId: answerOf(state, id).optionId,
    marked: answerOf(state, id).marked,
  }));
  const firstBlank = state.questionIds.findIndex((id) => answerOf(state, id).optionId === null);
  const firstMarked = state.questionIds.findIndex((id) => answerOf(state, id).marked);
  // Los reactivos de la parte en inglés, para marcarlos en el navegador
  const englishIds = new Set(
    state.questionIds.filter((id) => bundles.get(id)?.question.language === 'en'),
  );

  // Teclado (D-087). Letras o números eligen, Mayús con la letra descarta, Enter o la flecha derecha
  // sigue, la flecha izquierda regresa y M marca. No actúa con la ventana de terminar abierta
  const keys: Record<string, () => void> = {};
  (shownIds ?? []).forEach((optionId, position) => {
    const letter = String.fromCharCode(97 + position);
    // Con la hoja de respuestas las letras no eligen, la respuesta se llena en la hoja
    if (!state.answerSheet) {
      keys[letter] = () => {
        onChoose(optionId);
      };
      if (position < 9) {
        keys[String(position + 1)] = () => {
          onChoose(optionId);
        };
      }
    }
    keys[`shift+${letter}`] = () => {
      edit((current) => toggleEliminated(current, currentId, optionId));
    };
  });
  const goNext = () => {
    if (state.current < total - 1) visit(state.current + 1);
  };
  keys.enter = goNext;
  keys.arrowright = goNext;
  keys.arrowleft = () => {
    if (state.current > 0) visit(state.current - 1);
  };
  keys.m = () => {
    edit((current) => toggleMarked(current, currentId));
  };
  useShortcuts(keys, !finishOpen);

  const questionNode =
    bundle && shownIds ? (
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
        sheetMode={state.answerSheet}
      />
    ) : (
      <Card>
        <CardHeader>
          <CardTitle>{t.exam.loading}</CardTitle>
        </CardHeader>
      </Card>
    );

  // Anterior, marcar y siguiente, siempre a la mano en el teléfono (D-078). En el teléfono marcar queda
  // solo con su ícono, para que su texto no se parta en tres renglones, y deja el espacio a Anterior y
  // Siguiente (H14 de la revisión de B2). Con la hoja de respuestas las letras no eligen, así que su
  // recordatorio de teclas no las ofrece
  const dock = (placement?: string) => (
    <ActionDock className={cn('lg:mx-auto lg:w-full lg:max-w-session', placement)}>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:grid-cols-3">
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
          aria-label={markLabel}
          className="h-auto min-h-touch py-1.5 text-sm whitespace-normal max-sm:px-3"
          onClick={() => {
            edit((current) => toggleMarked(current, currentId));
          }}
        >
          <Flag aria-hidden />
          <span className="max-sm:hidden">{markLabel}</span>
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
      <KeyHint>
        {state.answerSheet ? null : (
          <>
            <Kbd>A</Kbd> a <Kbd>{String.fromCharCode(64 + (shownIds?.length ?? 4))}</Kbd>{' '}
            {t.exam.keys.choose} ·{' '}
          </>
        )}
        <Kbd>{t.exam.keys.shift}</Kbd> + {t.exam.keys.letter} {t.exam.keys.discard} ·{' '}
        <Kbd>Enter</Kbd> {t.exam.keys.next} · <Kbd>←</Kbd> {t.exam.keys.previous} · <Kbd>M</Kbd>{' '}
        {t.exam.keys.mark}
      </KeyHint>
    </ActionDock>
  );

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
              'fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 mx-auto flex max-w-reading items-start gap-3 rounded-lg border p-3 shadow-raised lg:top-[calc(var(--spacing-topbar)+0.75rem)] lg:right-6 lg:left-auto lg:mx-0 lg:w-auto lg:max-w-md',
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

      {state.answerSheet ? (
        // En el teléfono y la tableta es una columna con la pregunta, la hoja y al final Anterior, marcar y
        // Siguiente, que se quedan pegados abajo mientras se recorre la hoja (D-078). Un elemento pegajoso
        // solo se queda en pantalla si su lugar natural está debajo, así que va después de la hoja, y en
        // una columna flex y no en una cuadrícula, donde solo se pega dentro de su propia celda. En
        // computadora, donde ya no es pegajoso, la hoja va a un lado y el dock bajo la pregunta
        <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
          <div className="min-w-0 xl:col-start-1 xl:row-start-1">{questionNode}</div>
          <aside className="min-w-0 xl:sticky xl:top-24 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <AnswerSheet
              rows={sheetRows}
              current={state.current}
              disabled={isFinished(state)}
              onChoose={(index, optionId) => {
                const id = state.questionIds[index];
                if (id !== undefined) chooseFor(id, optionId);
              }}
              onGo={visit}
            />
          </aside>
          {dock('xl:col-start-1 xl:row-start-2')}
        </div>
      ) : (
        <>
          {questionNode}
          {dock()}
        </>
      )}

      <ExamNavigator state={state} onGo={visit} englishIds={englishIds} />

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
