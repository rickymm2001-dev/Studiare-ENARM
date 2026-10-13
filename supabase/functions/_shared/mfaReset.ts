// Restablecer el segundo factor de alguien del equipo (B9 del plan del cambio, respuesta 30). Solo el
// dueño, con su propio segundo factor cuando la bandera requireMfa lo pide. La regla vive en la base,
// en authorize_mfa_reset, que se llama con la sesión de quien pide y deja constancia en mfa_resets.
// Si pasa, la función borra los factores con la API de administración de Supabase Auth y la llave de
// servicio, que nunca sale de aquí. Borrar un factor verificado cierra las sesiones de esa persona, que
// lo vuelve a dar de alta al entrar. Sin Deno, para probarla con Vitest.
import { corsHeaders } from './payments.ts';
import type { SupabaseEnv } from './supabase.ts';

export type AuthorizeOutcome = 'ok' | 'not_owner' | 'self' | 'not_found' | 'no_session';

export interface MfaResetDeps {
  /** Dirección pública de la app, para el CORS */
  appUrl: string | undefined;
  /** Revisa en la base, con la sesión de quien pide, que pueda restablecer el factor de target */
  authorize: (authorization: string, target: string) => Promise<AuthorizeOutcome>;
  /** Los ids de los factores de la cuenta. Lanza si Auth no responde */
  listFactors: (userId: string) => Promise<string[]>;
  /** Borra un factor. Lanza si Auth no responde */
  deleteFactor: (userId: string, factorId: string) => Promise<void>;
  log: (line: string) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
  });
}

const STATUS: Record<Exclude<AuthorizeOutcome, 'ok'>, number> = {
  no_session: 401,
  not_owner: 403,
  self: 403,
  not_found: 404,
};

export async function handleResetMfa(request: Request, deps: MfaResetDeps): Promise<Response> {
  const cors = corsHeaders({ APP_URL: deps.appUrl }, request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^bearer\s+\S+/i.test(authorization)) return json({ error: 'unauthorized' }, 401, cors);
  const body: unknown = await request.json().catch(() => null);
  const target = (body as { userId?: unknown } | null)?.userId;
  if (typeof target !== 'string' || !UUID.test(target)) {
    return json({ error: 'invalid' }, 400, cors);
  }
  try {
    const outcome = await deps.authorize(authorization, target);
    if (outcome === 'no_session') return json({ error: 'unauthorized' }, 401, cors);
    if (outcome !== 'ok') return json({ error: outcome }, STATUS[outcome], cors);
    const factors = await deps.listFactors(target);
    for (const factorId of factors) await deps.deleteFactor(target, factorId);
    return json({ removed: factors.length }, 200, cors);
  } catch (error) {
    // Sin ids, correos ni llaves. Solo qué paso falló
    deps.log(
      `No se pudo restablecer el segundo factor. ${error instanceof Error ? error.message : 'error desconocido'}`,
    );
    return json({ error: 'failed' }, 502, cors);
  }
}

/** authorize_mfa_reset con la sesión de quien pide. Traduce sus códigos de error */
export async function authorizeViaRest(
  env: SupabaseEnv,
  authorization: string,
  target: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthorizeOutcome> {
  const reply = await fetchImpl(`${env.url}/rest/v1/rpc/authorize_mfa_reset`, {
    method: 'POST',
    headers: { apikey: env.anonKey, authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ p_target: target }),
  });
  if (reply.ok) return 'ok';
  if (reply.status === 401) return 'no_session';
  const failure = (await reply.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
  if (failure.code === '28000') return 'no_session';
  if (failure.code === 'P0002') return 'not_found';
  if (failure.code === '42501') {
    return typeof failure.message === 'string' && /propio/i.test(failure.message)
      ? 'self'
      : 'not_owner';
  }
  throw new Error(`authorize_mfa_reset respondió ${String(reply.status)}`);
}

const adminHeaders = (env: SupabaseEnv) => ({
  apikey: env.serviceKey,
  authorization: `Bearer ${env.serviceKey}`,
});

/** Los factores de una cuenta con la API de administración de Auth */
export async function listFactorsViaRest(
  env: SupabaseEnv,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const reply = await fetchImpl(`${env.url}/auth/v1/admin/users/${userId}/factors`, {
    headers: adminHeaders(env),
  });
  if (!reply.ok) throw new Error(`la lista de factores respondió ${String(reply.status)}`);
  const factors: unknown = await reply.json();
  if (!Array.isArray(factors)) throw new Error('la lista de factores no es una lista');
  return factors
    .map((factor) => (factor as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
}

/** Borra un factor con la API de administración de Auth. Uno que ya no existe cuenta como borrado */
export async function deleteFactorViaRest(
  env: SupabaseEnv,
  userId: string,
  factorId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const reply = await fetchImpl(
    `${env.url}/auth/v1/admin/users/${userId}/factors/${encodeURIComponent(factorId)}`,
    { method: 'DELETE', headers: adminHeaders(env) },
  );
  if (!reply.ok && reply.status !== 404) {
    throw new Error(`borrar el factor respondió ${String(reply.status)}`);
  }
}
