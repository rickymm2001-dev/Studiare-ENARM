// Modelo de respuesta de los alumnos simulados (11.2). Funciones puras con semilla, sin Dexie ni
// React. Cada alumno tiene parámetros verdaderos y sus respuestas salen de un modelo Rasch con
// atracción extra hacia los distractores de su sesgo, errores extra en preguntas negativas según
// su tendencia a leer mal, fatiga en sesiones largas, tiempos y cambios de respuesta realistas y
// confianza que se correlaciona con el acierto. Todos los valores son juicio de diseño (J).
import type { Rng } from '@/engines/random';

export const GENERATOR_VERSION = 'b9-2';

export interface FatigueTruth {
  /** Minuto de la sesión desde el que empieza a cansarse */
  onsetMinutes: number;
  /** Logits que pierde por cada minuto después del inicio de la fatiga */
  logitPerMinute: number;
}

export interface StudentTruth {
  /** Habilidad general en logits */
  ability: number;
  /** Habilidad extra por rama, en logits */
  branchOffset: Record<string, number>;
  /** Habilidad extra por tema, en logits. Solo los temas sembrados */
  topicOffset: Record<string, number>;
  /** Propensión por etiqueta de sesgo. 0 es sin propensión. Solo las etiquetas sembradas */
  biasPropensity: Record<string, number>;
  /**
   * Cómo actúa la propensión. weighted, el sesgo pesa más al elegir distractor cuando falla y
   * también atrae cuando sabía la respuesta. lure, solo atrae cuando sabía la respuesta, con más
   * fuerza. lure existe para validar el análisis por sesgo con un mecanismo distinto (D-051)
   */
  biasModel: 'weighted' | 'lure';
  /** Probabilidad de leer una pregunta negativa como si fuera afirmativa */
  negationMisread: number;
  /** Palabras por segundo al leer con cuidado */
  readingWps: number;
  /** null si no se cansa de forma notable */
  fatigue: FatigueTruth | null;
  /** Probabilidad de estudiar en un día dado */
  consistency: number;
  /** Desplazamiento en logits de su autoevaluación. Positivo es sobreconfianza */
  overconfidence: number;
  /** Minutos que dura su sesión de preguntas */
  sessionMinutes: { mean: number; sd: number };
  /** Hora local en que suele estudiar */
  preferredHour: number;
}

/** Pregunta tal como la ve el generador */
export interface SimItem {
  key: string;
  versionId: string;
  branch: string;
  topic: string;
  polarity: 'affirmative' | 'negative';
  physicianDifficulty: number;
  stemWords: number;
  options: readonly SimOption[];
  canonicalOptionIds: readonly string[];
}

export interface SimOption {
  id: string;
  isCorrect: boolean;
  biasTag: string | null;
  words: number;
}

export interface ResponseOutcome {
  chosenOptionId: string;
  correct: boolean;
  /** Etiqueta del distractor elegido. null si acertó */
  chosenTag: string | null;
  /** Opciones marcadas antes de la final, en orden */
  previousOptionIds: string[];
  msToAnswer: number;
  confidence: 'guessed' | 'unsure' | 'sure';
  /** La pregunta negativa se leyó como afirmativa. Solo para las pruebas */
  misread: boolean;
  /** Probabilidad de acierto que da el modelo Rasch con la habilidad del momento */
  modelProbability: number;
}

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Etiquetas que aparecen lo suficiente en el banco como para sembrarlas y detectarlas */
export const SEEDABLE_BIASES = [
  'anchoring',
  'premature_closure',
  'availability_heuristic',
  'representativeness_heuristic',
  'complexity_bias',
  'belief_bias',
  'focusing_illusion',
  'omission_bias',
  'information_bias',
  'loss_aversion',
] as const;

export interface CohortMix {
  /** Proporción de alumnos con una propensión de sesgo sembrada */
  biasShare: number;
  /** Proporción con mala lectura de negaciones sembrada */
  misreadShare: number;
  /** Proporción con fatiga sembrada */
  fatigueShare: number;
  biasModel?: StudentTruth['biasModel'];
}

export const DEFAULT_MIX: CohortMix = { biasShare: 0.2, misreadShare: 0.2, fatigueShare: 0.2 };

/** Parámetros verdaderos de un alumno de la cohorte */
export function sampleTruth(
  rng: Rng,
  branches: readonly string[],
  mix: CohortMix = DEFAULT_MIX,
): StudentTruth {
  const branchOffset: Record<string, number> = {};
  for (const branch of branches) branchOffset[branch] = rng.normal(0, 0.35);
  const biasPropensity: Record<string, number> = {};
  if (rng.chance(mix.biasShare)) {
    biasPropensity[rng.pick(SEEDABLE_BIASES)] = 1.2 + rng.next() * 0.8;
  }
  const fatigue = rng.chance(mix.fatigueShare)
    ? { onsetMinutes: 15 + rng.next() * 15, logitPerMinute: 0.05 + rng.next() * 0.03 }
    : null;
  return {
    ability: rng.normal(0.4, 0.9),
    branchOffset,
    topicOffset: {},
    biasPropensity,
    biasModel: mix.biasModel ?? 'weighted',
    negationMisread: rng.chance(mix.misreadShare) ? 0.3 + rng.next() * 0.2 : rng.next() * 0.03,
    readingWps: clamp(rng.normal(3.2, 0.6), 1.8, 5.5),
    fatigue,
    consistency: clamp(rng.beta(6, 2), 0.3, 0.98),
    overconfidence: rng.normal(0.2, 0.5),
    sessionMinutes: { mean: clamp(rng.normal(35, 8), 20, 60), sd: 8 },
    preferredHour: rng.pick([7, 9, 13, 16, 18, 20, 21]),
  };
}

/** Habilidad efectiva en un minuto de la sesión */
export function effectiveAbility(
  truth: StudentTruth,
  item: Pick<SimItem, 'branch' | 'topic'>,
  minuteInSession: number,
): number {
  const fatigue =
    truth.fatigue && minuteInSession > truth.fatigue.onsetMinutes
      ? truth.fatigue.logitPerMinute * (minuteInSession - truth.fatigue.onsetMinutes)
      : 0;
  return (
    truth.ability +
    (truth.branchOffset[item.branch] ?? 0) +
    (truth.topicOffset[item.topic] ?? 0) -
    fatigue
  );
}

function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  const weights = items.map(weight);
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = rng.next() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index] as number;
    if (roll < 0) return items[index] as T;
  }
  return items[items.length - 1] as T;
}

/** Peso de un distractor al equivocarse. Los de su sesgo pesan más */
const distractorWeight = (truth: StudentTruth) => (option: SimOption) =>
  truth.biasModel === 'lure'
    ? 1
    : Math.exp(1.1 * (truth.biasPropensity[option.biasTag ?? ''] ?? 0));

/**
 * Respuesta a una pregunta con las opciones mostradas
 *   - Mala lectura. En una negativa, con probabilidad negationMisread lee la pregunta al revés y
 *     elige una afirmación verdadera, es decir un distractor, más rápido de lo normal
 *   - Si no, acierta con la probabilidad de Rasch. Con un distractor de su sesgo a la vista, puede
 *     dejarse atraer aunque supiera la respuesta (hasta 30%)
 *   - Al fallar elige un distractor con más peso para los de su sesgo
 */
export function respond(input: {
  rng: Rng;
  truth: StudentTruth;
  item: SimItem;
  difficulty: number;
  shown: readonly SimOption[];
  minuteInSession: number;
}): ResponseOutcome {
  const { rng, truth, item, shown } = input;
  const correctOption = shown.find((option) => option.isCorrect) as SimOption;
  const distractors = shown.filter((option) => !option.isCorrect);
  const theta = effectiveAbility(truth, item, input.minuteInSession);
  const probability = sigmoid(theta - input.difficulty);

  const misread = item.polarity === 'negative' && rng.chance(truth.negationMisread);
  let chosen: SimOption;
  if (misread) {
    chosen = pickWeighted(rng, distractors, distractorWeight(truth));
  } else if (rng.chance(probability)) {
    chosen = correctOption;
    const lures = distractors.filter(
      (option) => (truth.biasPropensity[option.biasTag ?? ''] ?? 0) > 0,
    );
    for (const lure of lures) {
      const strength = truth.biasPropensity[lure.biasTag ?? ''] ?? 0;
      const lureChance =
        truth.biasModel === 'lure'
          ? Math.min(0.45, 0.25 * strength)
          : Math.min(0.3, 0.15 * strength);
      if (rng.chance(lureChance)) {
        chosen = lure;
        break;
      }
    }
  } else {
    chosen = pickWeighted(rng, distractors, distractorWeight(truth));
  }
  const correct = chosen.isCorrect;

  // Tiempo. Lectura del enunciado y de las opciones, más tiempo de decisión que crece con la
  // dificultad relativa, ruido lognormal, más rápido al leer mal y más lento con fatiga
  const words = item.stemWords + shown.reduce((sum, option) => sum + option.words, 0);
  const readingMs = (words / truth.readingWps) * 1000;
  const decisionMs = 8000 * (1 + clamp(input.difficulty - theta, -1, 2) * 0.35);
  const fatigueFactor =
    truth.fatigue && input.minuteInSession > truth.fatigue.onsetMinutes
      ? 1 + 0.01 * (input.minuteInSession - truth.fatigue.onsetMinutes)
      : 1;
  const ms =
    (readingMs + decisionMs) * Math.exp(rng.normal(0, 0.3)) * fatigueFactor * (misread ? 0.55 : 1);
  const msToAnswer = Math.round(clamp(ms, 2500, 15 * 60 * 1000));

  // Confianza. Autoevaluación con su sesgo de confianza y ruido. Al leer mal cree que fue fácil
  const self =
    sigmoid(theta - input.difficulty + truth.overconfidence + (misread ? 1.5 : 0)) +
    (correct ? 0.08 : -0.08) +
    rng.normal(0, 0.12);
  const confidence = self > 0.72 ? 'sure' : self > 0.42 ? 'unsure' : 'guessed';

  // Cambios de respuesta. Más probables con duda
  const previousOptionIds: string[] = [];
  const changeChance = confidence === 'unsure' ? 0.2 : confidence === 'guessed' ? 0.12 : 0.05;
  if (rng.chance(changeChance)) {
    const wrongOthers = shown.filter((option) => option.id !== chosen.id && !option.isCorrect);
    const first =
      !correct && (wrongOthers.length === 0 || !rng.chance(0.7))
        ? correctOption
        : wrongOthers.length > 0
          ? rng.pick(wrongOthers)
          : null;
    if (first) previousOptionIds.push(first.id);
  }

  return {
    chosenOptionId: chosen.id,
    correct,
    chosenTag: correct ? null : chosen.biasTag,
    previousOptionIds,
    msToAnswer,
    confidence,
    misread,
    modelProbability: probability,
  };
}
