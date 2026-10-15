// Rutas de IA del núcleo (B12, 2.1 y 2.2). Las comparten la Edge Function ai-proxy y el proxy de
// desarrollo, que solo cambian quién llama (identify) y dónde viven el libro, la cola, la compuerta y
// la configuración. Cada llamada pasa, en orden, por la sesión, el permiso del motor (plan, equipo,
// pausa y compuerta), el sobre y la entrada, el tamaño, los datos personales y el libro del día
// antes de llegar al proveedor. Su salida pasa por el esquema y las guardas, y su costo y su renglón
// de bitácora se asientan aunque falle. La salida de un motor nunca es chat libre, es siempre el
// esquema del motor anclado a lo que mandó la app.
//   POST /:engine         llamada al momento
//   POST /jobs/status     estado de hasta 20 trabajos propios
//   POST /jobs/:engine    encola un trabajo por lote (forgetting y restructure)
//   GET /config, PUT /config y GET /usage, solo admin y dueño
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  AI_ENGINES,
  AI_INPUT_LIMITS,
  AiEngineSchema,
  AiJobRequestSchema,
  AiJobStatusRequestSchema,
  AiRequestSchema,
  BATCH_ENGINES,
  ENGINE_CONTRACTS,
  inputChars,
  type AiEngine,
  type AiEngineGate,
  type AiErrorCode,
  type AiHealth,
  type BatchEngine,
} from './engines/aiContracts.ts';
import { AiConfigPatchSchema, configProblem, mergeConfig, type AiConfig } from './config.ts';
import { currentAudits, engineGates } from './gate.ts';
import { isBatchEngine } from './jobStore.ts';
import { ERROR_MESSAGES, SESSION_MESSAGES, TOO_MANY_PENDING_MESSAGE } from './messages.ts';
import { findPersonalData, hasPersonalData } from './pii.ts';
import {
  isStaff,
  type AiCaller,
  type Clock,
  type GateReader,
  type JobStore,
  type LedgerPortV2,
  type Log,
  type WhoAmIResult,
} from './ports.ts';
import { sha256Hex, type PromptSets } from './prompts.ts';
import type { AiProvider } from './provider.ts';
import { runEngine } from './run.ts';

/** La versión de /health. La 2 suma unavailable y engines (B12, contrato C1) */
export const HEALTH_VERSION = 2;

export interface AiRoutesDeps {
  /** null sin clave y sin permiso de respuestas simuladas. Los motores contestan not_configured (2.9) */
  provider: AiProvider | null;
  prompts: PromptSets;
  config: () => AiConfig;
  setConfig: (next: AiConfig) => void;
  /**
   * Dónde se guardan los cambios de configuración, como la tabla ai_config en la nube o el archivo
   * local del proxy de desarrollo. Sin él los cambios solo viven en memoria
   */
  saveConfig?: (next: AiConfig) => void | Promise<void>;
  /** Vuelve a leer la configuración guardada cuando vence su caché. Se llama en cada petición */
  refreshConfig?: () => Promise<void>;
  ledger: LedgerPortV2;
  jobs: JobStore;
  gate: GateReader;
  /** Quién llama, a partir del encabezado Authorization tal como llegó */
  identify: (authorization: string | undefined) => Promise<WhoAmIResult>;
  sourceKeys: ReadonlySet<string>;
  clock?: Clock;
  log?: Log;
}

export interface AiVariables {
  caller: AiCaller;
}

type AiContext = Context<{ Variables: AiVariables }>;

export const STATUS: Record<AiErrorCode, ContentfulStatusCode> = {
  invalid_request: 400,
  pii_blocked: 422,
  input_too_large: 413,
  student_limit: 429,
  budget_exceeded: 429,
  rate_limited: 429,
  invalid_output: 502,
  provider_error: 502,
  unauthorized: 401,
  plan_required: 403,
  gate_closed: 403,
  staff_only: 403,
  refused: 502,
  generation_limit: 429,
  not_configured: 503,
  paused: 503,
};

const SESSION_STATUS = { unauthenticated: 401, other_device: 403, unavailable: 503 } as const;

type Denial = 'plan_required' | 'staff_only' | 'paused' | 'gate_closed';

const isPrivileged = (caller: AiCaller) => caller.role === 'admin' || caller.role === 'owner';

/** Abierto o cerrado para alumnos, por motor. Con la pausa todo cuenta cerrado */
export async function studentGates(
  deps: Pick<AiRoutesDeps, 'gate' | 'config' | 'prompts'>,
): Promise<Record<AiEngine, AiEngineGate>> {
  const state = await deps.gate.read();
  const gates = engineGates(state, await currentAudits(deps.config(), deps.prompts));
  if (!state.paused) return gates;
  return Object.fromEntries(AI_ENGINES.map((engine) => [engine, 'gated'])) as Record<
    AiEngine,
    AiEngineGate
  >;
}

/** GET /health. Público. El modo y qué motores ven los alumnos (contrato C1) */
export async function healthOf(
  deps: Pick<AiRoutesDeps, 'provider' | 'gate' | 'config' | 'prompts'>,
): Promise<AiHealth> {
  return {
    status: 'ok',
    mode: deps.provider?.mode ?? 'unavailable',
    version: HEALTH_VERSION,
    engines: await studentGates(deps),
  };
}

/** Una llamada de tarjetas sin generación cuenta como una generación de una sola sección (2.4) */
const singleGeneration = () => `single_${crypto.randomUUID().replace(/-/g, '')}`;

export function createAiRoutes(deps: AiRoutesDeps): Hono<{ Variables: AiVariables }> {
  const routes = new Hono<{ Variables: AiVariables }>();
  const log: Log = deps.log ?? (() => undefined);

  const fail = (c: AiContext, error: AiErrorCode, message: string = ERROR_MESSAGES[error]) =>
    c.json({ error, message }, STATUS[error]);

  routes.use(async (c, next) => {
    c.header('Cache-Control', 'no-store');
    try {
      await deps.refreshConfig?.();
    } catch {
      log('ai.config.unavailable');
      return fail(c, 'not_configured');
    }
    const who = await deps.identify(c.req.header('authorization'));
    if (!who.ok) {
      log('ai.session.denied', { status: SESSION_STATUS[who.failure] });
      return c.json(
        { error: 'unauthorized', message: SESSION_MESSAGES[who.failure] },
        SESSION_STATUS[who.failure],
      );
    }
    c.set('caller', who.caller);
    await next();
    c.header('Cache-Control', 'no-store');
    return undefined;
  });

  /** Por qué este alumno o este médico no usa este motor, o null si puede (2.1) */
  async function denial(caller: AiCaller, engine: AiEngine): Promise<Denial | null> {
    if (engine === 'restructure' && !isStaff(caller.role)) return 'staff_only';
    if (!isStaff(caller.role) && !caller.paid) return 'plan_required';
    const state = await deps.gate.read();
    if (state.paused && !isPrivileged(caller)) return 'paused';
    if (isStaff(caller.role)) return null;
    const gates = engineGates(state, await currentAudits(deps.config(), deps.prompts));
    return gates[engine] === 'open' ? null : 'gate_closed';
  }

  const adminOnly = (c: AiContext) =>
    isPrivileged(c.get('caller')) ? null : c.json({ error: 'forbidden' }, 403);

  // ------------------------------------------------------------------------------------------
  // Configuración y gasto. El permiso se revisa en la ruta que eligió el enrutador, ya decodificada,
  // así /ai/%63onfig tampoco se salta la regla (D-103)

  routes.get('/config', (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    // La misma forma de antes, que la pantalla 25 lee con un esquema estricto. Qué motores ven los
    // alumnos viene en /health
    return c.json({
      mode: deps.provider?.mode ?? 'unavailable',
      config: deps.config(),
      prompts: Object.fromEntries(
        Object.entries(deps.prompts).map(([engine, prompt]) => [engine, prompt.version]),
      ),
    });
  });

  routes.get('/usage', async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    // El resumen del día con la forma que lee la pantalla 23. La cola y lo que está en vuelo se ven
    // en admin_ai_cost_report
    const { day, calls, students, spentUsd, byEngine } = await deps.ledger.summary();
    return c.json({
      mode: deps.provider?.mode ?? 'unavailable',
      limits: deps.config().limits,
      usage: { day, calls, students, spentUsd, byEngine },
    });
  });

  routes.put('/config', async (c) => {
    const denied = adminOnly(c);
    if (denied) return denied;
    const body: unknown = await c.req.json().catch(() => undefined);
    const patch = AiConfigPatchSchema.safeParse(body);
    if (!patch.success) return fail(c, 'invalid_request');
    let next: AiConfig;
    try {
      next = mergeConfig(deps.config(), patch.data);
    } catch {
      // Un modelo sin precio no se puede presupuestar
      return fail(c, 'invalid_request', 'Falta el precio de un modelo de la configuración.');
    }
    const problem = configProblem(next);
    if (problem) return fail(c, 'invalid_request', problem);
    try {
      if (deps.saveConfig) await deps.saveConfig(next);
    } catch {
      // Sin guardarla no se cambia, así todas las copias de la función siguen de acuerdo
      log('ai.config.save_failed');
      return fail(c, 'not_configured', 'No se pudo guardar la configuración. Intenta de nuevo.');
    }
    deps.setConfig(next);
    return c.json({ mode: deps.provider?.mode ?? 'unavailable', config: next });
  });

  // ------------------------------------------------------------------------------------------
  // Trabajos por lote (3.4)

  routes.post('/jobs/status', async (c) => {
    const caller = c.get('caller');
    const body: unknown = await c.req.json().catch(() => undefined);
    const request = AiJobStatusRequestSchema.safeParse(body);
    if (!request.success) return fail(c, 'invalid_request');
    const allowed = new Set<BatchEngine>();
    for (const engine of BATCH_ENGINES) {
      if ((await denial(caller, engine)) === null) allowed.add(engine);
    }
    if (allowed.size === 0) {
      const reason = await denial(caller, 'forgetting');
      if (reason === 'plan_required' || reason === 'paused') return fail(c, reason);
      // Con el motor cerrado no se entrega nada y la salida espera en el servidor
      return c.json({ jobs: [] });
    }
    const jobs = await deps.jobs.status(caller.userId, request.data.jobKeys);
    return c.json({
      jobs: jobs.filter((job) => isBatchEngine(job.engine) && allowed.has(job.engine)),
    });
  });

  routes.post('/jobs/:engine', async (c) => {
    const engine = c.req.param('engine');
    if (!isBatchEngine(engine)) return c.json({ error: 'not_found' }, 404);
    const caller = c.get('caller');
    const denied = await denial(caller, engine);
    if (denied) return fail(c, denied);
    if (!deps.provider) return fail(c, 'not_configured');

    const body: unknown = await c.req.json().catch(() => undefined);
    const request = AiJobRequestSchema.safeParse(body);
    if (!request.success) return fail(c, 'invalid_request');
    const input = ENGINE_CONTRACTS[engine].input.safeParse(request.data.input);
    if (!input.success) return fail(c, 'invalid_request');
    if (inputChars(input.data) > AI_INPUT_LIMITS[engine]) return fail(c, 'input_too_large');
    if (hasPersonalData(findPersonalData(input.data, request.data.blockedNames ?? []))) {
      return fail(c, 'pii_blocked');
    }

    const config = deps.config();
    const { limits } = config;
    const slot = { userId: caller.userId, engine, generationRef: null };
    // El límite por alumno se cuenta al encolar (3.4)
    const admission = await deps.ledger.admit({
      ...slot,
      staff: isStaff(caller.role),
      perStudentPerDay: limits.perStudentPerDay[engine],
      dailyBudgetUsd: limits.dailyBudgetUsd,
      engineShare: limits.engineShare[engine],
      perUserDailyUsd: limits.perUserDailyUsd,
      maxGenerations: limits.cardGenerationsPerDay,
      maxSections: limits.sectionsPerGeneration,
    });
    if (!admission.ok) return fail(c, admission.reason);

    let result;
    try {
      result = await deps.jobs.enqueue({
        userId: caller.userId,
        engine,
        jobKey: request.data.jobKey,
        input: input.data,
        inputHash: await sha256Hex(JSON.stringify(input.data)),
        promptVersion: deps.prompts[engine].version,
        model: config.models[engine].id,
        maxPending: limits.maxPendingJobs,
      });
    } catch (error) {
      await deps.ledger.release(slot);
      throw error;
    }
    // Solo un trabajo nuevo gasta una llamada del día
    if (result.outcome !== 'queued') await deps.ledger.release(slot);
    if (result.outcome === 'too_many_pending') {
      return fail(c, 'student_limit', TOO_MANY_PENDING_MESSAGE);
    }
    const waiting = result.job.status === 'queued' || result.job.status === 'running';
    return c.json(result.job, waiting ? 202 : 200);
  });

  // ------------------------------------------------------------------------------------------
  // Llamada al momento (2.2)

  routes.post('/:engine', async (c) => {
    const engineParsed = AiEngineSchema.safeParse(c.req.param('engine'));
    if (!engineParsed.success) {
      // POST a /config o a /usage es de admin, aunque no exista. Un motor que no existe es 404
      const name = c.req.param('engine');
      if (name === 'config' || name === 'usage')
        return adminOnly(c) ?? c.json({ error: 'not_found' }, 404);
      return c.json({ error: 'not_found' }, 404);
    }
    const engine: AiEngine = engineParsed.data;
    const caller = c.get('caller');
    const denied = await denial(caller, engine);
    if (denied) return fail(c, denied);
    const provider = deps.provider;
    if (!provider) return fail(c, 'not_configured');

    const body: unknown = await c.req.json().catch(() => undefined);
    const request = AiRequestSchema.safeParse(body);
    if (!request.success) return fail(c, 'invalid_request');
    const input = ENGINE_CONTRACTS[engine].input.safeParse(request.data.input);
    if (!input.success) return fail(c, 'invalid_request');
    if (inputChars(input.data) > AI_INPUT_LIMITS[engine]) return fail(c, 'input_too_large');
    if (hasPersonalData(findPersonalData(input.data, request.data.blockedNames ?? []))) {
      return fail(c, 'pii_blocked');
    }

    const config = deps.config();
    const { limits } = config;
    const generationRef =
      engine === 'flashcards' ? (request.data.generation?.ref ?? singleGeneration()) : null;
    const slot = { userId: caller.userId, engine, generationRef };
    const admission = await deps.ledger.admit({
      ...slot,
      staff: isStaff(caller.role),
      perStudentPerDay: limits.perStudentPerDay[engine],
      dailyBudgetUsd: limits.dailyBudgetUsd,
      engineShare: limits.engineShare[engine],
      perUserDailyUsd: limits.perUserDailyUsd,
      maxGenerations: limits.cardGenerationsPerDay,
      maxSections: limits.sectionsPerGeneration,
    });
    if (!admission.ok) return fail(c, admission.reason);

    let result;
    try {
      result = await runEngine(
        {
          provider,
          prompts: deps.prompts,
          config,
          sourceKeys: deps.sourceKeys,
          ...(deps.clock ? { clock: deps.clock } : {}),
        },
        engine,
        input.data,
      );
    } catch (error) {
      // Un error nuestro, no del modelo. Se devuelve el cupo y lo maneja onError
      await deps.ledger.release(slot);
      throw error;
    }

    const real = provider.mode === 'real';
    const usage = result.ok ? result.meta : result.cost;
    await deps.ledger.settle({
      userId: caller.userId,
      engine,
      model: usage.model,
      real,
      ok: result.ok,
      costUsd: real ? usage.estimatedCostUsd : 0,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      latencyMs: usage.latencyMs,
      mode: 'sync',
      outcome: result.ok ? result.meta.outcome : result.outcome,
      promptVersion: deps.prompts[engine].version,
      refusalCategory: result.ok ? null : result.refusalCategory,
      jobId: null,
    });
    if (result.ok) return c.json({ output: result.output, meta: result.meta });
    log('ai.call.failed', { status: STATUS[result.error] });
    return c.json(
      { error: result.error, message: result.message, cost: result.cost },
      STATUS[result.error],
    );
  });

  // Todo lo demás, con cualquier método, pide ser admin y aun así no existe. Así nadie aprende por
  // descarte qué rutas de admin hay
  routes.all('*', (c) => adminOnly(c) ?? c.json({ error: 'not_found' }, 404));

  return routes;
}
