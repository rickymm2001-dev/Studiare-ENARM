/**
 * Tipos de la calibración nocturna (B14, 3 del plan de B14).
 *
 * Qué hace. Define lo que entra y lo que sale de los motores de src/engines/calibration. La entrada es
 * lo que exportan las funciones calibration_* de la base, ya convertido a tipos (scripts/calibration lo
 * valida con zod y lo convierte). Todo viaja con seudónimos de esa corrida, ids del banco, claves de la
 * taxonomía y números. Nunca hay texto de preguntas, alias, correos ni ids de cuenta.
 * Entradas y salidas. Ver CalibrationInput y CalibrationOutput.
 * Método. Nada. Son tipos y unas constantes de juicio.
 */
import type { ModelSettings } from '@/config/modelSettings';
import type { Thresholds } from '@/config/thresholds';
import type { CalibrationState } from '@/data/model/contracts';

/** Probabilidad de acierto esperada por la dificultad del médico, de 1 a 5 (J). Igual que Conócete */
export const EXPECTED_BY_PHYSICIAN_DIFFICULTY = [0.85, 0.75, 0.6, 0.45, 0.35] as const;

export type SessionKind = 'practice' | 'exam' | 'challenge';
export type ConfidenceLevel = 'guessed' | 'unsure' | 'sure';

export interface BankOptionRow {
  /** Id estable de la opción entre versiones */
  id: string;
  correct: boolean;
  /** Etiqueta de sesgo del distractor. null en la correcta */
  tag: string | null;
  /** Palabras del texto de la opción. El texto no sale de la base */
  words: number;
}

/** Una versión aprobada del banco, sin una sola palabra de texto */
export interface BankItemRow {
  /** Id de la versión (uuid) */
  versionId: string;
  /** Id estable de la pregunta (uuid) */
  questionId: string;
  branch: string;
  topic: string;
  subtopic: string;
  language: 'es' | 'en';
  /** Dificultad del médico de 1 a 5 */
  physician: number;
  /** Id estable de la pregunta original si es una variante reestructurada */
  variantOf: string | null;
  /** Palabras del caso, la viñeta y la pregunta */
  words: number;
  /** Es la versión publicada hoy */
  current: boolean;
  /** Ids estables de las opciones del set canónico */
  canonical: readonly string[];
  options: readonly BankOptionRow[];
  /** La calibración que leen hoy los alumnos para esta versión. null si no tiene */
  previous: { difficulty: number | null; se: number | null; state: CalibrationState } | null;
}

export interface PersonRow {
  /** Seudónimo de esta corrida */
  person: string;
  /** Especialidad objetivo. null si no eligió */
  specialty: string | null;
}

/** Una respuesta de un alumno con permiso a una versión del banco, con lectura previa en bank_reads */
export interface AnswerRow {
  person: string;
  /** Sesión seudónima. null si la respuesta no traía sesión */
  session: string | null;
  versionId: string;
  /** Id estable de la opción elegida */
  optionId: string;
  correct: boolean;
  sessionKind: SessionKind | null;
  /** Días de estudio antes del día del corte. 0 es el mismo día del corte */
  daysBefore: number;
  /** Minutos desde que empezó la sesión. null sin sesión */
  minute: number | null;
  ms: number | null;
  confidence: ConfidenceLevel | null;
  changes: number;
  /** Orden de llegada a la bitácora. Único */
  seq: number;
}

/** Las opciones que se mostraron en una pregunta, en el orden en que salieron */
export interface ExposureRow {
  person: string;
  versionId: string;
  /** Ids estables de las opciones mostradas, en orden de posición */
  options: readonly string[];
  seq: number;
}

/** Repasos y respuestas de un alumno en un día de la ventana de la comparación */
export interface ActivityRow {
  person: string;
  daysBefore: number;
  reviews: number;
  answers: number;
}

/** Un motivo de error que reportó el alumno. motive es el valor guardado, uno de los siete o una causa de antes */
export interface MotiveRow {
  person: string;
  daysBefore: number;
  branch: string | null;
  motive: string;
  /** El error cayó en el último tercio de una sesión larga */
  lastThird: boolean;
}

/** Un par de etiquetas de un distractor, la del autor y la del revisor (B11) */
export interface LabelPairRow {
  optionId: string;
  authorTag: string;
  reviewerTag: string;
}

export interface CalibrationInput {
  /** Día de estudio del corte, AAAA-MM-DD */
  asOfDay: string;
  settings: ModelSettings;
  /** Los umbrales de fábrica con los cambios del admin encima */
  thresholds: Thresholds;
  bank: readonly BankItemRow[];
  people: readonly PersonRow[];
  answers: readonly AnswerRow[];
  exposures: readonly ExposureRow[];
  activity: readonly ActivityRow[];
  motives: readonly MotiveRow[];
  labelPairs: readonly LabelPairRow[];
}

/** Un primer intento válido, ya sin lo que la defensa de datos falsos deja fuera */
export interface FirstAttempt {
  person: string;
  questionId: string;
  versionId: string;
  optionId: string;
  correct: boolean;
  daysBefore: number;
  seq: number;
  /** Opciones mostradas en la pantalla que contestó. null si la bitácora no la trae */
  exposed: readonly string[] | null;
}

/** Cuánto se dejó fuera y por qué. Solo números, sin decir de quién */
export interface FirstAttemptCounts {
  answers: number;
  unknownVersion: number;
  repeatAttempts: number;
  cappedDays: number;
  cappedAttempts: number;
  rapidExcluded: number;
  noExposure: number;
  inconsistentExposure: number;
  firstAttempts: number;
}

export interface ItemResult {
  versionId: string;
  questionId: string;
  students: number;
  difficulty: number | null;
  se: number | null;
  elo: number | null;
  eloResponses: number;
  state: CalibrationState;
  extreme: boolean;
  /** Solo en preguntas con variant_of */
  variantReady: boolean | null;
}

export interface OptionResult {
  versionId: string;
  optionId: string;
  exposures: number;
  choices: number;
}

export interface ComparisonCellResult {
  cohort: 'all' | 'specialty';
  key: string;
  metric: 'sim_accuracy' | 'reviews' | 'consistency';
  branch: string;
  students: number;
  /** 19 cortes si la celda tiene minGroupSize alumnos o más. null si no */
  cuts: number[] | null;
}

export type FatigueState = 'calibrating' | 'validated' | 'not_valid';

export interface FatigueValidation {
  state: FatigueState;
  /** Alumnos con las sesiones largas necesarias para evaluar el detector en las dos mitades */
  students: number;
  /** Sesiones largas de esos alumnos */
  longSessions: number;
  /** Kappa de Cohen entre las sesiones pares y las impares. null si no está definido */
  splitHalfKappa: number | null;
  /** Errores del último tercio de sesiones largas con un motivo reportado */
  motiveReports: number;
  /** Límite inferior de la razón de Fatiga entre señalados y no señalados. null si no se puede calcular */
  ratioLower: number | null;
}

/** El JSON que recibe calibration_publish_population. Solo números y códigos */
export interface PopulationData {
  bias: Record<string, { students: number; rate: number }>;
  motives: Record<string, Record<string, number>>;
  topics: Record<string, { students: number; accuracy: number; difficulty: number | null }>;
  indicators: Record<string, { students: number; rate: number }>;
  fatigue: { state: FatigueState; students: number; longSessions: number };
  /** Versiones publicadas por estado de calibración */
  items: Record<CalibrationState, number>;
}

/** El JSON que recibe calibration_publish_agreement */
export interface AgreementData {
  pairs: number;
  kappa: number | null;
  observed: number | null;
  expected: number | null;
  byTag: Record<string, number | null>;
}

export interface CalibrationOutput {
  items: ItemResult[];
  options: OptionResult[];
  population: PopulationData;
  comparison: ComparisonCellResult[];
  agreement: AgreementData;
  fatigue: FatigueValidation;
  /** Solo números y códigos (3.11) */
  counts: Record<string, number | string>;
}
