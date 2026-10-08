// Arma lo que necesitan las rutas de IA a partir de las credenciales. Con clave, el proveedor real
// del SDK oficial. Sin clave, el simulado. La clave solo se usa aquí, para crear el cliente, y
// nunca se imprime ni se guarda.
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'node:url';
import { ACADEMIC_SOURCE_KEYS } from '../../../src/config/academicSources.ts';
import type { AiCredentials } from '../env.ts';
import { loadAiConfig, type AiConfig } from './config.ts';
import { Ledger } from './ledger.ts';
import { loadPrompts } from './prompts.ts';
import { createAnthropicProvider, createMockProvider, type AiProvider } from './provider.ts';
import type { AiRoutesDeps } from './route.ts';

export const SERVER_PROMPTS_DIR = fileURLToPath(new URL('../../prompts', import.meta.url));
export const ROOT_PROMPTS_DIR = fileURLToPath(new URL('../../../prompts', import.meta.url));
export const CONFIG_FILE = fileURLToPath(new URL('../../ai-config.local.json', import.meta.url));
export const LEDGER_FILE = fileURLToPath(new URL('../../.ai-ledger.json', import.meta.url));

export function createAiDeps(options: {
  credentials: AiCredentials;
  /** Sin archivos, para las pruebas */
  files?: { config: string | null; ledger: string | null };
  provider?: (config: () => AiConfig) => AiProvider;
}): AiRoutesDeps {
  const files = options.files ?? { config: CONFIG_FILE, ledger: LEDGER_FILE };
  let config = loadAiConfig(files.config);
  const getConfig = () => config;

  let provider: AiProvider;
  if (options.provider) {
    provider = options.provider(getConfig);
  } else if (options.credentials.mode === 'real' && options.credentials.apiKey) {
    // La clave se pasa explícita para que el SDK no busque ninguna otra variable de entorno
    const client = new Anthropic({ apiKey: options.credentials.apiKey });
    provider = createAnthropicProvider(
      { create: (params, requestOptions) => client.messages.create(params, requestOptions) },
      () => getConfig().limits,
    );
  } else {
    provider = createMockProvider();
  }

  return {
    provider,
    prompts: loadPrompts({
      serverPromptsDir: SERVER_PROMPTS_DIR,
      rootPromptsDir: ROOT_PROMPTS_DIR,
    }),
    config: getConfig,
    setConfig: (next) => {
      config = next;
    },
    configFile: files.config,
    ledger: new Ledger({ file: files.ledger }),
    sourceKeys: new Set<string>(ACADEMIC_SOURCE_KEYS),
  };
}
