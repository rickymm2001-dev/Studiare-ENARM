// Credenciales de las evaluaciones (B12, 4.4 del plan). ENARM_ANTHROPIC_KEY y ENARM_OPENAI_KEY se
// leen de server/.env.local y, si no están ahí, del entorno del proceso, que es donde las pone una
// sesión en la nube. Nunca se imprimen, nunca se guardan y se borran del entorno al leerlas para que
// ningún proceso hijo las herede. Solo se informa si están y de dónde salieron. La clave de OpenAI
// solo existe aquí, para comparar calidad, y nunca llega a producción (respuesta 38).
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { KEY_VARIABLE } from '../src/config.ts';

export const ANTHROPIC_KEY_NAME = KEY_VARIABLE;
export const OPENAI_KEY_NAME = 'ENARM_OPENAI_KEY';

export type KeySource = 'file' | 'env';

export interface EvalCredentials {
  anthropicKey: string | null;
  openaiKey: string | null;
  /** De dónde salió cada una, para decirlo sin mostrar el valor */
  sources: { anthropic: KeySource | null; openai: KeySource | null };
}

function readFileValues(envFile: string): Record<string, string | undefined> {
  if (!existsSync(envFile)) return {};
  return parseEnv(readFileSync(envFile, 'utf8'));
}

/**
 * Lee las dos claves. El archivo manda sobre el entorno. Las del entorno se borran de env al
 * leerlas, así un proceso hijo no las hereda ni aparecen en un volcado posterior
 */
export function loadEvalCredentials(options: {
  envFile: string;
  env: Record<string, string | undefined>;
}): EvalCredentials {
  const file = readFileValues(options.envFile);
  const pick = (name: string): { value: string | null; source: KeySource | null } => {
    const fromFile = file[name]?.trim();
    const fromEnv = options.env[name]?.trim();
    // Delete en vez de asignar, porque en process.env asignar undefined deja el texto "undefined"
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- el nombre es una de las dos constantes de arriba
    delete options.env[name];
    if (fromFile) return { value: fromFile, source: 'file' };
    if (fromEnv) return { value: fromEnv, source: 'env' };
    return { value: null, source: null };
  };
  const anthropic = pick(ANTHROPIC_KEY_NAME);
  const openai = pick(OPENAI_KEY_NAME);
  return {
    anthropicKey: anthropic.value,
    openaiKey: openai.value,
    sources: { anthropic: anthropic.source, openai: openai.source },
  };
}

const SOURCE_TEXT: Readonly<Record<KeySource, string>> = {
  file: 'en server/.env.local',
  env: 'en el entorno de la sesión',
};

/** Una línea que dice qué claves hay y de dónde salieron. Nunca su valor ni una parte de él */
export function describeCredentials(credentials: EvalCredentials): string {
  const line = (name: string, source: KeySource | null) =>
    source ? `${name} está ${SOURCE_TEXT[source]}` : `${name} no está`;
  return `${line(ANTHROPIC_KEY_NAME, credentials.sources.anthropic)}. ${line(OPENAI_KEY_NAME, credentials.sources.openai)}.`;
}
