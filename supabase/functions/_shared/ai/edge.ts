// Arma las dos Edge Functions de IA a partir de sus variables ya validadas (B12, 1.5 y 2.10). Los
// index.ts solo leen el entorno de Deno y llaman aquí, así lo que se despliega es lo mismo que se
// prueba con Vitest, con el Supabase y el Anthropic simulados en lugar de fetch y del SDK.
//   ai-proxy  sesión con ai_whoami, libro v2, cola, compuerta y configuración por la API REST
//   ai-batch  el ciclo de lotes, solo con el secreto de Vault que manda pg_cron
import { createSdkBatchApi, mockBatchResolver, SimulatedBatchApi } from './batchApi.ts';
import type { AnthropicClients } from './anthropic.ts';
import type { AiConfig } from './config.ts';
import { createAiProxyApp } from './app.ts';
import { createSupabaseWhoAmI, identifyWith } from './auth.ts';
import { cachedConfig, createRestConfigStore } from './configStore.ts';
import { ACADEMIC_SOURCE_KEYS } from './engines/academicSources.ts';
import type { AiBatchEnv, AiProxyEnv } from './env.ts';
import { cachedGateReader, createRestGateReader } from './gate.ts';
import { createAiBatchHandler, runBatchTick } from './jobs.ts';
import { createRestJobStore } from './jobStore.ts';
import { PgLedger } from './pgLedger.ts';
import { LOG_CODE, type BatchApi, type Clock, type Log } from './ports.ts';
import { bundledPromptSets, type PromptSets } from './prompts.ts';
import { createAnthropicProvider, createMockProvider, type AiProvider } from './provider.ts';
import { createRestRpc } from './rest.ts';
import type { AiRoutesDeps } from './routes.ts';

/** Lo que las funciones toman del mundo. En Deno, fetch, el SDK y el reloj del sistema */
export interface EdgeIo {
  fetch: typeof fetch;
  anthropic: (apiKey: string) => AnthropicClients;
  clock: Clock;
  log: Log;
}

/** La configuración y la compuerta se recuerdan 60 s en cada copia de la función (5.6) */
export const EDGE_CACHE_MS = 60_000;

/**
 * El registro de las funciones. Una línea JSON con un código y números, nunca texto de una petición,
 * un token, un cuerpo ni un error del SDK (2.5). Un código que no cumple la forma no se escribe
 */
export function structuredLog(write: (line: string) => void): Log {
  return (code, values = {}) => {
    if (!LOG_CODE.test(code)) return;
    const numbers = Object.fromEntries(
      Object.entries(values).filter(
        ([, value]) => typeof value === 'number' && Number.isFinite(value),
      ),
    );
    write(JSON.stringify({ code, ...numbers }));
  };
}

interface Pieces {
  provider: AiProvider | null;
  batches: BatchApi | null;
  prompts: PromptSets;
}

/** Con clave, el SDK. Sin clave y con AI_ALLOW_MOCK, lo simulado. Sin ninguno, nada (2.9) */
function providerPieces(env: AiProxyEnv | AiBatchEnv, io: EdgeIo, config: () => AiConfig): Pieces {
  const prompts = bundledPromptSets();
  if (env.anthropicKey) {
    const clients = io.anthropic(env.anthropicKey);
    return {
      prompts,
      provider: createAnthropicProvider(clients.messages, () => config().limits),
      batches: createSdkBatchApi(clients.batches),
    };
  }
  if (env.allowMock) {
    return {
      prompts,
      provider: createMockProvider(),
      // Cada copia de la función tiene su memoria. Un lote simulado de otra copia termina sin
      // resultados y sus trabajos vuelven a la cola
      batches: new SimulatedBatchApi({ resolve: mockBatchResolver(prompts), unknownAsEnded: true }),
    };
  }
  return { prompts, provider: null, batches: null };
}

function restPieces(env: AiProxyEnv | AiBatchEnv, io: EdgeIo) {
  const rpc = createRestRpc({
    url: env.supabaseUrl,
    serviceKey: env.serviceKey,
    fetchImpl: io.fetch,
  });
  const configStore = createRestConfigStore({
    url: env.supabaseUrl,
    serviceKey: env.serviceKey,
    fetchImpl: io.fetch,
    log: io.log,
  });
  return {
    rpc,
    configStore,
    config: cachedConfig(configStore, EDGE_CACHE_MS, io.clock),
    ledger: new PgLedger(rpc),
    jobs: createRestJobStore(rpc),
    gate: cachedGateReader(
      createRestGateReader({
        url: env.supabaseUrl,
        serviceKey: env.serviceKey,
        fetchImpl: io.fetch,
      }),
      EDGE_CACHE_MS,
      io.clock,
    ),
  };
}

/** La función ai-proxy */
export function buildAiProxy(env: AiProxyEnv, io: EdgeIo) {
  const rest = restPieces(env, io);
  const pieces = providerPieces(env, io, rest.config.get);
  const deps: AiRoutesDeps = {
    provider: pieces.provider,
    prompts: pieces.prompts,
    config: rest.config.get,
    setConfig: rest.config.set,
    saveConfig: (next) => rest.configStore.save(next),
    refreshConfig: rest.config.refresh,
    ledger: rest.ledger,
    jobs: rest.jobs,
    gate: rest.gate,
    identify: identifyWith(
      createSupabaseWhoAmI({
        url: env.supabaseUrl,
        anonKey: env.anonKey,
        fetchImpl: io.fetch,
        clock: io.clock,
      }),
    ),
    sourceKeys: new Set<string>(ACADEMIC_SOURCE_KEYS),
    clock: io.clock,
    log: io.log,
  };
  return { app: createAiProxyApp({ ai: deps, origins: env.origins, log: io.log }), deps };
}

/** La función ai-batch */
export function buildAiBatch(
  env: AiBatchEnv,
  io: EdgeIo & { waitUntil: (work: Promise<unknown>) => void },
) {
  const rest = restPieces(env, io);
  const pieces = providerPieces(env, io, rest.config.get);
  const provider = pieces.provider;
  const batches = pieces.batches;
  return createAiBatchHandler({
    tickOk: async (candidate) =>
      (await rest.rpc('ai_tick_secret_ok', { p_candidate: candidate })) === true,
    tick: async () => {
      if (!provider || !batches) {
        // Sin clave ni modo simulado no hay con qué mandar lotes
        io.log('ai.batch.not_configured');
        return {
          took: false,
          sent: 0,
          ready: 0,
          failed: 0,
          requeued: 0,
          processedBatches: 0,
          scrubbed: 0,
          errors: 0,
        };
      }
      await rest.config.refresh();
      return runBatchTick({
        jobs: rest.jobs,
        batches,
        ledger: rest.ledger,
        gate: rest.gate,
        config: rest.config.get,
        prompts: pieces.prompts,
        sourceKeys: new Set<string>(ACADEMIC_SOURCE_KEYS),
        mode: provider.mode,
        clock: io.clock,
        log: io.log,
        deadlineMs: env.tickDeadlineMs,
      });
    },
    waitUntil: io.waitUntil,
    log: io.log,
  });
}

/** Una función con variables que faltan o están mal. Contesta 503 y deja en el registro el motivo */
export function misconfigured(problems: readonly string[], log: Log) {
  log('ai.env.invalid', { problems: problems.length });
  return () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: 'not_configured' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      }),
    );
}
