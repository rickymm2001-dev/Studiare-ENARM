/**
 * Cifras de la parte en inglés del alumno (B13, 2.7 del plan de B13).
 *
 * Qué hace. Resume lo que el alumno ha contestado en los casos de lectura en inglés, aparte de las ramas
 * clínicas. Da cuántos reactivos lleva, cuántos acertó, su porcentaje de aciertos con un intervalo y el
 * ritmo que lleva contra el tiempo sugerido por reactivo. Mientras no tenga las respuestas que pide el
 * umbral dice que calibra y no da ninguna cifra, porque con pocas respuestas un porcentaje no dice nada
 * (4.3 de la especificación).
 * Entradas. Una respuesta por reactivo contestado, con si acertó y cuánto tardó, y los umbrales de inglés
 * (respuestas para mostrar cifras y segundos sugeridos por reactivo).
 * Salidas. answered y correct siempre, y con respuestas suficientes el porcentaje de aciertos con su
 * intervalo de 95%, la mediana de segundos por reactivo y los segundos sugeridos para compararla.
 * Método. Modelo beta-binomial con prior uniforme Beta(1, 1), el más débil, porque aquí no hay un grupo
 * hacia el cual encoger. Con k aciertos de n el posterior es Beta(1 + k, 1 + n − k), su media es la
 * estimación y su intervalo de colas iguales (motor stats/beta) el de 95%. El ritmo es la mediana de los
 * segundos por reactivo, que resiste a los reactivos en que el alumno se distrajo.
 * Umbrales. 20 respuestas para mostrar las cifras y 90 segundos sugeridos por reactivo (J, editables en
 * thresholds.english). La comparación con otros alumnos y la dificultad calibrada son de B14.
 */
import { betaInterval } from './stats/beta';

/** Nivel del intervalo creíble, el de los demás intervalos de la app */
export const ENGLISH_CONFIDENCE_LEVEL = 0.95;

export interface EnglishAnswer {
  questionId: string;
  correct: boolean;
  /** Cuánto tardó en contestar, en milisegundos */
  msSpent: number;
}

export interface EnglishSummary {
  /** Reactivos de inglés que ha contestado */
  answered: number;
  correct: number;
  /** Porcentaje de aciertos (0 a 1) con su intervalo creíble de 95%. null mientras calibra */
  accuracy: { mean: number; low: number; high: number } | null;
  /** Mediana de segundos por reactivo. null mientras calibra */
  medianSecondsPerItem: number | null;
  /** Segundos sugeridos por reactivo, para comparar el ritmo */
  suggestedSeconds: number;
  /** Aún no tiene las respuestas que pide el umbral para mostrar sus cifras */
  calibrating: boolean;
  /** Respuestas que pide el umbral */
  minAnswers: number;
}

/** Mediana de una lista de números. null si está vacía */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function summarizeEnglish(
  answers: readonly EnglishAnswer[],
  thresholds: { minAnswersForStats: number; secondsPerItem: number },
): EnglishSummary {
  const answered = answers.length;
  const correct = answers.filter((answer) => answer.correct).length;
  // Sin una sola respuesta no hay cifras, aunque el umbral dijera cero
  const calibrating = answered === 0 || answered < thresholds.minAnswersForStats;
  const base = {
    answered,
    correct,
    suggestedSeconds: thresholds.secondsPerItem,
    calibrating,
    minAnswers: thresholds.minAnswersForStats,
  };
  if (calibrating) return { ...base, accuracy: null, medianSecondsPerItem: null };

  const interval = betaInterval(1 + correct, 1 + answered - correct, ENGLISH_CONFIDENCE_LEVEL);
  const seconds = answers
    .map((answer) => answer.msSpent / 1000)
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(0, value));
  const middle = median(seconds);
  return {
    ...base,
    accuracy: { mean: interval.mean, low: interval.lower, high: interval.upper },
    medianSecondsPerItem: middle === null ? null : Math.round(middle),
  };
}
