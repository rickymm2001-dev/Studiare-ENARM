// Proyección del costo de la IA por alumno al mes (B12, 3.3 y 4.6 del plan). Parte del costo medido
// por llamada de cada motor con el candidato elegido. Las hipótesis van por lote en producción, así
// que cuestan la mitad. Las reestructuradas no son de alumnos y se reportan aparte, también por lote.
import { AI_ENGINES, type AiEngine } from '../../src/engines/aiContracts.ts';
import { BATCH_DISCOUNT } from './budget.ts';

export const PROFILE_NAMES = ['light', 'typical', 'intense'] as const;
export type ProfileName = (typeof PROFILE_NAMES)[number];

/** Llamadas de un alumno al mes por motor. Las tarjetas cuentan secciones */
export type StudentProfile = Readonly<Record<Exclude<AiEngine, 'restructure'>, number>>;

/**
 * Perfiles de uso al mes. El típico es el de 3.3, con 12 hipótesis, 4 informes, 16 consejos y 40
 * secciones de tarjetas (unas 13 generaciones de 3 secciones). El intenso sube a 200 secciones
 */
export const STUDENT_PROFILES: Readonly<Record<ProfileName, StudentProfile>> = {
  light: { forgetting: 4, weekly_report: 4, bias_tips: 8, flashcards: 10 },
  typical: { forgetting: 12, weekly_report: 4, bias_tips: 16, flashcards: 40 },
  intense: { forgetting: 12, weekly_report: 4, bias_tips: 16, flashcards: 200 },
};

export const PROFILE_LABELS: Readonly<Record<ProfileName, string>> = {
  light: 'Ligero',
  typical: 'Típico',
  intense: 'Intenso',
};

/** Preguntas reestructuradas al mes en todo el sistema, por lote (3.3) */
export const RESTRUCTURE_PER_MONTH = 20;

/** En producción, qué motores van por lote. Hoy solo las hipótesis (10.5) */
export const PRODUCTION_BATCH: ReadonlySet<AiEngine> = new Set<AiEngine>(['forgetting']);

export interface ProfileProjection {
  profile: ProfileName;
  /** Dólares al mes por motor */
  perEngine: Partial<Record<AiEngine, number>>;
  monthlyUsd: number;
  /** Alumnos activos que alcanzan con el presupuesto del día, con este perfil */
  studentsPerDay: number;
  /** El perfil pasa del tope por alumno al día, así que en la práctica el servidor lo frena */
  overDailyCap: boolean;
}

export interface Projection {
  profiles: ProfileProjection[];
  /** Las reestructuradas del mes, en todo el sistema, por lote */
  restructureMonthlyUsd: number | null;
  /** Motores sin costo medido, que no entran a la cuenta */
  missing: AiEngine[];
}

const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * La proyección por perfil. costPerCall es el costo medido por llamada, al momento. El descuento de
 * lote se aplica aquí a los motores que van por lote en producción
 */
export function projectCosts(
  costPerCall: Partial<Record<AiEngine, number>>,
  limits: { dailyBudgetUsd: number; perUserDailyUsd: number },
): Projection {
  const missing = AI_ENGINES.filter((engine) => costPerCall[engine] === undefined);
  const unitCost = (engine: AiEngine) =>
    (costPerCall[engine] ?? 0) * (PRODUCTION_BATCH.has(engine) ? BATCH_DISCOUNT : 1);
  const profiles = PROFILE_NAMES.map((profile): ProfileProjection => {
    const counts = STUDENT_PROFILES[profile];
    const perEngine: Partial<Record<AiEngine, number>> = {};
    let monthly = 0;
    for (const engine of Object.keys(counts) as (keyof StudentProfile)[]) {
      const cost = counts[engine] * unitCost(engine);
      perEngine[engine] = round(cost);
      monthly += cost;
    }
    const daily = monthly / 30;
    return {
      profile,
      perEngine,
      monthlyUsd: round(monthly),
      studentsPerDay:
        daily > 0 ? Math.floor(limits.dailyBudgetUsd / daily) : Number.POSITIVE_INFINITY,
      overDailyCap: daily > limits.perUserDailyUsd,
    };
  });
  const restructure = costPerCall.restructure;
  return {
    profiles,
    // Las reestructuradas quedan para el lote de noche de B14 (10.15)
    restructureMonthlyUsd:
      restructure === undefined
        ? null
        : round(RESTRUCTURE_PER_MONTH * restructure * BATCH_DISCOUNT),
    missing,
  };
}
