// Contratos de B14 (datos y modelo del alumno, 9.5 del plan de B14). Son las formas que comparten los
// tres paquetes de B14, A (servidor, calibración nocturna y motores de la noche), B (sincronización,
// catálogo calibrado y modo adaptativo) y C (modelo del alumno, comparación y pantallas del equipo).
// Solo tipos, sin código ni importaciones, para que los motores de src/engines puedan leerlos sin
// traer nada más (eslint.config.js y tests/architecture/engine-boundaries.test.ts lo permiten por
// eso). Los nombres y los campos quedan tal cual. Cambiar una forma después del Paso 0 se acuerda entre
// los dueños. Las formas JSON de las funciones SQL son las de 1.9 del plan y las firmas son las de 1.8.

// ===================================================================== Calibración en el catálogo

/** Cómo se llegó a la dificultad de una pregunta. Los umbrales son los de PC 5.5 (30 y 100 alumnos) */
export type CalibrationState = 'physician_estimate' | 'provisional' | 'calibrated';

/**
 * La llave calibration de una fila del catálogo (question_catalog.calibration, 1.6). Lleva el id de la
 * versión que se calibró, porque bank_publish no toca la columna al publicar otra versión. La app la
 * usa solo si versionId es la versión publicada
 */
export interface CatalogCalibration {
  versionId: string;
  state: CalibrationState;
  /** Dificultad de Rasch en logits, ya enlazada. null si no tiene estimación finita */
  difficulty: number | null;
  /** Error estándar de la dificultad. null si no tiene estimación finita */
  se: number | null;
  /** Alumnos distintos con primer intento válido */
  students: number;
  elo: number | null;
  /** Todos acertaron o todos fallaron, así que no hay estimación finita */
  extreme: boolean;
  /** Día de estudio de la noche que la calculó, AAAA-MM-DD */
  studyDay: string;
}

// ===================================================================== Comparación con otros alumnos

export type ComparisonMetric = 'sim_accuracy' | 'reviews' | 'consistency';
export type ComparisonCohort = 'all' | 'specialty';

export interface ComparisonCell {
  cohort: ComparisonCohort;
  metric: ComparisonMetric;
  /** La rama de la taxonomía, o * para el total */
  branch: string;
  /** Alumnos con datos en la celda */
  students: number;
  state: 'ready' | 'calibrating';
  /** 19 cortes, del percentil 5 al 95. null mientras la celda calibra (menos de minGroupSize alumnos) */
  cuts: number[] | null;
}

/** Lo que devuelve comparison_snapshot. Solo Todos y la especialidad de quien pregunta */
export interface ComparisonSnapshot {
  available: boolean;
  runAt: string | null;
  studyDay: string | null;
  windowDays: number;
  minGroupSize: number;
  specialty: string | null;
  cells: ComparisonCell[];
}

// ===================================================================== Población

export type FatigueValidationState = 'calibrating' | 'validated' | 'not_valid';

/** Lo que devuelve population_baselines. Todo son números con llaves de la taxonomía */
export interface PopulationBaselines {
  available: boolean;
  runAt: string | null;
  bias: Record<string, { students: number; rate: number }>;
  motives: Record<string, Record<string, number>>;
  topics: Record<string, { students: number; accuracy: number; difficulty: number | null }>;
  indicators: Record<string, { students: number; rate: number }>;
  fatigue: { state: FatigueValidationState; students: number; longSessions: number };
}

// ===================================================================== Modelo del alumno

/** Una parte del modelo mientras reúne datos, o lista con su valor (calibrando hasta el umbral) */
export type PartState<T> =
  { state: 'calibrating'; have: number; need: number } | { state: 'ready'; value: T };

export interface StudentModel {
  asOf: string;
  mastery: {
    byBranch: Record<string, PartState<number>>;
    byTopic: Record<string, PartState<number>>;
  };
  ability: PartState<{ theta: number; se: number }>;
  bias: {
    vocabulary: 'bias' | 'trap';
    prone: string[];
    baseline: 'population' | 'chance';
    byTag: Record<string, PartState<number>>;
  };
  motives: PartState<{ shares: Record<string, number>; top: string | null }>;
  fatigue: PartState<{ detected: boolean }> & { validation: FatigueValidationState };
  pace: PartState<{ secondsPerItem: number }>;
  consistency: PartState<{ activeDays30: number }>;
  reviewLoad: PartState<{ dueToday: number; next7: number; dailyAverage: number }>;
  reinforce: {
    key: string;
    priority: number;
    why: string;
    action: 'review_cards' | 'topic_simulator' | 'challenge';
    populationHard: boolean;
  }[];
}

// ===================================================================== Modo adaptativo

export interface AdaptiveAvailability {
  available: boolean;
  /** Preguntas al menos provisionales dentro de lo que eligió el alumno */
  calibratedInScope: number;
  /** Las que hacen falta (model_settings.thresholds.adaptiveMinItems) */
  needed: number;
}

// ===================================================================== Pantallas del equipo (1.9)
// Las formas de admin_calibration_runs y editor_agreement_history. No están en 9.5, pero las comparten
// el servidor, los dobles de las e2e y la pantalla Calibración y el historial de Acuerdo del paquete C

export type CalibrationRunStatus =
  'running' | 'ok' | 'partial' | 'failed' | 'skipped' | 'interrupted';

/** Una corrida de la calibración nocturna como la ve el admin. counts solo trae números y códigos */
export interface CalibrationRunSummary {
  id: string;
  trigger: 'schedule' | 'manual' | 'selftest';
  mode: 'dry_run' | 'apply';
  status: CalibrationRunStatus;
  /** Por qué se saltó o no terminó, un código en minúsculas. null si no hay */
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** El número de la corrida de GitHub y el commit, nada más */
  runner: { runId?: string; sha?: string };
  counts: Record<string, number | string | boolean>;
}

/** Lo que devuelve admin_calibration_runs. Solo el admin */
export interface AdminCalibrationRuns {
  /** Cuándo terminó bien la última corrida (ok o partial). null si nunca */
  lastOkAt: string | null;
  /** La corrida cuyos resultados leen hoy los alumnos (model_publication) */
  publication: { runId: string; at: string } | null;
  /** model_settings tal como los lee el servidor, con sus respaldos y el piso de 30 */
  settings: Record<string, unknown>;
  runs: CalibrationRunSummary[];
  overview: {
    /** Versiones aprobadas del banco por estado de calibración */
    items: Record<CalibrationState, number>;
    /** Temas que más cuestan, solo de celdas de 30 alumnos o más */
    hardestTopics: { key: string; students: number; accuracy: number }[];
    /** Reparto de motivos de error por rama, solo de celdas de 30 alumnos o más */
    motives: Record<string, Record<string, number>>;
    fatigue: { state: FatigueValidationState; students: number; longSessions: number };
    agreement: { kappa: number | null; parity: boolean } | null;
  };
}

/** El acuerdo del etiquetado de una noche (agreement_snapshots), una línea del historial de Acuerdo */
export interface AgreementNight {
  studyDay: string;
  at: string;
  pairs: number;
  kappa: number | null;
  observed: number | null;
  expected: number | null;
  /** El kappa de la noche coincide con el de bias_agreement_summary de B11 (3.8) */
  parity: boolean;
}

/** Lo que devuelve editor_agreement_history. Médico, admin y dueño */
export interface AgreementHistory {
  nights: AgreementNight[];
}
