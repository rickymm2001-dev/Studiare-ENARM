// La configuración de los motores en la tabla ai_config de Supabase (D-103 y B12, 1.5). La lee y la
// escribe solo la Edge Function, con la llave de servicio. Cada copia de la función la recuerda 60 s,
// así un cambio de la pantalla 25 llega a todas en un minuto sin leer la tabla en cada llamada.
import {
  AiConfigPatchSchema,
  configProblem,
  DEFAULT_CONFIG,
  mergeConfig,
  type AiConfig,
} from './config.ts';
import type { Clock, ConfigStore, Log } from './ports.ts';

/** Una fila guardada a mano que no se entiende o que rompe las reglas de un modelo no frena la función */
export function configFromRow(value: unknown, log: Log = () => undefined): AiConfig {
  try {
    const merged = mergeConfig(DEFAULT_CONFIG, AiConfigPatchSchema.parse(value));
    if (configProblem(merged) === null) return merged;
  } catch {
    // Cae a la de fábrica
  }
  log('ai.config.invalid');
  return DEFAULT_CONFIG;
}

export function createRestConfigStore(options: {
  url: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
  log?: Log;
}): ConfigStore {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    apikey: options.serviceKey,
    authorization: `Bearer ${options.serviceKey}`,
    'content-type': 'application/json',
  };
  return {
    async load() {
      const response = await fetchImpl(`${options.url}/rest/v1/ai_config?select=value&limit=1`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`No se pudo leer ai_config, contestó ${String(response.status)}`);
      }
      const rows = (await response.json()) as { value?: unknown }[];
      if (rows.length === 0) return DEFAULT_CONFIG;
      return configFromRow(rows[0]?.value, options.log);
    },
    async save(config) {
      const response = await fetchImpl(`${options.url}/rest/v1/ai_config?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: true, value: config, updated_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`No se pudo guardar ai_config, contestó ${String(response.status)}`);
      }
    },
  };
}

export interface CachedConfig {
  get: () => AiConfig;
  set: (next: AiConfig) => void;
  /**
   * Vuelve a leer si ya pasaron ttlMs. Si la lectura falla se queda con la que tenía. Si nunca pudo
   * leerla falla, porque no se atiende a ciegas con otros límites
   */
  refresh: () => Promise<void>;
}

export function cachedConfig(store: ConfigStore, ttlMs: number, clock: Clock): CachedConfig {
  let current: AiConfig | null = null;
  let until = 0;
  return {
    get: () => current ?? DEFAULT_CONFIG,
    set: (next) => {
      current = next;
      until = clock() + ttlMs;
    },
    refresh: async () => {
      if (current !== null && until > clock()) return;
      try {
        current = await store.load();
      } catch (error) {
        // Con una ya leída se sigue con ella y se vuelve a intentar en la siguiente petición
        if (current !== null) return;
        throw error;
      }
      until = clock() + ttlMs;
    },
  };
}
