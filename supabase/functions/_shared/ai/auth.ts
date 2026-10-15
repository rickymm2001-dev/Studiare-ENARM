// Quién llama a la Edge Function de IA (B12, 2.3). La app manda el token de la sesión de Supabase y
// aquí se verifica con una sola RPC, ai_whoami, pedida con el token del alumno y la llave pública,
// nunca con la llave de servicio. PostgREST valida el token. ai_whoami revisa el dispositivo activo y
// devuelve el rol de current_app_role, que con requireMfa solo da el rol del equipo con segundo
// factor (B9), y paid como user_plan distinto de free, que incluye la prueba, los pases y el mes de
// referido (B10). El alumno de cada llamada es siempre esa cuenta, nunca el studentRef del sobre.
import { z } from 'zod';
import { AI_ROLES, type AiCaller, type Clock, type WhoAmI, type WhoAmIResult } from './ports.ts';
import { callRpc, RestError } from './rest.ts';

/** Saca el token de un encabezado Authorization. null si no viene con la forma Bearer */
export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/.exec((header ?? '').trim());
  return match?.[1] ?? null;
}

const WhoAmISchema = z.object({
  userId: z.uuid(),
  role: z.enum(AI_ROLES),
  paid: z.boolean(),
});

const MAX_CACHED = 500;

/**
 * ai_whoami por la API REST. Un 401 o un 28000 es una sesión vencida o cerrada, un 42501 con estado 403
 * es otro dispositivo y lo demás es Supabase sin contestar bien. El estado importa: PostgREST también
 * contesta 401 con 42501 cuando el rol es anon, que es lo que pasa si la sesión está cerrada y la app
 * manda la llave pública como Bearer, y eso no es otro dispositivo. Recuerda un token ya verificado
 * cacheMs (30 s) en la memoria de la copia de la función. Una falla nunca se recuerda, así un cambio de
 * dispositivo se nota enseguida
 */
export function createSupabaseWhoAmI(options: {
  url: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
  cacheMs?: number;
  clock?: Clock;
}): WhoAmI {
  const clock = options.clock ?? (() => Date.now());
  const cacheMs = options.cacheMs ?? 30_000;
  const cache = new Map<string, { until: number; caller: AiCaller }>();
  const target = {
    url: options.url,
    apiKey: options.anonKey,
    timeoutMs: 8000,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };

  async function verify(token: string): Promise<WhoAmIResult> {
    try {
      const parsed = WhoAmISchema.safeParse(await callRpc(target, 'ai_whoami', {}, token));
      if (!parsed.success) return { ok: false, failure: 'unavailable' };
      return { ok: true, caller: parsed.data };
    } catch (error) {
      if (error instanceof RestError) {
        if (error.status === 401 || error.code === '28000') {
          return { ok: false, failure: 'unauthenticated' };
        }
        if (error.status === 403 && error.code === '42501') {
          return { ok: false, failure: 'other_device' };
        }
      }
      return { ok: false, failure: 'unavailable' };
    }
  }

  return async (token) => {
    const cached = cache.get(token);
    if (cached && cached.until > clock()) return { ok: true, caller: { ...cached.caller } };
    const result = await verify(token);
    if (result.ok) {
      if (cache.size >= MAX_CACHED) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(token, { until: clock() + cacheMs, caller: result.caller });
    } else {
      cache.delete(token);
    }
    return result;
  };
}

/** Del encabezado Authorization a quién llama. Sin token con forma Bearer, sesión vencida */
export function identifyWith(whoami: WhoAmI) {
  return (authorization: string | undefined): Promise<WhoAmIResult> => {
    const token = bearerToken(authorization);
    if (!token) return Promise.resolve({ ok: false, failure: 'unauthenticated' });
    return whoami(token);
  };
}
