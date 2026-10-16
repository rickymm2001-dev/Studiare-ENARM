// Cliente del proxy de IA. La app nunca llama a Anthropic directo, solo al proxy (8.1). En desarrollo
// es el proxy local en /api y en el build publicado la Edge Function ai-proxy de Supabase (B12).
// Sin proxy, en desarrollo y en la demo, todo corre con las respuestas fijas del propio cliente y
// se dice con la etiqueta de IA simulada (D-017). En producción, sin proxy o con la IA no
// disponible, la app usa sus plantillas sin hablar de IA (B12, 3.5 y 10.20).
import { AiHealthSchema, type AiEngine, type AiEngineGate } from '@/engines/aiContracts';
import { readAppEnv, type AppEnv } from '@/config/featureFlags';
import { AI_BASE_URL } from './endpoint';

/** Qué motores ven los alumnos. Un motor que falta cuenta como cerrado. Solo la Edge Function lo manda */
export type EngineGates = Partial<Record<AiEngine, AiEngineGate>>;

export type AiStatus =
  | { kind: 'checking' }
  /** El proxy responde y tiene clave. engines dice qué motores ven los alumnos */
  | { kind: 'real'; engines?: EngineGates }
  /** El proxy responde sin clave, con respuestas fijas del servidor */
  | { kind: 'mock'; engines?: EngineGates }
  /** No hay proxy. En desarrollo y en la demo la app usa las respuestas fijas del cliente */
  | { kind: 'no-proxy' }
  /**
   * La IA no está disponible. En producción es no haber proxy o que el proxy no tenga clave, y la
   * app usa sus plantillas sin decir IA (B12, 2.9)
   */
  | {
      kind: 'unavailable';
      /** La función respondió y dijo que no tiene IA. false es que ni siquiera contestó */
      reachable: boolean;
    }
  /** Sin conexión. Las funciones de IA dicen que necesitan conexión (14.4) */
  | { kind: 'offline' };

export const HEALTH_URL = `${AI_BASE_URL}/health`;
const TIMEOUT_MS = 3000;

/**
 * Lo que hace la app cuando no hay IA. En producción no hay respuestas fijas del cliente, así que
 * queda unavailable. En desarrollo y en la demo quedan las respuestas fijas, con su etiqueta
 */
export const withoutProxy = (appEnv: AppEnv, reachable = false): AiStatus =>
  appEnv === 'production' ? { kind: 'unavailable', reachable } : { kind: 'no-proxy' };

export async function fetchAiStatus(
  fetchImpl: typeof fetch = fetch,
  appEnv: AppEnv = readAppEnv(),
): Promise<AiStatus> {
  try {
    const response = await fetchImpl(HEALTH_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return withoutProxy(appEnv);
    const parsed = AiHealthSchema.safeParse(await response.json());
    if (!parsed.success) return withoutProxy(appEnv);
    const { mode, engines } = parsed.data;
    // Sin clave y sin permiso de respuestas simuladas, como si no hubiera proxy
    if (mode === 'unavailable') return withoutProxy(appEnv, true);
    return engines ? { kind: mode, engines } : { kind: mode };
  } catch {
    return withoutProxy(appEnv);
  }
}
