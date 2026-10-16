// La Edge Function ai-proxy dentro del proceso de Playwright (B12, 7.5). Corre el núcleo real, el mismo
// que se despliega (supabase/functions/_shared/ai), con los dobles del paquete A en memoria. Libro del
// día, cola de lotes, Anthropic simulado, la compuerta y la sesión, que sale de las cuentas, los planes
// y los dispositivos del Supabase simulado. Así lo que prueba la e2e de nube es el contrato de verdad,
// con CORS, token, plan, dispositivo, compuerta, límites y presupuesto, y no una copia de él.
//
// Tres modos, como la función. real contesta con el Anthropic simulado, que redacta la respuesta fija de
// cada motor y la cobra con los precios de la configuración. mock es la función sin clave y con
// AI_ALLOW_MOCK. unavailable es la función sin clave ni permiso, que contesta not_configured.
//
// La compuerta es la bandera ai_gate de platform_settings, la misma que escriben las funciones
// admin_ai_gate_* que atiende src/data/testing/fakeAiGateServer.ts (el doble de las pruebas unitarias),
// así abrir un motor desde la pantalla Auditoría de la IA cambia lo que dice /health. Los helpers de la
// prueba hacen lo que haría el servidor en producción. Abrir y cerrar motores, pausar, fijar el gasto del
// día, correr el ciclo de lotes y armar una muestra auditada con el modelo y el prompt de hoy.
import type { Route } from '@playwright/test';
import { createAiProxyApp } from '../../../supabase/functions/_shared/ai/app.ts';
import { identifyWith } from '../../../supabase/functions/_shared/ai/auth.ts';
import { mockBatchResolver } from '../../../supabase/functions/_shared/ai/batchApi.ts';
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type AiConfig,
  type AiConfigPatch,
} from '../../../supabase/functions/_shared/ai/config.ts';
import { ACADEMIC_SOURCE_KEYS } from '../../../supabase/functions/_shared/ai/engines/academicSources.ts';
import {
  AI_ENGINES,
  type AiEngine,
  type AiGateState,
} from '../../../supabase/functions/_shared/ai/engines/aiContracts.ts';
import { currentAudits } from '../../../supabase/functions/_shared/ai/gate.ts';
import { runBatchTick, type TickReport } from '../../../supabase/functions/_shared/ai/jobs.ts';
import { dayKey } from '../../../supabase/functions/_shared/ai/ledger.ts';
import type { GateReader, WhoAmIResult } from '../../../supabase/functions/_shared/ai/ports.ts';
import { bundledPromptSets } from '../../../supabase/functions/_shared/ai/prompts.ts';
import {
  createAnthropicProvider,
  createMockProvider,
  type AiProvider,
  type MessagesApi,
} from '../../../supabase/functions/_shared/ai/provider.ts';
import type { AiRoutesDeps } from '../../../supabase/functions/_shared/ai/routes.ts';
import { createFakeAnthropic } from '../../../supabase/functions/_shared/ai/testing/fakeAnthropic.ts';
import { createMemoryAi } from '../../../supabase/functions/_shared/ai/testing/memory.ts';
import { createFakeAiGateServer, type FakeAiGateServer } from '@/data/testing/fakeAiGateServer';
import { gateSampleFile } from '@/data/testing/gateSample';
import type { AiGateSampleFile } from '@/engines/aiContracts';
import { CLOUD_PREVIEW_URL } from './fakeSupabaseConfig';

export type FakeAiMode = 'real' | 'mock' | 'unavailable';

/** Cómo el Supabase simulado le dice a la función quién llama y de qué rol es cada cuenta */
export interface FakeAiIdentity {
  /** ai_whoami con el token de la sesión: la cuenta, su rol, su plan y su dispositivo */
  whoAmI(token: string): WhoAmIResult;
  /** El rol de una cuenta, para los reportes de costo que separan a los alumnos */
  roleOf(userId: string): string | undefined;
  /** Cuántos alumnos tienen hoy un plan de pago */
  paidStudents(): number;
}

export interface FakeAiOptions {
  identity: FakeAiIdentity;
  /** real por omisión, con el Anthropic simulado */
  mode?: FakeAiMode;
  /** El origen de la app que la función deja pasar. El de la vista previa de nube por omisión */
  origin?: string;
  /** Reloj en milisegundos. El del sistema por omisión */
  clock?: () => number;
}

/** Una petición que atendió la función, sin cuerpo ni token */
export interface AiProxyCall {
  method: string;
  /** Ruta dentro de la función, como /ai/forgetting o /health */
  path: string;
  status: number;
  /** El motor, si la ruta es de un motor o de un trabajo */
  engine: AiEngine | null;
}

export interface FakeAi {
  readonly origin: string;
  readonly mode: FakeAiMode;
  /** La compuerta (platform_settings.ai_gate) y sus funciones admin_ai_gate_*, ai_gate_* */
  readonly gate: FakeAiGateServer;
  /** El libro, la cola de trabajos y la configuración en memoria */
  readonly memory: ReturnType<typeof createMemoryAi>;
  readonly anthropic: ReturnType<typeof createFakeAnthropic>;
  /** Las llamadas que atendió, para contarlas desde la prueba */
  readonly calls: readonly AiProxyCall[];
  /** Las llamadas a un motor (al momento o por lote), sin /health ni el estado de los trabajos */
  engineCalls(): AiProxyCall[];
  /** Atiende una petición como lo haría Supabase con /functions/v1/ai-proxy/** */
  handle(request: Request): Promise<Response>;
  /** Cambia el modo, como poner o quitar la clave y AI_ALLOW_MOCK */
  setMode(mode: FakeAiMode): void;
  /** Abre estos motores para alumnos con el modelo y el prompt de hoy, como una auditoría aprobada */
  openEngines(...engines: AiEngine[]): Promise<void>;
  closeEngines(...engines: AiEngine[]): void;
  /** La pausa de admin_ai_pause */
  pause(paused: boolean): void;
  /** Deja el gasto de hoy en este monto de dólares, para probar el presupuesto */
  setSpentToday(usd: number): Promise<void>;
  /** Cambia los límites y los modelos, como PUT /ai/config */
  configure(patch: AiConfigPatch): void;
  readonly config: AiConfig;
  /**
   * Un ciclo de lotes completo como el de pg_cron. El primer paso manda a Anthropic lo que espera, el
   * lote termina allá y el segundo recoge los resultados. Devuelve el reporte de cada paso
   */
  runBatchCycle(): Promise<[TickReport, TickReport]>;
  /** Una muestra de la compuerta con el modelo y el prompt que usa hoy cada motor, lista para importar */
  sampleFile(id: string, perEngine: Partial<Record<AiEngine, number>>): Promise<AiGateSampleFile>;
  /** admin_ai_cost_report, calculado del libro de la corrida */
  costReport(from: string, to: string): unknown;
  /** Los trabajos de la cola, por motor y estado */
  jobsOf(userId: string): { engine: string; status: string; jobKey: string }[];
}

/** El motor de una ruta como /ai/forgetting o /ai/jobs/forgetting. /ai/jobs/status y /ai/config no lo son */
const engineOf = (path: string): AiEngine | null => {
  const name = /^\/ai\/(?:jobs\/)?([a-z_]+)$/.exec(path)?.[1];
  return AI_ENGINES.find((engine) => engine === name) ?? null;
};

/** El percentil continuo de una lista, como percentile_cont */
function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const low = sorted[below] ?? 0;
  const high = sorted[above] ?? low;
  return low + (high - low) * (position - below);
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export function createFakeAi(options: FakeAiOptions): FakeAi {
  const clock = options.clock ?? (() => Date.now());
  const origin = options.origin ?? CLOUD_PREVIEW_URL;
  const prompts = bundledPromptSets();
  const memory = createMemoryAi({ clock });
  const anthropic = createFakeAnthropic({ prompts });
  const calls: AiProxyCall[] = [];
  let config: AiConfig = structuredClone(DEFAULT_CONFIG);

  const gate = createFakeAiGateServer({
    now: () => new Date(clock()).toISOString(),
    roleOf: (userId) => options.identity.roleOf(userId),
  });
  const gateReader: GateReader = { read: () => Promise.resolve(structuredClone(gate.state)) };

  // Anthropic simulado al momento. Contesta con la respuesta fija del motor que reconoce por su prompt
  const resolve = mockBatchResolver(prompts);
  const messages: MessagesApi = {
    create(params) {
      const result = resolve({ custom_id: 'al-momento', params });
      if (result.type !== 'succeeded') return Promise.reject(new Error('Petición no reconocida'));
      return Promise.resolve({ ...result.message, model: params.model });
    },
  };
  const providers: Record<FakeAiMode, AiProvider | null> = {
    real: createAnthropicProvider(messages, () => config.limits),
    mock: createMockProvider(),
    unavailable: null,
  };

  let mode: FakeAiMode = options.mode ?? 'real';
  const deps: AiRoutesDeps = {
    provider: providers[mode],
    prompts,
    config: () => config,
    setConfig: (next) => {
      config = next;
    },
    ledger: memory.ledger,
    jobs: memory.jobs,
    gate: gateReader,
    identify: identifyWith((token) => Promise.resolve(options.identity.whoAmI(token))),
    sourceKeys: new Set<string>(ACADEMIC_SOURCE_KEYS),
    clock,
  };
  const app = createAiProxyApp({ ai: deps, origins: new Set([origin]) });

  const audits = () => currentAudits(config, prompts);

  const fake: FakeAi = {
    origin,
    get mode() {
      return mode;
    },
    gate,
    memory,
    anthropic,
    calls,
    get config() {
      return config;
    },
    engineCalls: () => calls.filter((call) => call.engine !== null),
    async handle(request) {
      const url = new URL(request.url);
      const response = await app.fetch(request);
      const path = url.pathname.replace(/^\/ai-proxy/, '') || '/';
      calls.push({
        method: request.method,
        path,
        status: response.status,
        engine: request.method === 'POST' ? engineOf(path) : null,
      });
      return response;
    },
    setMode(next) {
      mode = next;
      deps.provider = providers[next];
    },
    async openEngines(...engines) {
      const current = await audits();
      const at = new Date(clock()).toISOString();
      const next: AiGateState = structuredClone(gate.state);
      for (const engine of engines) {
        next.engines[engine] = { open: true, ...current[engine], sampleId: 'prueba', at };
      }
      gate.setState(next);
    },
    closeEngines(...engines) {
      const next: AiGateState = structuredClone(gate.state);
      for (const engine of engines) {
        const found = next.engines[engine];
        if (found) found.open = false;
      }
      gate.setState(next);
    },
    pause(paused) {
      gate.setState({ ...structuredClone(gate.state), paused });
    },
    async setSpentToday(usd) {
      const spent = (await memory.ledger.summary()).spentUsd;
      if (usd <= spent) return;
      await memory.ledger.settle({
        userId: null,
        engine: 'forgetting',
        model: config.models.forgetting.id,
        real: true,
        ok: true,
        costUsd: usd - spent,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 0,
        mode: 'sync',
        outcome: 'ok',
        promptVersion: null,
        refusalCategory: null,
        jobId: null,
      });
    },
    configure(patch) {
      config = mergeConfig(config, patch);
    },
    async runBatchCycle() {
      const provider = providers[mode];
      if (!provider) throw new Error('Sin IA no hay ciclo de lotes');
      const tick = () =>
        runBatchTick({
          jobs: memory.jobs,
          batches: anthropic.batches,
          ledger: memory.ledger,
          gate: gateReader,
          config: () => config,
          prompts,
          sourceKeys: deps.sourceKeys,
          mode: provider.mode,
          clock,
          log: () => undefined,
          deadlineMs: 30_000,
          pollMinutes: 0,
        });
      const sent = await tick();
      anthropic.batches.endAll();
      const collected = await tick();
      return [sent, collected];
    },
    async sampleFile(id, perEngine) {
      const current = await audits();
      const base = gateSampleFile(id, perEngine);
      return {
        ...base,
        items: base.items.map((item) => {
          const audit = current[item.engine];
          return {
            ...item,
            model: audit.model,
            effort: audit.effort,
            thinking: audit.thinking,
            promptVersion: audit.promptVersion,
            promptHash: audit.promptHash,
          };
        }),
      };
    },
    costReport(from, to) {
      const inRange = memory.ledger.log.filter((entry) => {
        const day = dayKey(new Date(entry.at));
        return day >= from && day <= to;
      });
      const grouped = (key: (entry: (typeof inRange)[number]) => string) => {
        const totals: Record<string, { calls: number; costUsd: number }> = {};
        for (const entry of inRange) {
          const name = key(entry);
          const found = totals[name] ?? { calls: 0, costUsd: 0 };
          totals[name] = { calls: found.calls + 1, costUsd: round6(found.costUsd + entry.costUsd) };
        }
        return totals;
      };
      const outcomes: Record<string, number> = {};
      for (const entry of inRange) outcomes[entry.outcome] = (outcomes[entry.outcome] ?? 0) + 1;
      const perUser = new Map<string, number>();
      for (const entry of inRange) {
        if (entry.userId === null) continue;
        if ((options.identity.roleOf(entry.userId) ?? 'student') !== 'student') continue;
        perUser.set(entry.userId, (perUser.get(entry.userId) ?? 0) + entry.costUsd);
      }
      const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
      const months = (days + 1) / 30;
      const monthly = [...perUser.values()].map((cost) => cost / months);
      const mean = monthly.length === 0 ? 0 : monthly.reduce((a, b) => a + b, 0) / monthly.length;
      return {
        from,
        to,
        calls: inRange.length,
        totalUsd: round6(inRange.reduce((sum, entry) => sum + entry.costUsd, 0)),
        byEngine: grouped((entry) => entry.engine),
        byMode: grouped((entry) => entry.mode),
        byOutcome: outcomes,
        users: new Set(inRange.flatMap((entry) => (entry.userId === null ? [] : [entry.userId])))
          .size,
        students: perUser.size,
        perStudentMonthlyUsd: {
          mean: round6(mean),
          p50: round6(percentile(monthly, 0.5)),
          p90: round6(percentile(monthly, 0.9)),
        },
        paidStudentsToday: options.identity.paidStudents(),
      };
    },
    jobsOf: (userId) =>
      memory.jobs.rows
        .filter((row) => row.userId === userId)
        .map((row) => ({ engine: row.engine, status: row.status, jobKey: row.jobKey })),
  };
  return fake;
}

/**
 * Pasa una petición de Playwright a la función y su respuesta de vuelta al navegador. La ruta de la
 * función llega como /functions/v1/ai-proxy/... y la función la ve como /ai-proxy/..., que es como la
 * entrega el servidor de funciones de Supabase
 */
export async function serveAiRoute(
  route: Route,
  ai: FakeAi,
): Promise<{ method: string; path: string; status: number }> {
  const request = route.request();
  const url = new URL(request.url());
  const inner = url.pathname.replace(/^\/functions\/v1/, '');
  const method = request.method();
  const body = request.postData();
  const incoming = new Request(`https://funcion.simulada${inner}${url.search}`, {
    method,
    headers: request.headers(),
    ...(body !== null && method !== 'GET' && method !== 'HEAD' ? { body } : {}),
  });
  const response = await ai.handle(incoming);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (name !== 'content-length' && name !== 'transfer-encoding') headers[name] = value;
  });
  const text = response.status === 204 ? undefined : await response.text();
  try {
    await route.fulfill({
      status: response.status,
      headers,
      ...(text === undefined ? {} : { body: text }),
    });
  } catch {
    // La página ya cerró o navegó y la petición se fue
    await route.abort().catch(() => undefined);
  }
  return { method, path: `${url.pathname}${url.search}`, status: response.status };
}
