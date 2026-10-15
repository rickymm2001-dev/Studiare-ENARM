// Configuración de los motores de IA del proxy (8.1). Modelos por motor, precios y límites. Los
// valores de aquí son los de fábrica. Se cambian desde la pantalla de configuración del admin, que
// los guarda en la tabla ai_config en la nube o en server/ai-config.local.json en desarrollo
// (server/src/ai/configFile.ts). Nunca hay una clave en este archivo. Sin Node ni Deno (B12, 1.1).
import { z } from 'zod';
import { modelChoiceProblem } from './models.ts';
import {
  AI_ENGINES,
  AiEffortSchema,
  AiThinkingSchema,
  MAX_GENERATION_SECTIONS,
  type AiEffort,
  type AiEngine,
  type AiThinking,
} from './engines/aiContracts.ts';

/** Esfuerzo que acepta la API (output_config.effort). Qué modelo acepta cuál lo decide el servidor (2.8) */
export type Effort = AiEffort;

/**
 * Razonamiento del modelo (B12, 2.8). adaptive deja que el modelo razone cuando lo necesita. off lo
 * apaga donde el modelo lo permite, como disabled en Haiku 5.5 o between_tools en Sonnet 5.5. Un
 * modelo sin razonamiento configurable, como Haiku 4.5, lleva null y la petición no manda thinking
 */
export type Thinking = AiThinking;

export interface ModelChoice {
  /** ID del modelo tal cual, sin sufijo de fecha */
  id: string;
  /** Esfuerzo de razonamiento. null en modelos que no lo aceptan, como Haiku 4.5 */
  effort: Effort | null;
  /** Razonamiento. null en modelos sin razonamiento configurable, como Haiku 4.5 */
  thinking: Thinking | null;
  /** Tope de tokens de salida, que en modelos con razonamiento incluye el razonamiento */
  maxTokens: number;
}

/** Dólares por millón de tokens */
export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface AiLimits {
  /**
   * Llamadas por alumno por día y por motor (8.1). Las tarjetas cuentan una llamada por sección de
   * texto, y el plan de pago da hasta 20 generaciones de 12 secciones, así que su tope es mayor
   */
  perStudentPerDay: Record<AiEngine, number>;
  /** Presupuesto diario total en dólares. Solo cuenta el gasto real */
  dailyBudgetUsd: number;
  /**
   * Tope en dólares por alumno al día (B12, 2.4 y 10.6). Médicos, admins y dueño no lo tienen, pero
   * sus llamadas sí cuentan en la cuota del motor y en el total
   */
  perUserDailyUsd: number;
  /**
   * Cuota de cada motor como fracción del presupuesto del día (B12, 2.4 y 10.7). Son techos y no
   * apartados, así que pueden sumar más de 1
   */
  engineShare: Record<AiEngine, number>;
  /** Generaciones de tarjetas por alumno al día. Igual a AI_CARDS_PER_DAY_PAID de src/config/billing.ts */
  cardGenerationsPerDay: number;
  /**
   * Secciones por generación de tarjetas. Igual a SECTIONS_PER_GENERATION de src/ai/flashcards.ts y
   * nunca más que MAX_GENERATION_SECTIONS, que es lo que acepta el sobre
   */
  sectionsPerGeneration: number;
  /** Trabajos por lote pendientes por alumno (B12, 3.4) */
  maxPendingJobs: number;
  /** Tiempo máximo de cada intento de una llamada al modelo */
  timeoutMs: number;
  /**
   * Reintentos del SDK ante fallas de red o 5xx, con espera exponencial. Uno de fábrica, como pide 2.8 del
   * plan de B12. Con dos, una llamada podía hacer tres intentos de 30 s y el reintento por validación otros
   * tres, más que los 150 s que da el plan Free antes de cortar la función
   */
  maxRetries: number;
}

export interface AiConfig {
  models: Record<AiEngine, ModelChoice>;
  prices: Record<string, ModelPrice>;
  limits: AiLimits;
}

// Los precios son los de la sección 8.1 a octubre de 2026. Haiku 5.5 queda listo para cambiar a él
// cuando las evaluaciones con clave lo respalden, a $0.10 y $0.50 por millón con prompts de hasta
// 100,000 tokens. Su caché se estima con los mismos factores que los demás. Los modelos que elija
// npm run eval-ai los aplica la sesión principal aquí (B12, contrato C4)
export const DEFAULT_CONFIG: AiConfig = {
  models: {
    forgetting: { id: 'claude-haiku-4-5', effort: null, thinking: null, maxTokens: 1500 },
    weekly_report: { id: 'claude-haiku-4-5', effort: null, thinking: null, maxTokens: 1500 },
    flashcards: { id: 'claude-sonnet-5-5', effort: 'low', thinking: 'adaptive', maxTokens: 6000 },
    bias_tips: { id: 'claude-haiku-4-5', effort: null, thinking: null, maxTokens: 1000 },
    restructure: { id: 'claude-sonnet-5-5', effort: 'low', thinking: 'adaptive', maxTokens: 4000 },
  },
  prices: {
    'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
    'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  },
  limits: {
    perStudentPerDay: {
      forgetting: 12,
      weekly_report: 4,
      flashcards: 240,
      bias_tips: 12,
      restructure: 20,
    },
    dailyBudgetUsd: 5,
    perUserDailyUsd: 0.3,
    engineShare: {
      forgetting: 0.1,
      weekly_report: 0.1,
      flashcards: 0.55,
      bias_tips: 0.1,
      restructure: 0.15,
    },
    cardGenerationsPerDay: 20,
    sectionsPerGeneration: 12,
    maxPendingJobs: 12,
    timeoutMs: 30_000,
    maxRetries: 1,
  },
};

const ModelIdSchema = z
  .string()
  .regex(/^claude-[a-z0-9-]+$/)
  // Sin sufijo de fecha, que se retira y rompe la configuración meses después
  .refine((id) => !/-\d{8}$/.test(id), 'El ID del modelo va sin sufijo de fecha');
const ModelChoiceSchema = z.strictObject({
  id: ModelIdSchema,
  effort: AiEffortSchema.nullable(),
  /**
   * Opcional en un cambio. Sin él se queda el del motor si el modelo no cambia, y si cambia queda
   * null. Así un cambio de antes de B12 o una configuración guardada sin él se siguen leyendo
   */
  thinking: AiThinkingSchema.nullable().optional(),
  maxTokens: z.int().min(200).max(32_000),
});
const PriceSchema = z.strictObject({
  input: z.number().min(0).max(1000),
  output: z.number().min(0).max(1000),
  cacheWrite: z.number().min(0).max(1000),
  cacheRead: z.number().min(0).max(1000),
});
const LimitsSchema = z.strictObject({
  perStudentPerDay: z.partialRecord(z.enum(AI_ENGINES), z.int().min(1).max(10_000)),
  dailyBudgetUsd: z.number().min(0).max(100_000),
  perUserDailyUsd: z.number().min(0).max(1000),
  engineShare: z.partialRecord(z.enum(AI_ENGINES), z.number().min(0).max(1)),
  cardGenerationsPerDay: z.int().min(1).max(1000),
  sectionsPerGeneration: z.int().min(1).max(MAX_GENERATION_SECTIONS),
  maxPendingJobs: z.int().min(1).max(1000),
  timeoutMs: z.int().min(1000).max(120_000),
  maxRetries: z.int().min(0).max(5),
});

/** Lo que se puede cambiar. Todo es opcional y lo que falta queda como estaba */
export const AiConfigPatchSchema = z.strictObject({
  models: z.partialRecord(z.enum(AI_ENGINES), ModelChoiceSchema).optional(),
  prices: z.record(ModelIdSchema, PriceSchema).optional(),
  limits: LimitsSchema.partial().optional(),
});
export type AiConfigPatch = z.infer<typeof AiConfigPatchSchema>;

export function mergeConfig(base: AiConfig, patch: AiConfigPatch): AiConfig {
  const models = { ...base.models };
  for (const engine of AI_ENGINES) {
    const next = patch.models?.[engine];
    if (!next) continue;
    const before = base.models[engine];
    const thinking =
      next.thinking !== undefined ? next.thinking : next.id === before.id ? before.thinking : null;
    models[engine] = { id: next.id, effort: next.effort, thinking, maxTokens: next.maxTokens };
  }
  const merged: AiConfig = {
    models,
    prices: { ...base.prices, ...patch.prices },
    limits: {
      ...base.limits,
      ...patch.limits,
      perStudentPerDay: {
        ...base.limits.perStudentPerDay,
        ...patch.limits?.perStudentPerDay,
      },
      engineShare: {
        ...base.limits.engineShare,
        ...patch.limits?.engineShare,
      },
    },
  };
  // Un modelo sin precio no se puede presupuestar, así que no se acepta
  for (const engine of AI_ENGINES) {
    if (!merged.prices[merged.models[engine].id]) {
      throw new Error(`Falta el precio del modelo ${merged.models[engine].id}`);
    }
  }
  return merged;
}

/**
 * Por qué una configuración no se puede usar, o null. Cada modelo tiene que cumplir sus reglas de
 * esfuerzo y razonamiento (models.ts), y se rechaza al guardarla y no a media llamada (B12, 2.8)
 */
export function configProblem(config: AiConfig): string | null {
  for (const engine of AI_ENGINES) {
    const problem = modelChoiceProblem(config.models[engine]);
    if (problem) return `El motor ${engine} no se puede guardar así. ${problem}`;
  }
  return null;
}
