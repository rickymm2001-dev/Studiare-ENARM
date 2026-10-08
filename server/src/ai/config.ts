// Configuración de los motores de IA del proxy (8.1). Modelos por motor, precios y límites. Los
// valores de aquí son los de fábrica. Para cambiarlos se escribe server/ai-config.local.json, que
// queda fuera de git, o se edita desde la pantalla de configuración del admin. Nunca hay una clave
// en este archivo.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { AI_ENGINES, type AiEngine } from '../../../src/engines/aiContracts.ts';

export type Effort = 'low' | 'medium' | 'high';

export interface ModelChoice {
  /** ID del modelo tal cual, sin sufijo de fecha */
  id: string;
  /** Esfuerzo de razonamiento. null en modelos que no lo aceptan, como Haiku 4.5 */
  effort: Effort | null;
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
  /** Llamadas por alumno por día (8.1) */
  perStudentPerDay: number;
  /** Presupuesto diario total en dólares. Solo cuenta el gasto real */
  dailyBudgetUsd: number;
  /** Tiempo máximo de una llamada al modelo */
  timeoutMs: number;
  /** Reintentos del SDK ante fallas de red o 5xx, con espera exponencial */
  maxRetries: number;
}

export interface AiConfig {
  models: Record<AiEngine, ModelChoice>;
  prices: Record<string, ModelPrice>;
  limits: AiLimits;
}

// Los precios son los de la sección 8.1 a octubre de 2026. Haiku 5.5 queda listo para cambiar a él
// cuando las evaluaciones con clave lo respalden, a $0.10 y $0.50 por millón con prompts de hasta
// 100,000 tokens. Su caché se estima con los mismos factores que los demás
export const DEFAULT_CONFIG: AiConfig = {
  models: {
    forgetting: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
    weekly_report: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
    flashcards: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 6000 },
    bias_tips: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1000 },
    restructure: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 4000 },
  },
  prices: {
    'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
    'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  },
  limits: { perStudentPerDay: 30, dailyBudgetUsd: 5, timeoutMs: 30_000, maxRetries: 2 },
};

const ModelIdSchema = z
  .string()
  .regex(/^claude-[a-z0-9-]+$/)
  // Sin sufijo de fecha, que se retira y rompe la configuración meses después
  .refine((id) => !/-\d{8}$/.test(id), 'El ID del modelo va sin sufijo de fecha');
const ModelChoiceSchema = z.strictObject({
  id: ModelIdSchema,
  effort: z.enum(['low', 'medium', 'high']).nullable(),
  maxTokens: z.int().min(200).max(32_000),
});
const PriceSchema = z.strictObject({
  input: z.number().min(0).max(1000),
  output: z.number().min(0).max(1000),
  cacheWrite: z.number().min(0).max(1000),
  cacheRead: z.number().min(0).max(1000),
});
const LimitsSchema = z.strictObject({
  perStudentPerDay: z.int().min(1).max(10_000),
  dailyBudgetUsd: z.number().min(0).max(100_000),
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
    if (next) models[engine] = next;
  }
  const merged: AiConfig = {
    models,
    prices: { ...base.prices, ...patch.prices },
    limits: { ...base.limits, ...patch.limits },
  };
  // Un modelo sin precio no se puede presupuestar, así que no se acepta
  for (const engine of AI_ENGINES) {
    if (!merged.prices[merged.models[engine].id]) {
      throw new Error(`Falta el precio del modelo ${merged.models[engine].id}`);
    }
  }
  return merged;
}

/** Carga los cambios guardados en el archivo local. Si no hay archivo o está dañado, usa los de fábrica */
export function loadAiConfig(file: string | null): AiConfig {
  if (file === null || !existsSync(file)) return DEFAULT_CONFIG;
  try {
    const patch = AiConfigPatchSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    return mergeConfig(DEFAULT_CONFIG, patch);
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Guarda la configuración completa en el archivo local, sin dejar un archivo a medias */
export function saveAiConfig(file: string, config: AiConfig): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(temp, file);
}
