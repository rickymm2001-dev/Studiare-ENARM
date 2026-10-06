// Ciclo de vida de un examen (pantallas 8 y 9). Armarlo y registrar su inicio, cargar las preguntas
// y cerrarlo al terminar. Mientras el alumno contesta solo se registran question_shown y
// answer_changed, que son lo que hizo en el momento. Las respuestas y su XP se registran al cerrar,
// fechadas cuando el alumno las eligió. El cierre avanza por pasos que quedan anotados en el estado
// del examen, así una recarga a la mitad lo retoma sin duplicar nada en la bitácora, que solo se
// agrega.
import type { DataApi } from '@/data/context';
import { createEvent, type Clock } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import type { Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import type { User, UserSettings } from '@/data/schemas/people';
import { buildExam } from '@/engines/exam';
import { sendErrorsToReview, type FailedQuestion } from '../review/sendErrors';
import { recordAnswerWithXp } from '../simulator/answerXp';
import { buildBundle, type QuestionBundle } from '../simulator/useQuestion';
import { examAnswers, type ExamBundles } from './examResults';
import {
  answeredCount,
  answerOf,
  createExamState,
  elapsedMs,
  isFinished,
  markRecorded,
  markSessionEnded,
  setQueuedErrors,
  type ExamState,
} from './examState';
import { saveExamState } from './examStorage';

export interface ExamOptions {
  highlight: boolean;
  askConfidence: boolean;
  alerts: boolean;
}

const clockAt = (ms: number): Clock => ({ now: () => new Date(ms) });

/** Carga las preguntas del examen con sus opciones y la viñeta de su caso, una sola vez */
export async function loadExamBundles(
  api: Pick<DataApi, 'repos'>,
  questionIds: readonly string[],
): Promise<Map<string, QuestionBundle>> {
  const cases = new Map(
    (await api.repos.cases.list()).map((clinicalCase) => [clinicalCase.id, clinicalCase] as const),
  );
  const loaded = await Promise.all(
    questionIds.map(async (id) => {
      const question = await api.repos.questions.get(id);
      if (!question) return null;
      const options = await api.repos.options.listForQuestionVersion(question.id);
      return buildBundle(
        question,
        options,
        question.caseId ? cases.get(question.caseId) : undefined,
      );
    }),
  );
  return new Map(
    loaded.flatMap((bundle) => (bundle ? [[bundle.question.id, bundle] as const] : [])),
  );
}

/**
 * Arma el examen, registra su inicio y lo guarda en el navegador. null si no hay preguntas
 * elegibles
 */
export async function startExam(input: {
  api: Pick<DataApi, 'recordEvent'>;
  user: Pick<User, 'id' | 'timeZone'>;
  questions: readonly Pick<Question, 'id' | 'caseId' | 'caseOrder' | 'branch'>[];
  requested: number;
  options: ExamOptions;
  nowMs?: number;
}): Promise<ExamState | null> {
  const nowMs = input.nowMs ?? Date.now();
  const examId = newId();
  const plan = buildExam({
    questions: input.questions.map(({ id, caseId, caseOrder, branch }) => ({
      id,
      caseId,
      caseOrder,
      branch,
    })),
    requested: input.requested,
    seed: examId,
  });
  if (plan.questionIds.length === 0) return null;
  const state = createExamState({
    examId,
    userId: input.user.id,
    seed: examId,
    questionIds: plan.questionIds,
    requested: plan.requested,
    shortfall: plan.shortfall,
    totalMs: plan.totalMs,
    nowMs,
    ...input.options,
  });
  await input.api.recordEvent(
    createEvent(
      'session_started',
      {
        kind: 'exam',
        config: {
          examId,
          requested: plan.requested,
          count: plan.questionIds.length,
          shortfall: plan.shortfall,
          totalMs: plan.totalMs,
          ...input.options,
        },
      },
      { userId: input.user.id, tz: input.user.timeZone, sessionId: examId, clock: clockAt(nowMs) },
    ),
  );
  saveExamState(state);
  return state;
}

export interface CloseInput {
  api: Pick<DataApi, 'repos' | 'recordEvent'>;
  user: User;
  settings: UserSettings;
  state: ExamState;
  bundles: ExamBundles;
  /** Bitácora del alumno hasta ahora, para el multiplicador de racha y el tope de XP */
  events: readonly AppEvent[];
  /** Avisa cada vez que el cierre avanza, para pintar el progreso */
  onProgress?: (state: ExamState) => void;
}

/** Dos cierres a la vez del mismo examen, como en desarrollo con StrictMode, comparten el trabajo */
const inFlight = new Map<string, Promise<ExamState>>();

/**
 * Registra las respuestas con su XP, el fin de la sesión y manda los errores al repaso. Cada paso
 * se anota en el estado al terminarlo. Devuelve el estado final
 */
export function closeExam(input: CloseInput): Promise<ExamState> {
  const { examId } = input.state;
  const running = inFlight.get(examId);
  if (running) return running;
  const promise = runClose(input).finally(() => {
    inFlight.delete(examId);
  });
  inFlight.set(examId, promise);
  return promise;
}

async function runClose(input: CloseInput): Promise<ExamState> {
  const { api, user, settings, bundles } = input;
  let state = input.state;
  if (!isFinished(state)) return state;
  let known: AppEvent[] = [...input.events];
  const persist = (next: ExamState) => {
    state = next;
    saveExamState(next);
    input.onProgress?.(next);
  };

  // 1. Cada respuesta con su XP, fechada cuando el alumno la eligió
  for (const id of state.questionIds) {
    const answer = answerOf(state, id);
    const bundle = bundles.get(id);
    if (answer.optionId === null || !bundle || state.recorded.includes(id)) continue;
    // Una opción que ya no existe no se puede registrar como respuesta
    const chosen = bundle.options.find((option) => option.id === answer.optionId);
    if (!chosen) continue;
    const at = answer.answeredAtMs ?? state.finishedAtMs ?? Date.now();
    const recorded = await recordAnswerWithXp({
      api,
      user,
      settings,
      ctx: {
        userId: user.id,
        tz: user.timeZone,
        sessionId: state.examId,
        clock: clockAt(at),
      },
      payload: {
        questionVersionId: id,
        optionVersionId: answer.optionId,
        correct: chosen.isCorrect,
        confidence: answer.confidence,
        msToAnswer: Math.round(answer.msSpent),
        changeCount: answer.changes,
        highlightEnabled: state.highlight,
        ...(answer.eliminated.length > 0 ? { eliminatedOptionVersionIds: answer.eliminated } : {}),
        ...(answer.marked ? { markedForReview: true } : {}),
      },
      physicianDifficulty: bundle.question.physicianDifficulty,
      events: known,
    });
    known = [...known, recorded.answered, ...recorded.xpEvents];
    persist(markRecorded(state, id, recorded.xp));
  }

  // 2. El fin de la sesión, fechado cuando terminó el examen
  if (!state.sessionEnded) {
    const finishedAt = state.finishedAtMs ?? Date.now();
    const correct = examAnswers(state, bundles).filter(
      (answer) => answer.optionId !== null && answer.correct,
    ).length;
    await api.recordEvent(
      createEvent(
        'session_ended',
        {
          kind: 'exam',
          reason: state.endReason === 'abandoned' ? 'abandoned' : 'completed',
          items: answeredCount(state),
          correct,
          durationMs: Math.round(elapsedMs(state, finishedAt)),
          xp: state.xp,
        },
        { userId: user.id, tz: user.timeZone, sessionId: state.examId, clock: clockAt(finishedAt) },
      ),
    );
    persist(markSessionEnded(state));
  }

  // 3. Los errores pasan al repaso. Las preguntas en blanco no, porque no fueron un error
  if (state.queuedErrors === null) {
    const failed: FailedQuestion[] = [];
    for (const id of state.questionIds) {
      const bundle = bundles.get(id);
      const optionId = answerOf(state, id).optionId;
      const chosen = bundle?.options.find((option) => option.id === optionId);
      if (bundle && optionId !== null && chosen && !chosen.isCorrect)
        failed.push({ bundle, chosenOptionId: optionId });
    }
    persist(setQueuedErrors(state, await sendErrorsToReview(api, user, settings, failed)));
  }
  return state;
}
