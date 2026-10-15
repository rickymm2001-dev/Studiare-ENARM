// Arma lo que necesitan las rutas de IA del proxy de desarrollo (B12, 1.1 y 1.5). El núcleo vive en
// supabase/functions/_shared/ai y lo comparte la Edge Function. Aquí solo se decide de dónde salen las
// piezas, que en desarrollo son locales. La configuración y el libro del día en archivos, la cola de
// lotes en memoria y la compuerta siempre abierta, con la IA simulada y su etiqueta (5.5). Sin sesión
// de Supabase, quien llama es el dueño local, así se prueban todos los motores y la cola del médico.
// Con clave, el proveedor real y los lotes reales del SDK oficial. Sin clave, los simulados. La clave
// solo se usa aquí, para crear el cliente, y nunca se imprime ni se guarda.
import { fileURLToPath } from 'node:url';
import { createAnthropicClients } from '../../../supabase/functions/_shared/ai/anthropic.ts';
import {
  createSdkBatchApi,
  mockBatchResolver,
  SimulatedBatchApi,
} from '../../../supabase/functions/_shared/ai/batchApi.ts';
import type { AiConfig } from '../../../supabase/functions/_shared/ai/config.ts';
import { ACADEMIC_SOURCE_KEYS } from '../../../supabase/functions/_shared/ai/engines/academicSources.ts';
import { alwaysOpenGate } from '../../../supabase/functions/_shared/ai/gate.ts';
import { runBatchTick, type TickReport } from '../../../supabase/functions/_shared/ai/jobs.ts';
import type { AiCaller, BatchApi } from '../../../supabase/functions/_shared/ai/ports.ts';
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
import { MemoryJobStore } from '../../../supabase/functions/_shared/ai/testing/memory.ts';
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

/** Quien usa el proxy de desarrollo. Un id seudónimo fijo, sin nombre ni correo */
export const DEV_CALLER: AiCaller = {
  userId: '00000000-0000-4000-8000-00000000de00',
  role: 'owner',
  paid: true,
};

/** Los prompts de cada motor leídos de sus archivos. Falla de entrada si falta el de un motor */
export function loadPrompts(dirs: PromptDirs): PromptSets {
  return buildPromptSets(readPromptSources(dirs));
}

export interface DevAiDeps extends AiRoutesDeps {
  provider: AiProvider;
  jobs: MemoryJobStore;
  batches: BatchApi;
  /** Un ciclo de lotes, como el que pg_cron dispara en la nube */
  tick(): Promise<TickReport>;
}

export function createAiDeps(options: {
  credentials: AiCredentials;
  /** Sin archivos, para las pruebas */
  files?: { config: string | null; ledger: string | null };
  provider?: (config: () => AiConfig) => AiProvider;
  /** Otra cuenta en lugar del dueño local, para probar permisos */
  caller?: AiCaller;
}): DevAiDeps {
  const files = options.files ?? { config: CONFIG_FILE, ledger: LEDGER_FILE };
  let config = loadAiConfig(files.config);
  const getConfig = () => config;
  const prompts = loadPrompts({
    serverPromptsDir: SERVER_PROMPTS_DIR,
    rootPromptsDir: ROOT_PROMPTS_DIR,
  });

  const clients =
    options.credentials.mode === 'real' && options.credentials.apiKey
      ? createAnthropicClients(options.credentials.apiKey)
      : null;
  let provider: AiProvider;
  if (options.provider) provider = options.provider(getConfig);
  else if (clients) provider = createAnthropicProvider(clients.messages, () => getConfig().limits);
  else provider = createMockProvider();
  const real = provider.mode === 'real';
  const batches: BatchApi =
    real && clients
      ? createSdkBatchApi(clients.batches)
      : new SimulatedBatchApi({ resolve: mockBatchResolver(prompts) });

  const jobs = new MemoryJobStore();
  const ledger = createLedger({ file: files.ledger, pendingJobs: () => jobs.pendingInfo() });
  jobs.attachSettle((settlement) => ledger.settle(settlement));
  const gate = alwaysOpenGate(getConfig, prompts);
  const caller = options.caller ?? DEV_CALLER;
  const sourceKeys = new Set<string>(ACADEMIC_SOURCE_KEYS);

  const configFile = files.config;
  return {
    provider,
    prompts,
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
    ledger,
    jobs,
    gate,
    batches,
    identify: () => Promise.resolve({ ok: true, caller }),
    sourceKeys,
    tick: () =>
      runBatchTick({
        jobs,
        batches,
        ledger,
        gate,
        config: getConfig,
        prompts,
        sourceKeys,
        mode: real ? 'real' : 'mock',
        clock: () => Date.now(),
        log: () => undefined,
        deadlineMs: 50_000,
        pollMinutes: 0,
      }),
  };
}

/**
 * El reloj de lotes del proxy de desarrollo (3.4). Cada 60 s con clave, que manda lotes reales a
 * mitad de precio, y cada 2 s en modo simulado, donde un lote termina en el ciclo siguiente
 */
export function startDevBatchLoop(deps: DevAiDeps): () => void {
  const every = deps.provider.mode === 'real' ? 60_000 : 2_000;
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    deps
      .tick()
      .catch(() => {
        console.error('El ciclo de lotes de IA falló');
      })
      .finally(() => {
        running = false;
      });
  }, every);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
