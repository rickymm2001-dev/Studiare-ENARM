// Examen completo (pantalla 8, 10.1). Reloj con el tiempo total, navegación libre entre preguntas,
// marcar para revisar, descartar opciones y avisos de tiempo y de ritmo. No dice si acertó hasta
// los resultados. Todo cambio queda en el navegador al instante, así una recarga lo retoma, y la
// bitácora recibe lo que hace en el momento (question_shown y answer_changed). Las respuestas se
// registran al terminar, en examSession.
// Desde D-150 sigue el diseño de la pregunta. La primera fila del contenido es la franja pizarra de la
// sesión, con el título, su resumen, la etiqueta de demostración si aplica, el reloj en píldora cielo y
// Entregar. El marco de la app es común, así que la franja vive aquí y no en AppShell. Debajo va la banda
// crema con el avance y el aviso de ritmo del motor de alertas, y luego la pregunta en ocho columnas con
// el mapa del examen y la técnica de examen en el lateral. En el teléfono es una columna con las acciones
// fijas abajo.
import { ChevronLeft, ChevronRight, Flag, TriangleAlert, X } from 'lucide-react';
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
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { Kbd, KeyHint } from '@/ui/components/key-hint';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useShortcuts } from '../shared/useShortcuts';
import { useVisibilityLog } from '../shared/useVisibilityLog';
import { clock } from '../simulator/practice';
import { SessionProgressBand } from '../simulator/SessionProgressBand';
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
import { EXAM_PROMPT_ID, ExamQuestion } from './ExamQuestion';
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

/** Las ramas del examen para el resumen de la franja. Dos se nombran, más se cuentan */
function branchesSummary(bundles: Map<string, QuestionBundle>, ids: readonly string[]): string {
  const names = [
    ...new Set(
      ids.flatMap((id) => {
        const branch = bundles.get(id)?.question.branch;
        return branch ? [t.branchNames[branch] ?? branch] : [];
      }),
    ),
  ];
  return names.length <= 2 ? names.join(' y ') : t.exam.branchesCount(names.length);
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
  // Todo contenido de demostración lleva su etiqueta a la vista (4.6)
  const demo = state.questionIds.some((id) => bundles.get(id)?.question.isDemo === true);
  const progressText = t.exam.progress(state.current + 1, total);

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
        position={progressText}
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

  // Anterior, marcar para revisar y Siguiente, siempre a la mano en el teléfono (D-078). Marcar es el
  // secundario y Siguiente el principal con su flecha, como en el diseño. En el teléfono marcar queda solo
  // con su ícono para que su texto no se parta en tres renglones (H14 de la revisión de B2). Con la hoja de
  // respuestas las letras no eligen, así que su recordatorio de teclas no las ofrece
  const dock = (
    <ActionDock>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          disabled={state.current === 0}
          className="mr-auto"
          onClick={() => {
            visit(state.current - 1);
          }}
        >
          <ChevronLeft aria-hidden />
          <span className="max-sm:sr-only">{t.exam.previous}</span>
        </Button>
        <Button
          variant="secondary"
          aria-pressed={answer.marked}
          aria-label={markLabel}
          className={cn(answer.marked && 'bg-primary-soft')}
          onClick={(event) => {
            edit((current) => toggleMarked(current, currentId));
            // Con el ratón el foco se quedaría en el botón y Enter volvería a alternar la marca en lugar de
            // avanzar. Pasa al enunciado, como al cambiar de pregunta. Con el teclado (detail 0) se queda
            if (event.detail > 0) document.getElementById(EXAM_PROMPT_ID)?.focus();
          }}
        >
          <Flag aria-hidden className={cn(answer.marked && 'fill-current')} />
          <span className="max-sm:hidden">{markLabel}</span>
        </Button>
        <Button
          disabled={state.current >= total - 1}
          onClick={() => {
            visit(state.current + 1);
          }}
        >
          {t.exam.next}
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <KeyHint className="text-right">
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
      {/* La franja de la sesión y la banda de avance salen a los bordes del contenido y se pegan bajo la
          barra pizarra en computadora. En el teléfono se quedan arriba, el reloj no estorba al leer */}
      <div className="-mx-5 -mt-6 lg:sticky lg:top-topbar lg:z-10 lg:-mx-8 lg:-mt-8">
        <header className="bg-slate text-slate-fg">
          <title>{t.app.documentTitle(t.screens.exam.title)}</title>
          <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2 lg:px-8">
            <h1 tabIndex={-1} className="text-lg font-extrabold tracking-tight outline-none">
              {t.screens.exam.title}
            </h1>
            <p className="text-sm text-slate-muted">
              {t.exam.sessionSummary(total, branchesSummary(bundles, state.questionIds))}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              {demo ? <Badge>{t.exam.demoLabel}</Badge> : null}
              <ExamTimer startedAtMs={state.startedAtMs} totalMs={state.totalMs} />
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-full border-[1.5px] border-slate-fg/40 px-4 text-sm font-semibold text-slate-fg transition-colors hover:border-slate-fg hover:bg-slate-fg/10"
                onClick={() => {
                  setFinishOpen(true);
                }}
              >
                {t.exam.finish}
              </button>
            </div>
          </div>
        </header>
        <SessionProgressBand
          label={progressText}
          value={state.current + 1}
          max={total}
          progressLabel={`${t.exam.progressLabel}. ${progressText}`}
          className="mx-0 lg:mx-0"
        >
          <span className="text-sm text-fg-muted tabular-nums">
            {t.exam.answeredCount(answered, total)}
          </span>
          {/* Los avisos de tiempo se leen en voz alta sin quitar el foco de la pregunta */}
          <div
            role="status"
            aria-live="polite"
            className="flex basis-full items-center sm:basis-auto"
          >
            {banner ? (
              <p
                className={cn(
                  'flex items-center gap-1.5 text-sm font-bold',
                  banner.alert.severity === 'critical'
                    ? 'text-danger'
                    : banner.alert.severity === 'warning'
                      ? 'text-warning'
                      : 'text-fg',
                )}
              >
                <TriangleAlert aria-hidden className="size-4 shrink-0" />
                <span>{banner.message}</span>
                <button
                  type="button"
                  aria-label={t.exam.dismiss}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted"
                  onClick={() => {
                    setBanner(null);
                  }}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </p>
            ) : null}
          </div>
        </SessionProgressBand>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:items-start">
        <section
          aria-label={t.screens.question.title}
          className="flex min-w-0 flex-col gap-5 xl:col-span-8"
        >
          {questionNode}
          {state.answerSheet ? (
            // Con la hoja de respuestas, la hoja va entre la pregunta y las acciones, que en el teléfono se
            // quedan pegadas abajo mientras se recorre (D-078). Un elemento pegajoso solo se queda en
            // pantalla si su lugar natural está debajo, así que el dock va después de la hoja
            <Card tone="cream" lift={false}>
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
            </Card>
          ) : null}
          {dock}
        </section>
        <aside className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <ExamNavigator state={state} onGo={visit} englishIds={englishIds} />
          <Card tone="panel" lift={false} aria-labelledby="examen-tecnica">
            <CardHeader>
              <CardTitle id="examen-tecnica" className="text-lg">
                {t.exam.technique}
              </CardTitle>
            </CardHeader>
            <p className="text-sm leading-relaxed text-fg">{t.choice.optionsHint}</p>
            <KeyHint className="mt-2">
              <Kbd>{t.exam.keys.shift}</Kbd> + {t.exam.keys.letter} {t.exam.keys.discard} ·{' '}
              <Kbd>M</Kbd> {t.exam.keys.mark}
            </KeyHint>
          </Card>
        </aside>
      </div>

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
