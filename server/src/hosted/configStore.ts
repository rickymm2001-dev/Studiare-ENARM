// Guarda la configuración de los motores de IA en la tabla ai_config de Supabase (D-103). En un
// alojamiento sin disco duradero, un archivo local se perdería al reiniciar. La tabla solo la lee y
// la escribe el servidor del proxy, con la llave de servicio.
import { AiConfigPatchSchema, DEFAULT_CONFIG, mergeConfig, type AiConfig } from '../ai/config.ts';

export interface ConfigStore {
  load(): Promise<AiConfig>;
  save(config: AiConfig): Promise<void>;
}

export function createRestConfigStore(options: {
  url: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
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
      if (!response.ok)
        throw new Error(`No se pudo leer ai_config, contestó ${String(response.status)}`);
      const rows = (await response.json()) as { value?: unknown }[];
      if (rows.length === 0) return DEFAULT_CONFIG;
      try {
        return mergeConfig(DEFAULT_CONFIG, AiConfigPatchSchema.parse(rows[0]?.value));
      } catch {
        // Una configuración dañada no frena el proxy. Arranca con la de fábrica y lo dice
        console.error('La configuración guardada de la IA no es válida. Se usa la de fábrica');
        return DEFAULT_CONFIG;
      }
    },
    async save(config) {
      const response = await fetchImpl(`${options.url}/rest/v1/ai_config?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: true, value: config, updated_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`No se pudo guardar ai_config, contestó ${String(response.status)}`);
    },
  };
}
