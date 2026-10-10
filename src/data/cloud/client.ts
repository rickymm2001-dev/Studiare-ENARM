// Cliente de Supabase (Fase P, bloque 9, D-075). Solo usa la URL del proyecto y la llave pública,
// que viajan al navegador por diseño. La seguridad la dan los permisos por fila del esquema
// (D-069). Sin las dos variables la app sigue funcionando completa en el navegador.
import type { SupabaseClient } from '@supabase/supabase-js';
import { jwtRole } from './keyRole';

export interface CloudConfig {
  url: string;
  publicKey: string;
}

/** Lee la configuración pública. null si falta alguna de las dos variables */
export function readCloudConfig(
  env: Record<string, unknown> = import.meta.env,
): CloudConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const publicKey =
    typeof env.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || publicKey.length < 20) return null;
  // Nunca se acepta una llave secreta en el navegador. Ni la nueva (sb_secret_) ni la anterior, que
  // es un JWT con rol de servicio y se parece a la llave pública. Solo pasa el rol anon
  if (publicKey.startsWith('sb_secret_')) return null;
  const role = jwtRole(publicKey);
  if (role !== null && role !== 'anon') return null;
  return { url, publicKey };
}

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | undefined;

async function createCloud(): Promise<SupabaseClient | null> {
  const config = readCloudConfig();
  if (!config) return null;
  // El SDK de Supabase pesa más de 100 KB comprimidos y solo hace falta con la nube configurada.
  // Se baja aparte, justo después de pintar la primera pantalla, y no cuenta en el JavaScript
  // inicial (14.4)
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(config.url, config.publicKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // implicit deja abrir el enlace del correo en otro navegador o en el teléfono
      flowType: 'implicit',
    },
  });
  return client;
}

/**
 * Baja el SDK y crea el cliente único. Resuelve null si la nube no está configurada o si el SDK no
 * se pudo bajar, y en ese caso la siguiente llamada lo intenta otra vez
 */
export function loadCloud(): Promise<SupabaseClient | null> {
  loading ??= createCloud().catch(() => {
    loading = undefined;
    return null;
  });
  return loading;
}

/**
 * Quita del navegador la sesión que guardó Supabase, sin el SDK. Sirve para cerrar sesión cuando el
 * SDK no se pudo bajar, porque sin esto la sesión se restauraría sola en la siguiente carga
 */
export function forgetStoredCloudSession(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && /^sb-[a-z0-9-]+-auth-token/.test(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/**
 * El cliente, solo si ya se bajó. Con la sesión de la nube abierta siempre está, porque quien la
 * abre lo bajó antes. Para preguntar si la nube está configurada se usa cloudConfigured, que no
 * espera al SDK
 */
export function getCloud(): SupabaseClient | null {
  return client;
}

export const cloudConfigured = () => readCloudConfig() !== null;
