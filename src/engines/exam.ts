/**
 * Examen completo, armado y calificación (10.1 pantallas 8 y 9, D-012, D-080).
 *
 * Qué hace. Arma un examen sin preguntas repetidas, repartido entre ramas por sus pesos del ENARM y
 * con los casos seriados juntos y en orden, con un tiempo total por reactivo. Califica las respuestas por rama, por
 * estructura, por trampa y por tipo de reactivo, y mide cómo descartó opciones.
 * Entradas. Las preguntas elegibles con su rama y su caso, cuántas se piden y una semilla. Al
 * calificar, la información de cada pregunta y lo que contestó el alumno.
 * Salidas. El plan del examen con cuántas había y cuántas faltaron, y el resultado con todos los
 * cortes.
 * Método
 *   - Una unidad es una pregunta suelta o un caso seriado completo. Cada rama tiene sus unidades
 *     barajadas con la semilla
 *   - Con pesos por rama (sección 6 del plan del cambio, B11), cada rama recibe una cuota proporcional
 *     a su peso entre las ramas que hay en el banco, con el método del residuo mayor, y se llena con
 *     unidades que quepan en su cuota. Las ramas que no entran al examen, como Inglés médico hasta
 *     B13, se quitan antes
 *   - Lo que falte, porque no hay pesos o porque una rama no alcanzó su cuota, se reparte parejo.
 *     Siempre se toma de la rama con menos preguntas hasta ahora, entre las que tienen una unidad
 *     que quepa en lo que falta. Al final se baraja el orden de las unidades
 *   - Si hay menos preguntas que las pedidas, el examen toma todas y avisa cuántas faltaron
 *     (D-012). Nunca repite una pregunta
 *   - El tiempo es el ritmo de 77 segundos por reactivo de D-074
 *   - Los cortes por estructura y por trampa son descriptivos de este examen. El patrón por
 *     sesgo y el análisis por estructura siguen calibrando en sus motores
 *   - Secciones (B13). El examen real trae 250 reactivos en español (clinical) y 30 de comprensión de
 *     textos en inglés (english). El plan trae cuántos se pidieron, cuántos salieron y cuántos faltaron en
 *     cada sección, con su tiempo por reactivo. Mientras el paquete B de B13 no arme la parte en inglés,
 *     todo se cuenta como clinical y buildExam se comporta como antes
 * Umbrales. 77 segundos por reactivo (J).
 */
import { ENARM_FORMAT } from '@/config/exam';
import { createRng } from './random';

/** Segundos por reactivo. Es el ritmo de referencia de Conócete (D-074) */
export const EXAM_SECONDS_PER_QUESTION = 77;

/** Tamaños que ofrece la configuración. 280 es el examen completo (D-012) */
export const EXAM_SIZES = [20, 50, 100, 280] as const;
export type ExamSize = (typeof EXAM_SIZES)[number];

/**
 * Las dos secciones del examen completo (sección 6 del plan del cambio). clinical son los 250 reactivos
 * en español y english los 30 de comprensión de textos en inglés, que se arman y se califican aparte
 */
export type ExamSection = 'clinical' | 'english';

export interface ExamQuestion {
  /** ID de la versión de la pregunta */
  id: string;
  caseId: string | null;
  caseOrder: number | null;
  branch: string;
  /**
   * Sección de la pregunta (B13). Sin el campo es clinical, como todo lo de antes. Es opcional en el
   * paso 0 de B13 para no tocar a quienes arman ExamQuestion todavía. El paquete B la llena desde el
   * banco y puede volverla obligatoria
   */
  section?: ExamSection;
}

/** Lo que pasó con una sección al armar el examen (B13) */
export interface ExamSectionPlan {
  /** Reactivos que se pidieron de esta sección */
  requested: number;
  /** Reactivos que salieron en el examen */
  picked: number;
  /** Cuántos faltaron por no haber suficientes, sin rellenar con la otra sección */
  shortfall: number;
  /** Ritmo de esta sección, que suma el tiempo total */
  secondsPerQuestion: number;
}

export interface ExamPlan {
  questionIds: string[];
  requested: number;
  /** Preguntas elegibles con las que se contaba */
  available: number;
  /** Cuántas se pidieron de más, por falta de preguntas */
  shortfall: number;
  totalMs: number;
  /**
   * El detalle por sección. Con el comportamiento de antes, todo es clinical y la parte en inglés queda
   * en cero
   */
  sections: Record<ExamSection, ExamSectionPlan>;
}

/**
 * Cuántos reactivos de inglés le tocan a un examen de ese tamaño, con la misma proporción del examen
 * completo (30 de 280). Redondea al entero más cercano. El examen real quita o agrega casos completos
 * después, porque un caso trae dos o tres preguntas (3.1 del plan de B13)
 */
export function englishTargetFor(
  size: number,
  format: { clinical: number; english: number } = ENARM_FORMAT,
): number {
  const total = format.clinical + format.english;
  if (total <= 0 || size <= 0) return 0;
  return Math.max(0, Math.round((size * format.english) / total));
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
  /** Peso de cada rama. Sin pesos, el reparto es parejo entre las ramas */
  branchWeights?: Readonly<Record<string, number>>;
  /** Ramas que no entran al examen, como Inglés médico hasta B13 */
  excludeBranches?: readonly string[];
  /**
   * La parte en inglés del examen (B13). Todavía no tiene efecto, la arma el paquete B de B13. Con
   * include en false el examen es solo en español
   */
  english?: { include: boolean; secondsPerQuestion: number; placement: 'mixed' | 'end' };
}): ExamPlan {
  const requested = Math.max(0, Math.floor(input.requested));
  const excluded = new Set(input.excludeBranches ?? []);
  const eligible = input.questions.filter((question) => !excluded.has(question.branch));
  const units = new Map<string, ExamQuestion[]>();
  for (const question of eligible) {
    const key = question.caseId ?? question.id;
    units.set(key, [...(units.get(key) ?? []), question]);
  }
  for (const unit of units.values()) unit.sort((a, b) => (a.caseOrder ?? 0) - (b.caseOrder ?? 0));

  // Cola de unidades por rama, barajada con la semilla. Una unidad es de la rama de su primera pregunta
  const lanes = new Map<string, { queue: ExamQuestion[][]; count: number }>();
  for (const unit of units.values()) {
    const branch = (unit[0] as ExamQuestion).branch;
    const lane = lanes.get(branch);
    if (lane) lane.queue.push(unit);
    else lanes.set(branch, { queue: [unit], count: 0 });
  }
  const branches = [...lanes.keys()].sort();
  for (const [branch, lane] of lanes)
    lane.queue = createRng(`${input.seed}|branch|${branch}`).shuffle(lane.queue);
  const laneOf = (branch: string) =>
    lanes.get(branch) as { queue: ExamQuestion[][]; count: number };

  const picked: ExamQuestion[][] = [];
  let remaining = Math.min(requested, eligible.length);
  const take = (branch: string, fits: (unit: ExamQuestion[]) => boolean): boolean => {
    const lane = laneOf(branch);
    const index = lane.queue.findIndex(fits);
    if (index < 0) return false;
    const [unit] = lane.queue.splice(index, 1) as [ExamQuestion[]];
    picked.push(unit);
    lane.count += unit.length;
    remaining -= unit.length;
    return true;
  };
  const fitsRemaining = (unit: ExamQuestion[]) => unit.length <= remaining;

  // Primero la cuota de cada rama por su peso. Un caso que no cabe en la cuota espera al reparto parejo
  if (input.branchWeights) {
    const quotas = branchQuotas(remaining, input.branchWeights, branches);
    for (const [branch, quota] of quotas) {
      const fitsQuota = (unit: ExamQuestion[]) =>
        fitsRemaining(unit) && laneOf(branch).count + unit.length <= quota;
      let added = true;
      while (added) added = take(branch, fitsQuota);
    }
  }

  // Lo que falta se reparte parejo. Se elige siempre la rama con menos preguntas hasta ahora, entre las
  // que tienen una unidad que quepa. Así el reparto queda parejo aunque algunas unidades sean casos de 3
  while (remaining > 0) {
    const [branch] = branches
      .filter((candidate) => laneOf(candidate).queue.some(fitsRemaining))
      .sort((a, b) => laneOf(a).count - laneOf(b).count || a.localeCompare(b));
    if (branch === undefined) break;
    take(branch, fitsRemaining);
  }

  const ordered = createRng(`${input.seed}|order`).shuffle(picked).flat();
  const secondsPerQuestion = input.secondsPerQuestion ?? EXAM_SECONDS_PER_QUESTION;
  return {
    questionIds: ordered.map((question) => question.id),
    requested,
    available: eligible.length,
    shortfall: Math.max(0, requested - ordered.length),
    totalMs: examTotalMs(ordered.length, input.secondsPerQuestion),
    // Sin la parte en inglés todo es de la sección clinical
    sections: {
      clinical: {
        requested,
        picked: ordered.length,
        shortfall: Math.max(0, requested - ordered.length),
        secondsPerQuestion,
      },
      english: {
        requested: 0,
        picked: 0,
        shortfall: 0,
        secondsPerQuestion: input.english?.secondsPerQuestion ?? secondsPerQuestion,
      },
    },
  };
}

/**
 * Cuántas preguntas le tocan a cada rama del banco por su peso, sumando total. Residuo mayor, con el
 * empate por clave. Una rama sin peso o con peso cero no tiene cuota y solo entra en el reparto parejo
 */
export function branchQuotas(
  total: number,
  weights: Readonly<Record<string, number>>,
  branches: readonly string[],
): Map<string, number> {
  const exact = branches
    .map((branch) => ({ branch, weight: weights[branch] ?? 0 }))
    .filter((entry) => entry.weight > 0);
  const sum = exact.reduce((acc, entry) => acc + entry.weight, 0);
  if (sum <= 0 || total <= 0) return new Map();
  const shares = exact.map(({ branch, weight }) => {
    const value = (total * weight) / sum;
    return { branch, quota: Math.floor(value), remainder: value - Math.floor(value) };
  });
  // Lo que sobra al redondear hacia abajo va a las de residuo mayor, una a cada una
  const left = total - shares.reduce((acc, share) => acc + share.quota, 0);
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.branch.localeCompare(b.branch),
  );
  for (const share of byRemainder.slice(0, left)) share.quota += 1;
  return new Map(shares.map((share) => [share.branch, share.quota]));
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
