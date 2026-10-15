// Las variables de las Edge Functions de IA (B12, 2.7). Los index.ts leen cada nombre con
// Deno.env.get y lo pasan aquí, donde se validan todas juntas sin imprimir nunca un valor. La clave de
// Anthropic se llama ENARM_ANTHROPIC_KEY y la pone Ricardo como secreto de las funciones. Sin ella, y
// sin AI_ALLOW_MOCK=1, la función contesta not_configured y /health dice unavailable (2.9).
//   ENARM_ANTHROPIC_KEY  Ricardo, en el panel de Supabase
//   APP_ORIGINS          orígenes de la app para CORS, separados por comas (solo ai-proxy)
//   AI_ALLOW_MOCK        1 mientras no existe la clave. Respuestas fijas con su etiqueta
//   AI_TICK_DEADLINE_MS  plazo interno del ciclo de lotes (solo ai-batch, 100 s por omisión)
//   SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY, que pone Supabase
import { parseOrigins } from './cors.ts';

/** Los nombres que leen las funciones de IA. Ninguno más (prueba de arquitectura, 7.6) */
export const AI_PROXY_ENV_NAMES = [
  'ENARM_ANTHROPIC_KEY',
  'APP_ORIGINS',
  'AI_ALLOW_MOCK',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;
export const AI_BATCH_ENV_NAMES = [
  'ENARM_ANTHROPIC_KEY',
  'AI_ALLOW_MOCK',
  'AI_TICK_DEADLINE_MS',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

export type AiProxyEnvSource = Readonly<
  Record<(typeof AI_PROXY_ENV_NAMES)[number], string | undefined>
>;
export type AiBatchEnvSource = Readonly<
  Record<(typeof AI_BATCH_ENV_NAMES)[number], string | undefined>
>;

interface SupabaseEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  /** null sin clave. Con allowMock la función contesta con respuestas fijas */
  anthropicKey: string | null;
  allowMock: boolean;
}

export interface AiProxyEnv extends SupabaseEnv {
  origins: ReadonlySet<string>;
}

export interface AiBatchEnv extends SupabaseEnv {
  tickDeadlineMs: number;
}

export type EnvResult<T> = { ok: true; env: T } | { ok: false; problems: string[] };

const SUPABASE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
export const DEFAULT_TICK_DEADLINE_MS = 100_000;

/** El rol de una llave JWT anterior de Supabase, o null si no es un JWT */
function jwtRole(key: string): string | null {
  const payload = key.split('.')[1];
  if (key.split('.').length !== 3 || !payload) return null;
  try {
    const text = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const role = (JSON.parse(text) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

function readSupabase(
  source: Readonly<Record<string, string | undefined>>,
  problems: string[],
): SupabaseEnv {
  const get = (name: string) => (source[name] ?? '').trim();
  const supabaseUrl = get('SUPABASE_URL').replace(/\/+$/, '');
  if (!SUPABASE_URL.test(supabaseUrl)) {
    problems.push('SUPABASE_URL debe ser la dirección del proyecto, como https://abc.supabase.co');
  }
  const anonKey = get('SUPABASE_ANON_KEY');
  if (anonKey.length < 20) problems.push('Falta SUPABASE_ANON_KEY, la llave pública del proyecto');
  else if (anonKey.startsWith('sb_secret_') || jwtRole(anonKey) === 'service_role') {
    problems.push('SUPABASE_ANON_KEY trae una llave secreta. Va la llave pública');
  }
  const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey.length < 20) {
    problems.push('Falta SUPABASE_SERVICE_ROLE_KEY, la llave de servicio del proyecto');
  } else if (
    serviceKey === anonKey ||
    serviceKey.startsWith('sb_publishable_') ||
    jwtRole(serviceKey) === 'anon'
  ) {
    problems.push('SUPABASE_SERVICE_ROLE_KEY trae la llave pública. Falta la de servicio');
  }
  const key = get('ENARM_ANTHROPIC_KEY');
  return {
    supabaseUrl,
    anonKey,
    serviceKey,
    anthropicKey: key === '' ? null : key,
    allowMock: get('AI_ALLOW_MOCK') === '1',
  };
}

export function readAiProxyEnv(source: AiProxyEnvSource): EnvResult<AiProxyEnv> {
  const problems: string[] = [];
  const base = readSupabase(source, problems);
  const origins = parseOrigins(source.APP_ORIGINS ?? '');
  if (!origins.ok) problems.push(origins.problem);
  if (problems.length > 0 || !origins.ok) return { ok: false, problems };
  return { ok: true, env: { ...base, origins: new Set(origins.origins) } };
}

export function readAiBatchEnv(source: AiBatchEnvSource): EnvResult<AiBatchEnv> {
  const problems: string[] = [];
  const base = readSupabase(source, problems);
  const deadlineText = (source.AI_TICK_DEADLINE_MS ?? '').trim();
  const tickDeadlineMs = deadlineText === '' ? DEFAULT_TICK_DEADLINE_MS : Number(deadlineText);
  // Menos que el reloj de la función, 150 s en Free y 400 s en planes de pago
  if (!Number.isInteger(tickDeadlineMs) || tickDeadlineMs < 10_000 || tickDeadlineMs > 380_000) {
    problems.push('AI_TICK_DEADLINE_MS va en milisegundos, entre 10000 y 380000');
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, env: { ...base, tickDeadlineMs } };
}
