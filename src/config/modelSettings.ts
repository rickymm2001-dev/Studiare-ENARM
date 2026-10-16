// Ajustes del modelo del alumno y de la calibración nocturna (B14, 1.5 del plan de B14). Viven en la
// clave model_settings de platform_settings, que el admin escribe con settings_write y todos leen. Son
// una clave aparte porque meter campos nuevos en admin_overrides haría que una app vieja ignorara todos
// los umbrales, ya que StoredOverridesSchema y ThresholdsSchema son estrictos (1.5 y 0.4 del plan). Por
// la misma razón no entran a thresholds.ts ni a featureFlags.ts, que van en el JavaScript inicial. Solo
// los módulos diferidos importan este archivo.
//
// Un valor que no cumple se ignora y queda el de fábrica, campo por campo, y una llave desconocida se
// ignora, así un servidor más nuevo no rompe una app vieja. El piso de 30 alumnos por grupo es la
// promesa de privacidad de la comparación y nunca baja, aunque el admin escriba menos. La base lo hace
// cumplir también (model_settings_json y la restricción de comparison_cells).
//
// (V) verificado, (J) juicio de diseño ajustable.
import { z } from 'zod';

/** Alumnos por celda por debajo de los cuales no se publica ningún agregado. No se configura a la baja */
export const MIN_PRIVACY_GROUP = 30;

/**
 * Primera versión del aviso de privacidad cuya pista del permiso de mejora describe todo lo que la
 * calibración hace con los datos (B16, 6.3 del plan). Es una versión histórica y no la vigente: sube
 * solo si cambia lo que el permiso cubre. Se compara como texto, igual que el servidor (D-129)
 */
export const FACTORY_MIN_NOTICE_VERSION = '2026-10-15b';

/** Los valores de fábrica, los de 1.5 del plan */
const FACTORY = {
  calibration: { enabled: false, mode: 'dry_run', minNoticeVersion: FACTORY_MIN_NOTICE_VERSION },
  features: { comparison: true, adaptive: true },
  thresholds: {
    provisionalMaxSe: 0.5,
    calibratedMaxSe: 0.3,
    minGroupSize: MIN_PRIVACY_GROUP,
    comparisonWindowDays: 30,
    minBranchAnswers: 20,
    adaptiveMinItems: 50,
    adaptiveTargetOffset: 0,
    adaptiveExploreShare: 0.2,
    maxDailyFirstAttempts: 400,
    populationMinStudents: MIN_PRIVACY_GROUP,
    fatigue: { minStudents: 30, minSplitHalfKappa: 0.4, minMotiveReports: 40 },
  },
} as const;

/** Un número dentro de un rango. Fuera de él, o con otro tipo, vale el de fábrica */
const bounded = (min: number, max: number, fallback: number) =>
  z.number().min(min).max(max).catch(fallback);
/** Un entero dentro de un rango, con la misma regla */
const boundedInt = (min: number, max: number, fallback: number) =>
  z.int().min(min).max(max).catch(fallback);

const CalibrationSchema = z
  .object({
    /** Apagada, la calibración nocturna sale con skipped y no lee nada */
    enabled: z.boolean().catch(FACTORY.calibration.enabled),
    /** dry_run calcula y guarda la corrida sin aplicar nada. apply publica (3.15) */
    mode: z.enum(['dry_run', 'apply']).catch(FACTORY.calibration.mode),
    /** Un permiso dado con un aviso anterior a esta versión no cuenta para la calibración (6.3) */
    minNoticeVersion: z.string().min(1).max(20).catch(FACTORY.calibration.minNoticeVersion),
  })
  .catch(() => FACTORY.calibration);

const FeaturesSchema = z
  .object({
    /** Cómo vas frente a otros, en Progreso (10.10, abierta en todos los planes) */
    comparison: z.boolean().catch(FACTORY.features.comparison),
    /** Modo adaptativo en Simular (10.15, abierto en todos los planes) */
    adaptive: z.boolean().catch(FACTORY.features.adaptive),
  })
  .catch(() => FACTORY.features);

const FatigueThresholdsSchema = z
  .object({
    /** Alumnos con sesiones largas para que el detector pueda declararse validado (J) */
    minStudents: boundedInt(2, 100_000, FACTORY.thresholds.fatigue.minStudents),
    /** Kappa de Cohen mínimo entre las sesiones pares y las impares (J) */
    minSplitHalfKappa: bounded(-1, 1, FACTORY.thresholds.fatigue.minSplitHalfKappa),
    /** Motivos reportados en errores del último tercio de sesiones largas (J) */
    minMotiveReports: boundedInt(2, 100_000, FACTORY.thresholds.fatigue.minMotiveReports),
  })
  .catch(() => FACTORY.thresholds.fatigue);

const ThresholdsSchema = z
  .object({
    /** Error estándar máximo de una pregunta provisional (V, PC 5.5) */
    provisionalMaxSe: bounded(0.05, 2, FACTORY.thresholds.provisionalMaxSe),
    /** Error estándar máximo de una pregunta calibrada (V, PC 5.5) */
    calibratedMaxSe: bounded(0.05, 2, FACTORY.thresholds.calibratedMaxSe),
    /** Alumnos mínimos por celda de comparación. Nunca menos de 30 (privacidad) */
    minGroupSize: boundedInt(MIN_PRIVACY_GROUP, 100_000, FACTORY.thresholds.minGroupSize),
    /** Días de estudio completos anteriores al corte que mira la comparación (J) */
    comparisonWindowDays: boundedInt(7, 90, FACTORY.thresholds.comparisonWindowDays),
    /** Respuestas de simulador en una rama para que el alumno entre a la comparación de esa rama (J) */
    minBranchAnswers: boundedInt(1, 500, FACTORY.thresholds.minBranchAnswers),
    /** Preguntas al menos provisionales dentro de lo elegido para ofrecer el modo adaptativo (J) */
    adaptiveMinItems: boundedInt(5, 5000, FACTORY.thresholds.adaptiveMinItems),
    /** Logits sumados a la habilidad al elegir la dificultad objetivo del adaptativo (J) */
    adaptiveTargetOffset: bounded(-2, 2, FACTORY.thresholds.adaptiveTargetOffset),
    /** Parte de la sesión adaptativa que va a preguntas que todavía calibran (J) */
    adaptiveExploreShare: bounded(0, 0.5, FACTORY.thresholds.adaptiveExploreShare),
    /** Primeros intentos por alumno y día que cuentan en la calibración. Arriba del tope el día no cuenta (J) */
    maxDailyFirstAttempts: boundedInt(10, 5000, FACTORY.thresholds.maxDailyFirstAttempts),
    /** Alumnos mínimos por dato de la población. Nunca menos de 30 (privacidad) */
    populationMinStudents: boundedInt(
      MIN_PRIVACY_GROUP,
      100_000,
      FACTORY.thresholds.populationMinStudents,
    ),
    fatigue: FatigueThresholdsSchema,
  })
  .catch(() => FACTORY.thresholds);

export const ModelSettingsSchema = z
  .object({
    calibration: CalibrationSchema,
    features: FeaturesSchema,
    thresholds: ThresholdsSchema,
  })
  .catch(() => FACTORY);

export type ModelSettings = z.infer<typeof ModelSettingsSchema>;
export type ModelThresholds = ModelSettings['thresholds'];

/** Los valores de fábrica, los de 1.5 del plan. Es lo que queda si el servidor no dice nada */
export const FACTORY_MODEL_SETTINGS: ModelSettings = ModelSettingsSchema.parse({
  calibration: {},
  features: {},
  thresholds: {},
});

/** La clave de platform_settings donde vive */
export const MODEL_SETTINGS_KEY = 'model_settings';

/**
 * Los ajustes tal como los guardó el servidor. Nunca lanza: lo que no se entiende queda de fábrica, un
 * valor inválido no tira los demás y minGroupSize y populationMinStudents nunca bajan de 30
 */
export function readModelSettings(raw: unknown): ModelSettings {
  return ModelSettingsSchema.parse(raw ?? {});
}
