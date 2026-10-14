// Arma lo que necesitan las rutas de IA del proxy de desarrollo a partir de las credenciales. El
// núcleo vive en supabase/functions/_shared/ai y lo comparte la Edge Function (B12, 1.1). Aquí solo
// se decide de dónde salen la configuración, el libro del día y los prompts, que en desarrollo son
// archivos locales. Con clave, el proveedor real del SDK oficial. Sin clave, el simulado. La clave
// solo se usa aquí, para crear el cliente, y nunca se imprime ni se guarda.
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'node:url';
import type { AiConfig } from '../../../supabase/functions/_shared/ai/config.ts';
import { ACADEMIC_SOURCE_KEYS } from '../../../supabase/functions/_shared/ai/engines/academicSources.ts';
import {
  buildPromptSets,
  type PromptSets,
} from '../../../supabase/functions/_shared/ai/prompts.ts';
import {
  createAnthropicProvider,
  createMockProvider,
  type AiProvider,
} from '../../../supabase/functions/_shared/ai/provider.ts';
import type { AiRoutesDeps } from '../../../supabase/functions/_shared/ai/routes.ts';
import type { AiCredentials } from '../env.ts';
import { loadAiConfig, saveAiConfig } from './configFile.ts';
import { createLedger } from './ledgerFile.ts';
import {
  readPromptSources,
  ROOT_PROMPTS_DIR,
  SERVER_PROMPTS_DIR,
  type PromptDirs,
} from './promptFiles.ts';

export { ROOT_PROMPTS_DIR, SERVER_PROMPTS_DIR };
export const CONFIG_FILE = fileURLToPath(new URL('../../ai-config.local.json', import.meta.url));
export const LEDGER_FILE = fileURLToPath(new URL('../../.ai-ledger.json', import.meta.url));

/** Los prompts de cada motor leídos de sus archivos. Falla de entrada si falta el de un motor */
export function loadPrompts(dirs: PromptDirs): PromptSets {
  return buildPromptSets(readPromptSources(dirs));
}

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

  const configFile = files.config;
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
    ...(configFile === null
      ? {}
      : {
          saveConfig: (next: AiConfig) => {
            saveAiConfig(configFile, next);
          },
        }),
    ledger: createLedger({ file: files.ledger }),
    sourceKeys: new Set<string>(ACADEMIC_SOURCE_KEYS),
  };
}
