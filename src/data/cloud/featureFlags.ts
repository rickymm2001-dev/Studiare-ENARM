// Banderas de lanzamiento en el servidor (D-119). Viven en platform_settings, clave feature_flags.
// Todos la leen, incluso sin sesión, y solo el admin la escribe, por el permiso por fila de la
// tabla (D-105). Así prender o esconder una función vale para todos los alumnos sin volver a
// publicar la app. Cada navegador guarda una copia en localStorage, que es la que se lee al abrir.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FEATURE_FLAG_NAMES,
  StoredFlagsSchema,
  readStoredFlags,
  writeStoredFlags,
  type StoredFlags,
} from '../../config/featureFlags.ts';

export const FLAGS_SETTING_KEY = 'feature_flags';

type Cloud = Pick<SupabaseClient, 'from'>;

export type RemoteFlags = { ok: true; flags: StoredFlags | null } | { ok: false };

/** Lo que hay en el servidor. null es que no hay cambios y valen los del entorno. Falla si no se pudo leer */
export async function fetchRemoteFlags(cloud: Cloud): Promise<RemoteFlags> {
  try {
    const { data, error } = await cloud
      .from('platform_settings')
      .select('value')
      .eq('key', FLAGS_SETTING_KEY)
      .maybeSingle();
    if (error) return { ok: false };
    const row = data as { value?: unknown } | null;
    if (row === null) return { ok: true, flags: null };
    const parsed = StoredFlagsSchema.safeParse(row.value);
    // Un valor que no cumple el formato se ignora completo, igual que uno guardado en el navegador
    return { ok: true, flags: parsed.success ? parsed.data : null };
  } catch {
    return { ok: false };
  }
}

/** Guarda en el servidor. null borra la clave y deja los valores del entorno. Solo el admin puede */
export async function saveRemoteFlags(cloud: Cloud, flags: StoredFlags | null): Promise<boolean> {
  try {
    const table = cloud.from('platform_settings');
    const { error } =
      flags === null
        ? await table.delete().eq('key', FLAGS_SETTING_KEY)
        : await table.upsert({
            key: FLAGS_SETTING_KEY,
            value: StoredFlagsSchema.parse(flags),
            updated_at: new Date().toISOString(),
          });
    return !error;
  } catch {
    return false;
  }
}

/** Mismo contenido sin importar el orden de las claves ni las banderas sin valor */
function canonical(value: StoredFlags | null): string {
  return JSON.stringify(FEATURE_FLAG_NAMES.map((name) => [name, value?.[name] ?? null]));
}

export const sameFlags = (a: StoredFlags | null, b: StoredFlags | null) =>
  canonical(a) === canonical(b);

/**
 * Copia al navegador lo que dice el servidor. Si el servidor no tiene la clave, se borra la copia
 * local. Devuelve si la copia cambió, que es cuando la app todavía muestra lo de antes y hace falta
 * recargar para aplicarlo
 */
export async function mirrorRemoteFlags(cloud: Cloud): Promise<'changed' | 'same' | 'unavailable'> {
  const remote = await fetchRemoteFlags(cloud);
  if (!remote.ok) return 'unavailable';
  const local = readStoredFlags();
  if (sameFlags(local, remote.flags)) return 'same';
  return writeStoredFlags(remote.flags) ? 'changed' : 'unavailable';
}
