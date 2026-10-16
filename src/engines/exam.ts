/**
 * Examen completo, armado y calificación (10.1 pantallas 8 y 9, D-012, D-080).
 *
 * Qué hace. Arma un examen sin preguntas repetidas, repartido entre ramas por sus pesos del ENARM y
 * con los casos seriados juntos y en orden, con un tiempo total por reactivo. Califica las respuestas por rama, por
 * estructura, por trampa y por tipo de reactivo, y mide cómo descartó opciones.
 * Entradas. Las preguntas elegibles con su rama, su sección y su caso, cuántas se piden y una semilla.
 * Al calificar, la información de cada pregunta y lo que contestó el alumno.
 * Salidas. El plan del examen con cuántas había y cuántas faltaron, y el resultado con todos los
 * cortes, también por sección.
 * Método
 *   - Una unidad es una pregunta suelta o un caso seriado completo. Cada rama tiene sus unidades
 *     barajadas con la semilla
 *   - Con pesos por rama (sección 6 del plan del cambio, B11), cada rama recibe una cuota proporcional
 *     a su peso entre las ramas que hay en el banco, con el método del residuo mayor, y se llena con
 *     unidades que quepan en su cuota. Las ramas que no entran al examen, como Inglés médico en el
 *     examen solo en español, se quitan antes
 *   - Lo que falte, porque no hay pesos o porque una rama no alcanzó su cuota, se reparte parejo.
 *     Siempre se toma de la rama con menos preguntas hasta ahora, entre las que tienen una unidad
 *     que quepa en lo que falta. Al final se baraja el orden de las unidades
 *   - Si hay menos preguntas que las pedidas, el examen toma todas y avisa cuántas faltaron
 *     (D-012). Nunca repite una pregunta
 *   - El tiempo es el ritmo de 77 segundos por reactivo de D-074, y el de la parte en inglés el suyo (90
 *     segundos de fábrica, 8.3 del plan de B13)
 *   - Los cortes por estructura y por trampa son descriptivos de este examen. El patrón por
 *     sesgo y el análisis por estructura siguen calibrando en sus motores
 *   - Secciones (B13). El examen real trae 250 reactivos en español (clinical) y 30 de comprensión de
 *     textos en inglés (english). Con la parte en inglés incluida, a english le tocan englishTargetFor
 *     reactivos del tamaño pedido, la misma proporción de 30 en 280. Un caso trae dos o tres preguntas y
 *     no se parte, así que se toma la combinación de casos completos que más se acerca al objetivo sin
 *     pasarse (subconjunto de suma máxima, el más temprano en el orden barajado con la semilla) y lo que
 *     quede sin cubrir por el tamaño de los casos pasa al español. Si no hay inglés suficiente se toma
 *     todo lo que hay y la sección avisa cuántos faltaron. El español no rellena esa falta, así los 250
 *     siguen siendo 250 (8.6). Las unidades de las dos secciones van mezcladas, o con el inglés al final en
 *     un bloque, según el acomodo (8.4). Sin la parte en inglés el examen es solo en español
 * Umbrales. 77 segundos por reactivo (J) y los 90 segundos del inglés (J, thresholds.english).
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
  /** Sección de la pregunta (B13). La dan sectionOf o la rama del banco, según el idioma de la pregunta */
  section: ExamSection;
}

/** Lo que pasó con una sección al armar el examen (B13) */
export interface ExamSectionPlan {
  /**
   * Reactivos que se pidieron de esta sección. En la de inglés, si hay de sobra pero los casos no cuadran
   * con la proporción, es lo que entró y no la proporción, que sale de englishTargetFor (la tarjeta del
   * examen avisa con eso). Solo si no hay inglés suficiente suma también lo que faltó
   */
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

/**
 * La sección de una pregunta por su idioma. Sin idioma es español, o sea clinical, como todo lo de antes
 * de B13. Inglés médico va en inglés y el resto del banco en español (language_branch_mismatch en el
 * servidor), así que el idioma y la sección de una rama dicen lo mismo
 */
export function sectionOf(question: { language?: 'es' | 'en' | undefined }): ExamSection {
  return question.language === 'en' ? 'english' : 'clinical';
}

/**
 * Qué unidades tomar para sumar lo más cerca posible de target sin pasarse. sizes son los tamaños de las
 * unidades en el orden en que se barajaron. Devuelve las posiciones elegidas, de menor a mayor. Entre las
 * combinaciones que suman lo máximo toma la más temprana en ese orden, así sale una sola y reproducible.
 * Es la suma de subconjuntos con programación dinámica sobre las sumas que se pueden alcanzar con las
 * unidades que faltan por recorrer
 */
export function bestUnitSubset(sizes: readonly number[], target: number): number[] {
  const limit = Math.floor(target);
  if (sizes.length === 0 || limit <= 0) return [];
  // reach[i][s] es true si con las unidades i en adelante se puede sumar exactamente s
  const reach: boolean[][] = Array.from({ length: sizes.length + 1 }, () =>
    Array.from({ length: limit + 1 }, () => false),
  );
  (reach[sizes.length] as boolean[])[0] = true;
  for (let index = sizes.length - 1; index >= 0; index -= 1) {
    const size = sizes[index] as number;
    const later = reach[index + 1] as boolean[];
    const row = reach[index] as boolean[];
    for (let sum = 0; sum <= limit; sum += 1) {
      row[sum] = (later[sum] as boolean) || (sum >= size && (later[sum - size] as boolean));
    }
  }
  const first = reach[0] as boolean[];
  let need = limit;
  while (need > 0 && !first[need]) need -= 1;
  const chosen: number[] = [];
  for (let index = 0; index < sizes.length && need > 0; index += 1) {
    const size = sizes[index] as number;
    if (need >= size && (reach[index + 1] as boolean[])[need - size]) {
      chosen.push(index);
      need -= size;
    }
  }
  return chosen;
}

/** Junta las preguntas en unidades. Una pregunta suelta es una unidad y un caso seriado va completo y en orden */
function unitsOf(questions: readonly ExamQuestion[]): ExamQuestion[][] {
  const units = new Map<string, ExamQuestion[]>();
  for (const question of questions) {
    const key = question.caseId ?? question.id;
    units.set(key, [...(units.get(key) ?? []), question]);
  }
  for (const unit of units.values()) unit.sort((a, b) => (a.caseOrder ?? 0) - (b.caseOrder ?? 0));
  return [...units.values()];
}

/**
 * Las unidades de la sección clínica que entran al examen: por cuota de rama si hay pesos y después
 * parejo entre ramas. Es el armado de siempre, sin cambios, sobre las preguntas en español
 */
function pickClinicalUnits(input: {
  questions: readonly ExamQuestion[];
  requested: number;
  seed: string;
  branchWeights: Readonly<Record<string, number>> | undefined;
}): ExamQuestion[][] {
  // Cola de unidades por rama, barajada con la semilla. Una unidad es de la rama de su primera pregunta
  const lanes = new Map<string, { queue: ExamQuestion[][]; count: number }>();
  for (const unit of unitsOf(input.questions)) {
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
  let remaining = Math.min(input.requested, input.questions.length);
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
  return picked;
}

export function buildExam(input: {
  questions: readonly ExamQuestion[];
  requested: number;
  seed: string;
  secondsPerQuestion?: number;
  /** Peso de cada rama. Sin pesos, el reparto es parejo entre las ramas */
  branchWeights?: Readonly<Record<string, number>>;
  /** Ramas que no entran al examen */
  excludeBranches?: readonly string[];
  /**
   * La parte en inglés del examen (B13). Con include en true, a la sección english le toca englishTargetFor
   * del tamaño pedido y se acomoda mezclada o al final. Con include en false, o sin este campo, el examen
   * es solo en español y las preguntas en inglés no entran ni cuentan como elegibles
   */
  english?: { include: boolean; secondsPerQuestion: number; placement: 'mixed' | 'end' };
}): ExamPlan {
  const requested = Math.max(0, Math.floor(input.requested));
  const excluded = new Set(input.excludeBranches ?? []);
  const eligible = input.questions.filter((question) => !excluded.has(question.branch));
  const include = input.english?.include === true;
  const clinicalPool = eligible.filter((question) => question.section === 'clinical');
  const englishPool = include ? eligible.filter((question) => question.section === 'english') : [];
  const clinicalSeconds = input.secondsPerQuestion ?? EXAM_SECONDS_PER_QUESTION;
  const englishSeconds = input.english?.secondsPerQuestion ?? clinicalSeconds;

  // La parte en inglés. Casos completos barajados con la semilla, y de ellos la combinación que más se
  // acerca al objetivo sin pasarse
  const englishTarget = include ? Math.min(englishTargetFor(requested), requested) : 0;
  const englishUnits = createRng(`${input.seed}|english`).shuffle(unitsOf(englishPool));
  const englishPicked = bestUnitSubset(
    englishUnits.map((unit) => unit.length),
    englishTarget,
  ).map((index) => englishUnits[index] as ExamQuestion[]);
  const englishCount = englishPicked.reduce((sum, unit) => sum + unit.length, 0);
  // Si el inglés alcanza pero los casos no cuadran con el objetivo, lo que sobra pasa al español. Solo es
  // falta cuando no hay inglés suficiente, y entonces el español no lo rellena (8.6)
  const englishShortfall = englishPool.length >= englishTarget ? 0 : englishTarget - englishCount;
  const clinicalRequested = requested - englishCount - englishShortfall;

  const clinicalPicked = pickClinicalUnits({
    questions: clinicalPool,
    requested: clinicalRequested,
    seed: input.seed,
    branchWeights: input.branchWeights,
  });
  const clinicalCount = clinicalPicked.reduce((sum, unit) => sum + unit.length, 0);

  // Orden. Mezcladas, las unidades de las dos secciones se barajan juntas. Al final, el inglés va en un
  // bloque después del español
  const placement = input.english?.placement ?? 'mixed';
  const ordered =
    placement === 'end'
      ? [
          ...createRng(`${input.seed}|order`).shuffle(clinicalPicked),
          ...createRng(`${input.seed}|english-order`).shuffle(englishPicked),
        ].flat()
      : createRng(`${input.seed}|order`)
          .shuffle([...clinicalPicked, ...englishPicked])
          .flat();

  const clinicalShortfall = Math.max(0, clinicalRequested - clinicalCount);
  return {
    questionIds: ordered.map((question) => question.id),
    requested,
    available: clinicalPool.length + englishPool.length,
    shortfall: Math.max(0, requested - ordered.length),
    totalMs: Math.round(
      clinicalCount * clinicalSeconds * 1000 + englishCount * englishSeconds * 1000,
    ),
    sections: {
      clinical: {
        requested: clinicalRequested,
        picked: clinicalCount,
        shortfall: clinicalShortfall,
        secondsPerQuestion: clinicalSeconds,
      },
      english: {
        requested: englishCount + englishShortfall,
        picked: englishCount,
        shortfall: englishShortfall,
        secondsPerQuestion: englishSeconds,
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
  /** Sección del reactivo. Sin el campo es clinical (B13) */
  section?: ExamSection;
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

/** Lo que pasó en una sección del examen, como Español 180 de 250 o Inglés 22 de 30 (B13, 3.6) */
export interface SectionScore {
  total: number;
  answered: number;
  correct: number;
  blank: number;
  timeUsedMs: number;
  /** Tiempo medio de las que contestó en esta sección. null si no contestó ninguna */
  averageMsPerAnswered: number | null;
}

export interface ExamScore {
  total: number;
  answered: number;
  correct: number;
  blank: number;
  /** Aciertos entre preguntas del examen. null si no hubo preguntas */
  accuracy: number | null;
  /** El corte por sección. La sección que no tuvo reactivos queda en ceros */
  bySection: Record<ExamSection, SectionScore>;
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

const emptySection = (): SectionScore => ({
  total: 0,
  answered: 0,
  correct: 0,
  blank: 0,
  timeUsedMs: 0,
  averageMsPerAnswered: null,
});

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
    bySection: { clinical: emptySection(), english: emptySection() },
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
  const sectionAnsweredMs: Record<ExamSection, number> = { clinical: 0, english: 0 };

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

    const section = score.bySection[question.section ?? 'clinical'];
    section.total += 1;
    if (answered) section.answered += 1;
    else section.blank += 1;
    if (answer.correct && answered) section.correct += 1;
    section.timeUsedMs += answer.msSpent;
    if (answered) sectionAnsweredMs[question.section ?? 'clinical'] += answer.msSpent;

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

  for (const key of ['clinical', 'english'] as const) {
    const section = score.bySection[key];
    section.averageMsPerAnswered =
      section.answered === 0 ? null : sectionAnsweredMs[key] / section.answered;
  }
  score.accuracy = score.total === 0 ? null : score.correct / score.total;
  score.averageMsPerAnswered = score.answered === 0 ? null : answeredMs / score.answered;
  score.biasTags = [...tags.entries()]
    .map(([tag, wrongChoices]) => ({ tag, wrongChoices }))
    .sort((a, b) => b.wrongChoices - a.wrongChoices || a.tag.localeCompare(b.tag));
  return score;
}
