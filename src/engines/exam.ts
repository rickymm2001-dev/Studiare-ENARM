/**
 * Examen completo, armado y calificación (10.1 pantallas 8 y 9, D-012, D-080).
 *
 * Qué hace. Arma un examen sin preguntas repetidas, parejo entre ramas y con los casos seriados
 * juntos y en orden, con un tiempo total por reactivo. Califica las respuestas por rama, por
 * estructura, por trampa y por tipo de reactivo, y mide cómo descartó opciones.
 * Entradas. Las preguntas elegibles con su rama y su caso, cuántas se piden y una semilla. Al
 * calificar, la información de cada pregunta y lo que contestó el alumno.
 * Salidas. El plan del examen con cuántas había y cuántas faltaron, y el resultado con todos los
 * cortes.
 * Método
 *   - Una unidad es una pregunta suelta o un caso seriado completo. Cada rama tiene sus unidades
 *     barajadas con la semilla y siempre se toma de la rama con menos preguntas hasta ahora, entre
 *     las que tienen una unidad que quepa en lo que falta. Al final se baraja el orden de las unidades
 *   - Si hay menos preguntas que las pedidas, el examen toma todas y avisa cuántas faltaron
 *     (D-012). Nunca repite una pregunta
 *   - El tiempo es el ritmo de 77 segundos por reactivo de D-074
 *   - Los cortes por estructura y por trampa son descriptivos de este examen. El patrón por
 *     sesgo y el análisis por estructura siguen calibrando en sus motores
 * Umbrales. 77 segundos por reactivo (J).
 */
import { createRng } from './random';

/** Segundos por reactivo. Es el ritmo de referencia de Conócete (D-074) */
export const EXAM_SECONDS_PER_QUESTION = 77;

/** Tamaños que ofrece la configuración. 280 es el examen completo (D-012) */
export const EXAM_SIZES = [20, 50, 100, 280] as const;
export type ExamSize = (typeof EXAM_SIZES)[number];

export interface ExamQuestion {
  /** ID de la versión de la pregunta */
  id: string;
  caseId: string | null;
  caseOrder: number | null;
  branch: string;
}

export interface ExamPlan {
  questionIds: string[];
  requested: number;
  /** Preguntas elegibles con las que se contaba */
  available: number;
  /** Cuántas se pidieron de más, por falta de preguntas */
  shortfall: number;
  totalMs: number;
}

export function examTotalMs(
  questions: number,
  secondsPerQuestion = EXAM_SECONDS_PER_QUESTION,
): number {
  return Math.max(0, Math.round(questions)) * secondsPerQuestion * 1000;
}

export function buildExam(input: {
  questions: readonly ExamQuestion[];
  requested: number;
  seed: string;
  secondsPerQuestion?: number;
}): ExamPlan {
  const requested = Math.max(0, Math.floor(input.requested));
  const units = new Map<string, ExamQuestion[]>();
  for (const question of input.questions) {
    const key = question.caseId ?? question.id;
    units.set(key, [...(units.get(key) ?? []), question]);
  }
  for (const unit of units.values()) unit.sort((a, b) => (a.caseOrder ?? 0) - (b.caseOrder ?? 0));

  // Cola de unidades por rama, barajada con la semilla. Una unidad es de la rama de su primera pregunta
  const queues = new Map<string, ExamQuestion[][]>();
  for (const unit of units.values()) {
    const branch = unit[0]?.branch ?? '';
    queues.set(branch, [...(queues.get(branch) ?? []), unit]);
  }
  const branches = [...queues.keys()].sort();
  for (const branch of branches) {
    const rng = createRng(`${input.seed}|branch|${branch}`);
    queues.set(branch, rng.shuffle(queues.get(branch) ?? []));
  }

  // Se elige siempre la rama con menos preguntas hasta ahora, entre las que tienen una unidad que
  // quepa. Así el reparto queda parejo aunque algunas unidades sean casos de 3 preguntas
  const picked: ExamQuestion[][] = [];
  const counts = new Map<string, number>(branches.map((branch) => [branch, 0]));
  let remaining = Math.min(requested, input.questions.length);
  while (remaining > 0) {
    const fitting = branches
      .filter((branch) => (queues.get(branch) ?? []).some((unit) => unit.length <= remaining))
      .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a.localeCompare(b));
    const branch = fitting[0];
    if (branch === undefined) break;
    const queue = queues.get(branch) ?? [];
    const [unit] = queue.splice(
      queue.findIndex((candidate) => candidate.length <= remaining),
      1,
    );
    if (!unit) break;
    picked.push(unit);
    counts.set(branch, (counts.get(branch) ?? 0) + unit.length);
    remaining -= unit.length;
  }

  const ordered = createRng(`${input.seed}|order`).shuffle(picked).flat();
  return {
    questionIds: ordered.map((question) => question.id),
    requested,
    available: input.questions.length,
    shortfall: Math.max(0, requested - ordered.length),
    totalMs: examTotalMs(ordered.length, input.secondsPerQuestion),
  };
}

/** Tipos de reactivo de D-080. Un reactivo puede tener varios */
export type ItemKind =
  'inverse_resolution' | 'incoherent' | 'control' | 'obscure_detail' | 'patient_perspective';

export interface ExamQuestionInfo {
  id: string;
  branch: string;
  topic: string;
  polarity: 'affirmative' | 'negative';
  task: string;
  kinds: readonly ItemKind[];
}

export interface ExamAnswer {
  questionId: string;
  /** null si la dejó en blanco */
  optionId: string | null;
  correct: boolean;
  /** Etiqueta de sesgo de la opción que eligió. null si acertó o la dejó en blanco */
  chosenBiasTag: string | null;
  msSpent: number;
  marked: boolean;
  /** Opciones que descartó */
  eliminatedCount: number;
  /** Descartó la opción correcta */
  eliminatedCorrect: boolean;
}

export interface Tally {
  total: number;
  answered: number;
  correct: number;
}

export interface ExamScore {
  total: number;
  answered: number;
  correct: number;
  blank: number;
  /** Aciertos entre preguntas del examen. null si no hubo preguntas */
  accuracy: number | null;
  byBranch: Record<string, Tally>;
  byTopic: Record<string, Tally>;
  byPolarity: Record<'affirmative' | 'negative', Tally>;
  byTask: Record<string, Tally>;
  /** Trampas de las opciones que eligió al fallar, de más a menos */
  biasTags: { tag: string; wrongChoices: number }[];
  /** Resultado de los reactivos de cada tipo especial que hubo en el examen */
  specialKinds: Partial<Record<ItemKind, Tally>>;
  elimination: {
    questionsWithElimination: number;
    eliminated: number;
    /** Veces que descartó la correcta */
    eliminatedCorrect: number;
  };
  marked: number;
  timeUsedMs: number;
  /** Tiempo medio de las que contestó. null si no contestó ninguna */
  averageMsPerAnswered: number | null;
  /** IDs de las falladas y de las que dejó en blanco, en el orden del examen */
  missedIds: string[];
  blankIds: string[];
}

const emptyTally = (): Tally => ({ total: 0, answered: 0, correct: 0 });

function add(map: Record<string, Tally>, key: string, answer: ExamAnswer) {
  const tally = (map[key] ??= emptyTally());
  tally.total += 1;
  if (answer.optionId !== null) tally.answered += 1;
  if (answer.correct) tally.correct += 1;
}

export function scoreExam(input: {
  /** Preguntas del examen en su orden */
  questions: readonly ExamQuestionInfo[];
  answers: readonly ExamAnswer[];
}): ExamScore {
  const byId = new Map(input.answers.map((answer) => [answer.questionId, answer]));
  const score: ExamScore = {
    total: input.questions.length,
    answered: 0,
    correct: 0,
    blank: 0,
    accuracy: null,
    byBranch: {},
    byTopic: {},
    byPolarity: { affirmative: emptyTally(), negative: emptyTally() },
    byTask: {},
    biasTags: [],
    specialKinds: {},
    elimination: { questionsWithElimination: 0, eliminated: 0, eliminatedCorrect: 0 },
    marked: 0,
    timeUsedMs: 0,
    averageMsPerAnswered: null,
    missedIds: [],
    blankIds: [],
  };
  const tags = new Map<string, number>();
  let answeredMs = 0;

  for (const question of input.questions) {
    // Sin registro cuenta como en blanco
    const answer: ExamAnswer = byId.get(question.id) ?? {
      questionId: question.id,
      optionId: null,
      correct: false,
      chosenBiasTag: null,
      msSpent: 0,
      marked: false,
      eliminatedCount: 0,
      eliminatedCorrect: false,
    };
    const answered = answer.optionId !== null;
    if (answered) score.answered += 1;
    else {
      score.blank += 1;
      score.blankIds.push(question.id);
    }
    if (answer.correct && answered) score.correct += 1;
    else if (answered) score.missedIds.push(question.id);

    add(score.byBranch, question.branch, answer);
    add(score.byTopic, question.topic, answer);
    add(score.byTask, question.task, answer);
    const polarity = score.byPolarity[question.polarity];
    polarity.total += 1;
    if (answered) polarity.answered += 1;
    if (answer.correct && answered) polarity.correct += 1;

    for (const kind of question.kinds) {
      const tally = (score.specialKinds[kind] ??= emptyTally());
      tally.total += 1;
      if (answered) tally.answered += 1;
      if (answer.correct && answered) tally.correct += 1;
    }

    if (answered && !answer.correct && answer.chosenBiasTag)
      tags.set(answer.chosenBiasTag, (tags.get(answer.chosenBiasTag) ?? 0) + 1);

    if (answer.eliminatedCount > 0) score.elimination.questionsWithElimination += 1;
    score.elimination.eliminated += answer.eliminatedCount;
    if (answer.eliminatedCorrect) score.elimination.eliminatedCorrect += 1;
    if (answer.marked) score.marked += 1;
    score.timeUsedMs += answer.msSpent;
    if (answered) answeredMs += answer.msSpent;
  }

  score.accuracy = score.total === 0 ? null : score.correct / score.total;
  score.averageMsPerAnswered = score.answered === 0 ? null : answeredMs / score.answered;
  score.biasTags = [...tags.entries()]
    .map(([tag, wrongChoices]) => ({ tag, wrongChoices }))
    .sort((a, b) => b.wrongChoices - a.wrongChoices || a.tag.localeCompare(b.tag));
  return score;
}
