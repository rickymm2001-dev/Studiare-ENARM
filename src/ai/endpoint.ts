// A dónde y cómo habla la app con el proxy de IA. Por omisión es /api, el proxy local que levanta
// npm run dev, sin sesión. En el build publicado habla con la Edge Function ai-proxy de Supabase
// (B12, 3.5), que pide la sesión de Supabase en cada llamada. La dirección sale, en este orden, de
//   1. VITE_AI_URL si es https, un origen o un origen con /functions/v1/ai-proxy
//   2. la de Supabase más /functions/v1/ai-proxy, en un build de producción con VITE_SUPABASE_URL,
//      así Pages y Cloudflare usan la función sin variables nuevas
//   3. /api, el proxy local
// Esas direcciones son públicas por diseño, como la de Supabase. Nunca llevan una llave.
import { loadCloud } from '@/data/cloud/client';
import { supabaseOriginOf } from '@/config/csp';

const LOCAL_BASE = '/api';
/** Dónde vive la función dentro del proyecto de Supabase */
export const AI_FUNCTION_PATH = '/functions/v1/ai-proxy';

const ORIGIN = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;

/** La dirección de VITE_AI_URL si es un origen https, con o sin la ruta de la función */
function configuredBase(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  if (ORIGIN.test(raw)) return raw;
  if (raw.endsWith(AI_FUNCTION_PATH) && ORIGIN.test(raw.slice(0, -AI_FUNCTION_PATH.length))) {
    return raw;
  }
  return null;
}

/** La base del proxy de IA según el entorno de construcción. Una dirección rara cae en /api */
export function aiBaseUrl(env: Record<string, unknown> = import.meta.env): string {
  const configured = configuredBase(env.VITE_AI_URL);
  if (configured) return configured;
  if (env.PROD === true) {
    const supabase = supabaseOriginOf(
      typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL : undefined,
    );
    if (supabase) return `${supabase}${AI_FUNCTION_PATH}`;
  }
  return LOCAL_BASE;
}

export const AI_BASE_URL = aiBaseUrl();

/** El proxy es el alojado, que pide sesión en cada llamada */
export const aiIsHosted = (base: string = AI_BASE_URL) => base !== LOCAL_BASE;

/**
 * Encabezados de sesión para el proxy alojado. Con el proxy local no hacen falta y no se manda
 * nada. Sin sesión tampoco se manda nada, y el proxy contesta que falta iniciar sesión
 */
export async function aiAuthHeaders(base: string = AI_BASE_URL): Promise<Record<string, string>> {
  if (!aiIsHosted(base)) return {};
  const cloud = await loadCloud();
  if (!cloud) return {};
  const { data } = await cloud.auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}
