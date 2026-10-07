// Estado de un examen en curso (10.1 pantalla 8). Es una estructura sencilla que se guarda en el
// navegador a cada cambio, así un examen de horas sobrevive a una recarga. Todas las operaciones
// son funciones puras que reciben el estado y devuelven uno nuevo, para probarlas sin React.
// El reloj es el de pared. Si el alumno cierra la pestaña el tiempo sigue corriendo, como en el
// examen real (D-080).
import { z } from 'zod';
import { IdSchema, McqConfidenceSchema } from '@/data/schemas/common';

export const EXAM_STATE_VERSION = 1;

const AnswerStateSchema = z.strictObject({
  /** null si todavía no contesta */
  optionId: IdSchema.nullable(),
  /** null si no se pidió la confianza o no la indicó */
  confidence: McqConfidenceSchema.nullable(),
  /** Veces que cambió su respuesta después de la primera */
  changes: z.int().nonnegative(),
  /** Cuándo eligió su respuesta actual, para fechar el evento al registrarlo al terminar */
  answeredAtMs: z.number().nullable(),
  marked: z.boolean(),
  /** Opciones que descartó */
  eliminated: z.array(IdSchema).max(10),
  /** Tiempo acumulado en esta pregunta, sumando todas sus visitas */
  msSpent: z.number().nonnegative(),
  /** Ya se registró question_shown */
  shown: z.boolean(),
  /** Ya se le mostró el aviso de que se atoró */
  nudged: z.boolean(),
});
export type ExamAnswerState = z.infer<typeof AnswerStateSchema>;

export const ExamEndReasonSchema = z.enum(['completed', 'time_up', 'abandoned']);
export type ExamEndReason = z.infer<typeof ExamEndReasonSchema>;

export const ExamStateSchema = z.strictObject({
  version: z.literal(EXAM_STATE_VERSION),
  examId: IdSchema,
  userId: IdSchema,
  seed: z.string().min(1).max(64),
  questionIds: z.array(IdSchema).min(1).max(1000),
  requested: z.int().nonnegative(),
  shortfall: z.int().nonnegative(),
  startedAtMs: z.number(),
  totalMs: z.number().positive(),
  highlight: z.boolean(),
  askConfidence: z.boolean(),
  /** Alarmas de tiempo encendidas */
  alerts: z.boolean(),
  current: z.int().nonnegative(),
  /** Cuándo entró a la pregunta actual, para sumar su tiempo al salir */
  enteredAtMs: z.number(),
  answers: z.record(z.string(), AnswerStateSchema),
  /** Opciones que se le mostraron en cada pregunta, en orden, fijadas al verla por primera vez */
  shownOptions: z.record(z.string(), z.array(IdSchema).min(2).max(10)),
  firedAlerts: z.array(z.string().max(30)).max(40),
  finishedAtMs: z.number().nullable(),
  endReason: ExamEndReasonSchema.nullable(),
  /**
   * Avance del registro en la bitácora al terminar. Si el alumno recarga a la mitad, se retoma sin
   * duplicar eventos, porque la bitácora solo se agrega
   */
  recorded: z.array(IdSchema).max(1000),
  /** XP ganado por las respuestas ya registradas */
  xp: z.int().nonnegative(),
  sessionEnded: z.boolean(),
  /** Aciertos del examen. Se fijan al registrar el fin de la sesión, null mientras no pase */
  correct: z.int().nonnegative().nullable().default(null),
  /** Errores que pasaron al repaso. null si todavía no se hace o el alumno lo apagó */
  queuedErrors: z.int().nonnegative().nullable(),
});
export type ExamState = z.infer<typeof ExamStateSchema>;

const emptyAnswer = (): ExamAnswerState => ({
  optionId: null,
  confidence: null,
  changes: 0,
  answeredAtMs: null,
  marked: false,
  eliminated: [],
  msSpent: 0,
  shown: false,
  nudged: false,
});

export function createExamState(input: {
  examId: string;
  userId: string;
  seed: string;
  questionIds: readonly string[];
  requested: number;
  shortfall: number;
  totalMs: number;
  nowMs: number;
  highlight: boolean;
  askConfidence: boolean;
  alerts: boolean;
}): ExamState {
  return {
    version: EXAM_STATE_VERSION,
    examId: input.examId,
    userId: input.userId,
    seed: input.seed,
    questionIds: [...input.questionIds],
    requested: input.requested,
    shortfall: input.shortfall,
    startedAtMs: input.nowMs,
    totalMs: input.totalMs,
    highlight: input.highlight,
    askConfidence: input.askConfidence,
    alerts: input.alerts,
    current: 0,
    enteredAtMs: input.nowMs,
    answers: {},
    shownOptions: {},
    firedAlerts: [],
    finishedAtMs: null,
    endReason: null,
    recorded: [],
    xp: 0,
    sessionEnded: false,
    correct: null,
    queuedErrors: null,
  };
}

export const answerOf = (state: ExamState, questionId: string): ExamAnswerState =>
  state.answers[questionId] ?? emptyAnswer();

const withAnswer = (
  state: ExamState,
  questionId: string,
  patch: Partial<ExamAnswerState>,
): ExamState => ({
  ...state,
  answers: { ...state.answers, [questionId]: { ...answerOf(state, questionId), ...patch } },
});

/** Momento en que se acaba el tiempo */
export const deadlineMs = (state: ExamState): number => state.startedAtMs + state.totalMs;

/** Tiempo transcurrido, sin pasar del total. Con el examen cerrado es lo que duró */
export function elapsedMs(state: ExamState, nowMs: number): number {
  const end = state.finishedAtMs ?? nowMs;
  return Math.min(Math.max(end - state.startedAtMs, 0), state.totalMs);
}

export const remainingMs = (state: ExamState, nowMs: number): number =>
  state.totalMs - elapsedMs(state, nowMs);

export const isFinished = (state: ExamState): boolean => state.finishedAtMs !== null;

/**
 * El examen terminó y ya quedó todo en la bitácora y en el repaso. Mientras no, empezar otro
 * pisaría el estado que todavía falta registrar
 */
export const isClosed = (state: ExamState): boolean =>
  isFinished(state) && state.sessionEnded && state.queuedErrors !== null;

export const answeredCount = (state: ExamState): number =>
  state.questionIds.filter((id) => answerOf(state, id).optionId !== null).length;

export const markedCount = (state: ExamState): number =>
  state.questionIds.filter((id) => answerOf(state, id).marked).length;

/** Suma al tiempo de la pregunta actual lo que lleva en ella, sin pasar del tiempo del examen */
function closeCurrent(state: ExamState, nowMs: number): ExamState {
  const id = state.questionIds[state.current];
  if (id === undefined) return state;
  const until = Math.min(nowMs, deadlineMs(state));
  const spent = Math.max(0, until - state.enteredAtMs);
  return withAnswer(state, id, { msSpent: answerOf(state, id).msSpent + spent });
}

/** Cambia de pregunta. Suma el tiempo de la que deja */
export function goTo(state: ExamState, index: number, nowMs: number): ExamState {
  const target = Math.min(Math.max(Math.trunc(index), 0), state.questionIds.length - 1);
  if (isFinished(state) || target === state.current) return state;
  return { ...closeCurrent(state, nowMs), current: target, enteredAtMs: nowMs };
}

export interface ChooseResult {
  state: ExamState;
  /** La opción anterior, o null si es la primera respuesta */
  from: string | null;
  /** false si volvió a tocar la que ya tenía */
  changed: boolean;
}

/**
 * Elige una opción. Si estaba descartada se vuelve a incluir. Con el examen cerrado o pasado el
 * tiempo ya no cuenta, como en el examen real
 */
export function choose(
  state: ExamState,
  questionId: string,
  optionId: string,
  nowMs: number,
): ChooseResult {
  const current = answerOf(state, questionId);
  if (isFinished(state) || nowMs >= deadlineMs(state) || current.optionId === optionId)
    return { state, from: current.optionId, changed: false };
  return {
    state: withAnswer(state, questionId, {
      optionId,
      answeredAtMs: nowMs,
      changes: current.optionId === null ? current.changes : current.changes + 1,
      eliminated: current.eliminated.filter((id) => id !== optionId),
    }),
    from: current.optionId,
    changed: true,
  };
}

export function setConfidence(
  state: ExamState,
  questionId: string,
  confidence: ExamAnswerState['confidence'],
): ExamState {
  if (isFinished(state)) return state;
  return withAnswer(state, questionId, { confidence });
}

/** Descarta o vuelve a incluir una opción. La que tiene elegida no se puede descartar */
export function toggleEliminated(
  state: ExamState,
  questionId: string,
  optionId: string,
): ExamState {
  const current = answerOf(state, questionId);
  if (isFinished(state) || current.optionId === optionId) return state;
  const eliminated = current.eliminated.includes(optionId)
    ? current.eliminated.filter((id) => id !== optionId)
    : [...current.eliminated, optionId];
  return withAnswer(state, questionId, { eliminated });
}

export function toggleMarked(state: ExamState, questionId: string): ExamState {
  if (isFinished(state)) return state;
  return withAnswer(state, questionId, { marked: !answerOf(state, questionId).marked });
}

/** Fija las opciones que se mostraron la primera vez que se ve la pregunta */
export function recordShown(
  state: ExamState,
  questionId: string,
  optionIds: readonly string[],
): ExamState {
  if (state.shownOptions[questionId]) return state;
  return {
    ...withAnswer(state, questionId, { shown: true }),
    shownOptions: { ...state.shownOptions, [questionId]: [...optionIds] },
  };
}

export const markNudged = (state: ExamState, questionId: string): ExamState =>
  withAnswer(state, questionId, { nudged: true });

export function addFiredAlerts(state: ExamState, ids: readonly string[]): ExamState {
  const fresh = ids.filter((id) => !state.firedAlerts.includes(id));
  return fresh.length === 0 ? state : { ...state, firedAlerts: [...state.firedAlerts, ...fresh] };
}

/** Cierra el examen. Si terminó por tiempo, el cierre queda en el límite y no más tarde */
export function finishExamState(state: ExamState, nowMs: number, reason: ExamEndReason): ExamState {
  if (isFinished(state)) return state;
  const at = reason === 'time_up' ? deadlineMs(state) : Math.min(nowMs, deadlineMs(state));
  return { ...closeCurrent(state, at), finishedAtMs: at, endReason: reason };
}

/** Anota que la respuesta de una pregunta ya quedó en la bitácora, con el XP que ganó */
export function markRecorded(state: ExamState, questionId: string, xp: number): ExamState {
  if (state.recorded.includes(questionId)) return state;
  return { ...state, recorded: [...state.recorded, questionId], xp: state.xp + xp };
}

/** Anota que el fin de la sesión ya quedó en la bitácora, con los aciertos que tuvo */
export const markSessionEnded = (state: ExamState, correct: number): ExamState => ({
  ...state,
  sessionEnded: true,
  correct,
});

export const setQueuedErrors = (state: ExamState, count: number): ExamState => ({
  ...state,
  queuedErrors: count,
});
