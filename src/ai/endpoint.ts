// A dónde y cómo habla la app con el proxy de IA. Por omisión es /api, el proxy local que levanta
// npm run dev, sin sesión. Con VITE_AI_URL apunta al proxy alojado (D-103), que pide la sesión de
// Supabase en cada llamada. Esa dirección es pública por diseño, como la de Supabase. Nunca lleva
// una llave.
import { loadCloud } from '@/data/cloud/client';

const LOCAL_BASE = '/api';

/** La dirección del proxy alojado si es https y está bien formada. Si no, el proxy local */
export function aiBaseUrl(env: Record<string, unknown> = import.meta.env): string {
  const raw = typeof env.VITE_AI_URL === 'string' ? env.VITE_AI_URL.trim().replace(/\/+$/, '') : '';
  return /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(raw) ? raw : LOCAL_BASE;
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
