// La configuración de la IA del proxy de desarrollo en un archivo local (8.1, B12 1.2 del plan). Los
// cambios de la pantalla de configuración del admin se guardan en server/ai-config.local.json, que
// queda fuera de git. El esquema, los valores de fábrica y la mezcla viven en el núcleo.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AiConfigPatchSchema,
  DEFAULT_CONFIG,
  mergeConfig,
  type AiConfig,
} from '../../../supabase/functions/_shared/ai/config.ts';

/** Carga los cambios guardados en el archivo local. Si no hay archivo o está dañado, usa los de fábrica */
export function loadAiConfig(file: string | null): AiConfig {
  if (file === null || !existsSync(file)) return DEFAULT_CONFIG;
  try {
    const patch = AiConfigPatchSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    return mergeConfig(DEFAULT_CONFIG, patch);
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Guarda la configuración completa en el archivo local, sin dejar un archivo a medias */
export function saveAiConfig(file: string, config: AiConfig): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(temp, file);
}
