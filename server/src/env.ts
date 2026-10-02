// Lee la clave de IA de server/.env.local sin pasarla por process.env.
// Así no la heredan procesos hijos ni aparece en volcados del entorno. Nunca se imprime.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { KEY_VARIABLE } from './config.ts';

export type AiMode = 'real' | 'mock';

export interface AiCredentials {
  mode: AiMode;
  /** null en modo simulado. Solo la usará el cliente de Anthropic de la Fase D */
  apiKey: string | null;
}

export function loadAiCredentials(options: {
  envFile: string;
  forceMock?: boolean;
}): AiCredentials {
  if (options.forceMock) return { mode: 'mock', apiKey: null };
  if (!existsSync(options.envFile)) return { mode: 'mock', apiKey: null };
  const values = parseEnv(readFileSync(options.envFile, 'utf8'));
  const key = values[KEY_VARIABLE]?.trim();
  return key ? { mode: 'real', apiKey: key } : { mode: 'mock', apiKey: null };
}
