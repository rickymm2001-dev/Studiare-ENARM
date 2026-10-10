// Configuración de la plataforma en el servidor (Fase G, G3). Los umbrales, los pesos del ENARM y la
// estimación de costo que el admin cambia en la pantalla 25 viven en platform_settings, en la clave
// admin_overrides. Todos la leen, incluso sin sesión, y solo el admin la escribe, por el permiso por
// fila. Así un cambio vale para todos los alumnos y no solo para el navegador de quien lo hizo.
// Cada navegador guarda una copia en localStorage, que es la que leen los motores al abrir la app.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  StoredOverridesSchema,
  readStoredOverrides,
  writeStoredOverrides,
  type StoredOverrides,
} from '../../config/overridesStore.ts';

export const OVERRIDES_SETTING_KEY = 'admin_overrides';

type Cloud = Pick<SupabaseClient, 'from'>;

export type RemoteOverrides = { ok: true; overrides: StoredOverrides | null } | { ok: false };

/** Lo que hay en el servidor. null es que no hay cambios y todo va de fábrica. Falla si no se pudo leer */
export async function fetchRemoteOverrides(cloud: Cloud): Promise<RemoteOverrides> {
  try {
    const { data, error } = await cloud
      .from('platform_settings')
      .select('value')
      .eq('key', OVERRIDES_SETTING_KEY)
      .maybeSingle();
    if (error) return { ok: false };
    const row = data as { value?: unknown } | null;
    if (row === null) return { ok: true, overrides: null };
    const parsed = StoredOverridesSchema.safeParse(row.value);
    // Un valor que no cumple el formato se ignora completo, igual que uno guardado en el navegador
    return { ok: true, overrides: parsed.success ? parsed.data : null };
  } catch {
    return { ok: false };
  }
}

/** Guarda en el servidor. null borra los cambios y deja todo de fábrica. Solo el admin puede */
export async function saveRemoteOverrides(
  cloud: Cloud,
  overrides: StoredOverrides | null,
): Promise<boolean> {
  try {
    const table = cloud.from('platform_settings');
    const { error } =
      overrides === null
        ? await table.delete().eq('key', OVERRIDES_SETTING_KEY)
        : await table.upsert({
            key: OVERRIDES_SETTING_KEY,
            value: StoredOverridesSchema.parse(overrides),
            updated_at: new Date().toISOString(),
          });
    return !error;
  } catch {
    return false;
  }
}

/** Mismo contenido sin importar el orden de las claves */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sameOverrides = (a: StoredOverrides | null, b: StoredOverrides | null) =>
  canonical(a ?? {}) === canonical(b ?? {});

/**
 * Copia al navegador lo que dice el servidor. Con la sesión de la nube abierta, el servidor manda:
 * si no tiene cambios, se borran los locales. Devuelve si la copia cambió, que es cuando los motores
 * todavía tienen los valores de antes y hace falta recargar para aplicarlos
 */
export async function mirrorRemoteOverrides(
  cloud: Cloud,
): Promise<'changed' | 'same' | 'unavailable'> {
  const remote = await fetchRemoteOverrides(cloud);
  if (!remote.ok) return 'unavailable';
  const local = readStoredOverrides();
  if (sameOverrides(local, remote.overrides)) return 'same';
  return writeStoredOverrides(remote.overrides) ? 'changed' : 'unavailable';
}
