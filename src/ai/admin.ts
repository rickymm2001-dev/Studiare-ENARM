// Lo que el admin ve y cambia del proxy de IA (pantallas 23 y 25). Lee cuánto se ha gastado hoy, la
// configuración de modelos, precios y límites, y la guarda. Si no hay proxy, como en la demo
// publicada, no hay nada que leer y las pantallas lo dicen. Los esquemas repiten los del proxy,
// porque el cliente no puede cargar los archivos del servidor.
import { z } from 'zod';
import { AI_ENGINES } from '@/engines/aiContracts';
import type { AiStatus } from './client';

export const ADMIN_URL = '/api/ai';
const TIMEOUT_MS = 5000;

const EngineRecord = <T extends z.ZodType>(value: T) => z.record(z.enum(AI_ENGINES), value);

export const AdminConfigSchema = z.strictObject({
  models: EngineRecord(
    z.strictObject({
      id: z.string(),
      effort: z.enum(['low', 'medium', 'high']).nullable(),
      maxTokens: z.int(),
    }),
  ),
  prices: z.record(
    z.string(),
    z.strictObject({
      input: z.number(),
      output: z.number(),
      cacheWrite: z.number(),
      cacheRead: z.number(),
    }),
  ),
  limits: z.strictObject({
    perStudentPerDay: EngineRecord(z.int()),
    dailyBudgetUsd: z.number(),
    timeoutMs: z.int(),
    maxRetries: z.int(),
  }),
});
export type AdminConfig = z.infer<typeof AdminConfigSchema>;

const ConfigResponseSchema = z.strictObject({
  mode: z.enum(['real', 'mock']),
  config: AdminConfigSchema,
  prompts: z.record(z.string(), z.string()),
});
export type AdminConfigResponse = z.infer<typeof ConfigResponseSchema>;

const UsageResponseSchema = z.strictObject({
  mode: z.enum(['real', 'mock']),
  limits: AdminConfigSchema.shape.limits,
  usage: z.strictObject({
    day: z.string(),
    calls: z.int(),
    students: z.int(),
    spentUsd: z.number(),
    byEngine: z.partialRecord(
      z.enum(AI_ENGINES),
      z.strictObject({ calls: z.int(), costUsd: z.number() }),
    ),
  }),
});
export type AdminUsageResponse = z.infer<typeof UsageResponseSchema>;

/** Hay proxy al que preguntarle. Sin proxy, sin conexión o todavía revisando no se intenta */
export const proxyAvailable = (status: AiStatus) =>
  status.kind === 'real' || status.kind === 'mock';

async function getJson<S extends z.ZodType>(
  path: string,
  schema: S,
  fetchImpl: typeof fetch,
): Promise<z.infer<S> | null> {
  try {
    const response = await fetchImpl(`${ADMIN_URL}${path}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const fetchAdminConfig = (fetchImpl: typeof fetch = fetch) =>
  getJson('/config', ConfigResponseSchema, fetchImpl);

export const fetchAdminUsage = (fetchImpl: typeof fetch = fetch) =>
  getJson('/usage', UsageResponseSchema, fetchImpl);

/** Cambios que acepta el proxy. Todo es opcional y lo que falta queda como estaba */
export interface AdminConfigPatch {
  models?: Partial<AdminConfig['models']>;
  prices?: AdminConfig['prices'];
  limits?: {
    perStudentPerDay?: Partial<AdminConfig['limits']['perStudentPerDay']>;
    dailyBudgetUsd?: number;
    timeoutMs?: number;
    maxRetries?: number;
  };
}

export type SaveResult =
  { ok: true; response: AdminConfigResponse } | { ok: false; message: string };

export async function saveAdminConfig(
  patch: AdminConfigPatch,
  fetchImpl: typeof fetch = fetch,
): Promise<SaveResult> {
  try {
    const response = await fetchImpl(`${ADMIN_URL}/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, message: 'El proxy no aceptó los cambios. Revisa los valores.' };
    }
    // La respuesta de un cambio no trae las versiones de los prompts. Se vuelve a pedir completa
    const fresh = await fetchAdminConfig(fetchImpl);
    return fresh
      ? { ok: true, response: fresh }
      : { ok: false, message: 'Se guardó, pero no se pudo volver a leer la configuración.' };
  } catch {
    return { ok: false, message: 'No se pudo conectar con el proxy.' };
  }
}
