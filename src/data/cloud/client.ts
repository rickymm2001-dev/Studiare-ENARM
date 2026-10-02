// Cliente de Supabase (Fase P, bloque 9, D-075). Solo usa la URL del proyecto y la llave pública,
// que viajan al navegador por diseño. La seguridad la dan los permisos por fila del esquema
// (D-069). Sin las dos variables la app sigue funcionando completa en el navegador.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  // Nunca se acepta una llave secreta en el navegador
  if (publicKey.startsWith('sb_secret_')) return null;
  return { url, publicKey };
}

let client: SupabaseClient | null | undefined;

/** Cliente único. null si la nube no está configurada */
export function getCloud(): SupabaseClient | null {
  if (client !== undefined) return client;
  const config = readCloudConfig();
  client = config
    ? createClient(config.url, config.publicKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // implicit deja abrir el enlace del correo en otro navegador o en el teléfono
          flowType: 'implicit',
        },
      })
    : null;
  return client;
}

export const cloudConfigured = () => readCloudConfig() !== null;
