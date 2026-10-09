// Umbrales por defecto de la sección 12 y de los motores de la sección 7. Los motores los reciben
// como parámetro. El admin los edita en la pantalla 25 y los cambios se aplican al abrir la app. La
// marca entre paréntesis viene de la especificación. (V) verificado, (J) juicio de diseño ajustable.
import { z } from 'zod';
import { readStoredOverrides } from './overridesStore';

export const ThresholdsSchema = z.strictObject({
  difficulty: z.strictObject({
    /** Dificultad provisional por pregunta desde 30 respuestas (V, Linacre) */
    provisionalResponses: z.int().positive().default(30),
    /** Dificultad calibrada desde 100 respuestas (V, Linacre) */
    calibratedResponses: z.int().positive().default(100),
  }),
  sampling: z.strictObject({
    /** Una variante entra al puntaje del examen con 200 exposiciones por distractor (J) */
    variantExposuresForExam: z.int().positive().default(200),
    /** Distractor no funcional, elegido por menos de 5% tras 100 exposiciones (J) */
    nonFunctionalRate: z.number().min(0).max(1).default(0.05),
    nonFunctionalExposures: z.int().positive().default(100),
  }),
  bias: z.strictObject({
    /** Patrón por sesgo desde 40 errores etiquetados (J) */
    minTaggedErrors: z.int().positive().default(40),
    /** Hablar de sesgos y no de trampas con kappa de 0.4 o más (J) */
    minKappaForBiasLanguage: z.number().min(-1).max(1).default(0.4),
    /** Doble etiquetado del 20% de las preguntas (J) */
    doubleLabelShare: z.number().min(0).max(1).default(0.2),
    /** Opciones etiquetadas por dos médicos antes de fiarse de kappa y hablar de sesgos (J) */
    minLabeledPairs: z.int().positive().default(30),
  }),
  topics: z.strictObject({
    /** Fuerza del prior beta-binomial, equivalente a unas 10 respuestas (J) */
    priorStrength: z.number().positive().default(10),
    /** Se muestra el dominio si el intervalo creíble de 95% mide menos de 0.25 (J) */
    maxIntervalWidth: z.number().positive().max(1).default(0.25),
    /** Cuántos temas a reforzar se muestran (7.3) */
    topN: z.int().positive().default(5),
    /**
     * Respuestas propias mínimas para mostrar el dominio de un tema (J, D-076). Sin este piso, una
     * rama con pocas respuestas y media extrema daba un prior tan angosto que temas sin ninguna
     * respuesta salían como 100% o 0%
     */
    minResponsesPerTopic: z.int().nonnegative().default(5),
  }),
  structure: z.strictObject({
    /** Análisis por estructura por alumno desde 20 respuestas por categoría (J) */
    minResponsesPerCategory: z.int().positive().default(20),
  }),
  forgetting: z.strictObject({
    /** Un patrón se confirma con 5 hallazgos del mismo tipo en 14 días (J) */
    findingsForPattern: z.int().positive().default(5),
    patternWindowDays: z.int().positive().default(14),
    /** Las reglas de olvido se activan desde 3 lapsos (7.1) */
    lapsesForForgettingRules: z.int().positive().default(3),
    /** Una respuesta que enumera 4 o más elementos es tarjeta de lista (7.9) */
    listCardItems: z.int().positive().default(4),
  }),
  fsrs: z.strictObject({
    /** Retención deseada 0.90 entre 0.80 y 0.97 (J) */
    desiredRetention: z.number().min(0.8).max(0.97).default(0.9),
    /** Sube a 0.93 en los últimos 30 días antes del ENARM (J) */
    examRetention: z.number().min(0.8).max(0.97).default(0.93),
    examWindowDays: z.int().positive().default(30),
    /** Sanguijuela con 8 lapsos, como Anki */
    leechLapses: z.int().positive().default(8),
    newCardsPerDay: z.int().nonnegative().default(20),
    reviewsPerDay: z.int().nonnegative().default(200),
    /** Optimizar parámetros por alumno desde 1,000 repasos, fuera del prototipo (J) */
    optimizeAfterReviews: z.int().positive().default(1000),
  }),
  daily: z.strictObject({
    /** Repasos propios que hacen falta para usar el ritmo del alumno y no el de referencia (J) */
    minReviewsToMeasure: z.int().positive().default(100),
    /** Segundos por repaso y por tarjeta nueva mientras el alumno no tiene ritmo propio (J) */
    referenceSecondsPerReview: z.number().positive().default(10),
    referenceSecondsPerNew: z.number().positive().default(30),
    /** Parte de los minutos diarios que va a tarjetas, el resto es de preguntas (J) */
    cardsTimeShare: z.number().min(0.1).max(1).default(0.5),
    /** Días de carga futura con los que se calcula cuántas nuevas por día aguantan (J) */
    suggestionHorizonDays: z.int().positive().default(30),
    /** Aviso de recuperación con estas vencidas de días anteriores o más (J) */
    recoveryMinOverdue: z.int().positive().default(40),
    /** o con esta fracción del límite diario de repasos o más, lo que sea mayor (J) */
    recoveryOverdueShareOfLimit: z.number().positive().default(0.5),
    /** Tope del tiempo que se registra en cada paso de una tarjeta, ver la respuesta y calificar, en segundos. Una pausa larga no lo distorsiona (J) */
    cardTimeCapSeconds: z.int().positive().default(120),
  }),
  behavior: z.strictObject({
    /** Ritmo mínimo plausible de lectura, en palabras por segundo (J) */
    maxWordsPerSecond: z.number().positive().default(6),
    /** Percentil personal bajo el cual el tiempo cuenta como adivinanza rápida (7.6) */
    rapidGuessPercentile: z.number().min(0).max(1).default(0.1),
    /** Percentil personal bajo el cual un acierto seguro y sin cambios es Fácil (7.1) */
    easyPercentile: z.number().min(0).max(1).default(0.25),
    /** La fatiga se busca en sesiones de más de 30 minutos (7.6) */
    fatigueMinSessionMinutes: z.number().positive().default(30),
    /** Pausa larga dentro de una pregunta, en segundos */
    longPauseSeconds: z.number().positive().default(120),
  }),
  streak: z.strictObject({
    /** Un congelador por cada 7 días de racha, con máximo 2 guardados (J) */
    daysPerFreeze: z.int().positive().default(7),
    maxFreezes: z.int().nonnegative().default(2),
  }),
  confidence: z.strictObject({
    /** Nivel del intervalo de Wilson y de los demás intervalos */
    level: z.number().min(0.5).max(0.999).default(0.95),
  }),
});

export type Thresholds = z.infer<typeof ThresholdsSchema>;

/** Los umbrales de fábrica, sin los cambios del admin */
export const FACTORY_THRESHOLDS: Thresholds = ThresholdsSchema.parse({
  difficulty: {},
  sampling: {},
  bias: {},
  topics: {},
  structure: {},
  forgetting: {},
  fsrs: {},
  daily: {},
  behavior: {},
  streak: {},
  confidence: {},
});

export type ThresholdsPatch = Readonly<Record<string, Readonly<Record<string, number>>>>;

/**
 * Los umbrales con los cambios encima. Se vuelve a validar el conjunto completo, así un cambio que
 * rompa una regla, como una retención fuera de rango, no entra
 */
export function mergeThresholds(
  base: Thresholds,
  patch: ThresholdsPatch,
): { ok: true; value: Thresholds } | { ok: false; issues: string[] } {
  const unknown = Object.keys(patch).filter((group) => !(group in base));
  if (unknown.length > 0) {
    return { ok: false, issues: unknown.map((group) => `${group}: grupo desconocido`) };
  }
  const merged = Object.fromEntries(
    Object.entries(base).map(([group, values]) => [
      group,
      { ...(values as Record<string, number>), ...patch[group] },
    ]),
  );
  const parsed = ThresholdsSchema.safeParse(merged);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      };
}

const stored = readStoredOverrides()?.thresholds;
const withStored = stored ? mergeThresholds(FACTORY_THRESHOLDS, stored) : null;

/**
 * Los umbrales que usa la app. Los de fábrica con los cambios que el admin guardó en este navegador,
 * si son válidos. Se calculan una vez al abrir la app, así que un cambio se ve al recargar
 */
export const DEFAULT_THRESHOLDS: Thresholds = withStored?.ok
  ? withStored.value
  : FACTORY_THRESHOLDS;
