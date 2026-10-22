// Las variables de las Edge Functions de IA (B12, 2.7). Los index.ts leen cada nombre con
// Deno.env.get y lo pasan aquí, donde se validan todas juntas sin imprimir nunca un valor. La clave de
// Anthropic se llama ENARM_ANTHROPIC_KEY y la pone Ricardo como secreto de las funciones. Sin ella, y
// sin AI_ALLOW_MOCK=1, la función contesta not_configured y /health dice unavailable (2.9).
//   ENARM_ANTHROPIC_KEY  Ricardo, en el panel de Supabase
//   APP_ORIGINS          orígenes de la app para CORS, separados por comas (solo ai-proxy)
//   AI_ALLOW_MOCK        1 mientras no existe la clave. Respuestas fijas con su etiqueta
//   AI_TICK_DEADLINE_MS  plazo interno del ciclo de lotes (solo ai-batch, 100 s por omisión)
//   SUPABASE_URL y las llaves, que pone Supabase. Las nuevas (SUPABASE_SECRET_KEYS y SUPABASE_PUBLISHABLE_KEYS,
//                        JSON con la llave default) si existen y, si no, las de siempre (SUPABASE_SERVICE_ROLE_KEY y
//                        SUPABASE_ANON_KEY). Eligen y se validan en _shared/keys.ts (B17, 4.2)
import { keyLevel, resolveSupabaseKeys } from '../keys.ts';
import { parseOrigins } from './cors.ts';

/** Los nombres que leen las funciones de IA. Ninguno más (prueba de arquitectura, 7.6) */
export const AI_PROXY_ENV_NAMES = [
  'ENARM_ANTHROPIC_KEY',
  'APP_ORIGINS',
  'AI_ALLOW_MOCK',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEYS',
  'SUPABASE_SECRET_KEYS',
] as const;
export const AI_BATCH_ENV_NAMES = [
  'ENARM_ANTHROPIC_KEY',
  'AI_ALLOW_MOCK',
  'AI_TICK_DEADLINE_MS',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEYS',
  'SUPABASE_SECRET_KEYS',
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

function readSupabase(
  source: Readonly<Record<string, string | undefined>>,
  problems: string[],
): SupabaseEnv {
  const get = (name: string) => (source[name] ?? '').trim();
  const supabaseUrl = get('SUPABASE_URL').replace(/\/+$/, '');
  if (!SUPABASE_URL.test(supabaseUrl)) {
    problems.push('SUPABASE_URL debe ser la dirección del proyecto, como https://abc.supabase.co');
  }
  // Las nuevas si Supabase las pone y, si no, las de siempre. Aquí solo se revisa que no estén cruzadas
  const { anonKey, serviceKey } = resolveSupabaseKeys(source);
  if (anonKey.length < 20) {
    problems.push(
      'Falta la llave pública de Supabase (SUPABASE_PUBLISHABLE_KEYS o SUPABASE_ANON_KEY)',
    );
  } else if (keyLevel(anonKey) === 'service') {
    problems.push(
      'La llave pública de Supabase (SUPABASE_PUBLISHABLE_KEYS o SUPABASE_ANON_KEY) trae una llave secreta. Va la llave pública',
    );
  }
  if (serviceKey.length < 20) {
    problems.push(
      'Falta la llave de servicio de Supabase (SUPABASE_SECRET_KEYS o SUPABASE_SERVICE_ROLE_KEY)',
    );
  } else if (serviceKey === anonKey || keyLevel(serviceKey) === 'public') {
    problems.push(
      'La llave de servicio de Supabase (SUPABASE_SECRET_KEYS o SUPABASE_SERVICE_ROLE_KEY) trae la llave pública. Falta la de servicio',
    );
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
