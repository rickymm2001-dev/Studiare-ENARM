// El ciclo de lotes (B12, 3.4). Manda los trabajos en cola a Message Batches de Anthropic, sondea los
// lotes en curso y recoge los terminados. Cada resultado se valida con el esquema y las guardas del
// motor contra la entrada guardada, igual que una llamada al momento, y se asienta a mitad de
// precio. Lo corre la función ai-batch cuando pg_cron la llama (cada 10 minutos, solo si hay algo
// pendiente) y el proxy de desarrollo con su propio reloj. Un solo ciclo a la vez, con un candado.
// Al procesar un lote se borra en Anthropic, para no dejar ahí textos de alumnos (10.17).
// Cada paso del ciclo falla por su lado (revisión, hallazgos 2 y 3): un lote que lanza se registra con un
// código y el ciclo sigue con el siguiente lote, con el envío y con la limpieza. Un lote que Anthropic ya
// no encuentra se da por perdido y sus trabajos vuelven a la cola. Si algo falla entre reclamar los
// trabajos y crear el lote, el reclamo se suelta enseguida, y uno que se queda sin lote se suelta a los
// 15 minutos si ningún lote reciente es suyo.
import type { Message, MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages';
import {
  ENGINE_CONTRACTS,
  type AiCallMeta,
  type BatchEngine,
  type EngineInputs,
} from './engines/aiContracts.ts';
import { MOCK_MODEL } from './engines/aiMock.ts';
import type { AiConfig, ModelPrice } from './config.ts';
import { estimateBatchCostUsd, worstBatchCostUsd } from './cost.ts';
import {
  BatchCreateUncertainError,
  BatchNotFoundError,
  type BatchApi,
  type BatchRequest,
  type BatchRow,
  type Clock,
  type GateReader,
  type JobStore,
  type LedgerPortV2,
  type Log,
  type StaleClaim,
  type StoredJob,
} from './ports.ts';
import { buildUserMessage, type PromptSets } from './prompts.ts';
import { buildMessageParams, readMessage } from './provider.ts';
import { validateOutput } from './run.ts';

export interface BatchTickDeps {
  jobs: JobStore;
  batches: BatchApi;
  ledger: LedgerPortV2;
  gate: GateReader;
  config: () => AiConfig;
  prompts: PromptSets;
  sourceKeys: ReadonlySet<string>;
  /** mock con el lote simulado, que no gasta */
  mode: 'real' | 'mock';
  clock: Clock;
  log: Log;
  /** Plazo interno del ciclo, menor que el reloj de la función */
  deadlineMs: number;
  /** Quién toma el candado. Por omisión uno al azar */
  holder?: string;
  /** Minutos entre consultas de un mismo lote en curso. 10 en producción */
  pollMinutes?: number;
  /** Resultados por ciclo, por los 2 s de CPU de la función */
  maxResults?: number;
  /** Trabajos por lote nuevo */
  maxClaim?: number;
  /** Minutos tras los que un reclamo sin lote registrado se busca en Anthropic */
  staleMinutes?: number;
}

export interface TickReport {
  /** false si otro ciclo tenía el candado y este no hizo nada */
  took: boolean;
  sent: number;
  ready: number;
  failed: number;
  requeued: number;
  processedBatches: number;
  scrubbed: number;
  /** Pasos del ciclo que fallaron y se registraron sin detener a los demás */
  errors: number;
}

const DEFAULTS = { pollMinutes: 10, maxResults: 150, maxClaim: 500, staleMinutes: 15 };
/** Un lote expira a las 24 horas. Un reclamo más viejo que esto ya no tiene lote que reconocer */
const ABANDON_CLAIM_MS = 25 * 3_600_000;
/** Cuántos lotes recientes se piden a Anthropic para reconocer uno que se creó y no se registró */
const RECENT_BATCHES = 20;
/** Margen entre el reloj de la base y el de Anthropic al comparar cuándo nació un lote y cuándo se reclamó */
const CLOCK_SKEW_MS = 5 * 60_000;

/** El estado HTTP de un error de la API, si lo trae. Es lo único del error que se registra (2.5) */
function statusOf(error: unknown): Record<string, number> {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? { status } : {};
}

/** El precio de lo que contestó la API. El modelo puede venir con sufijo de fecha */
function priceFor(config: AiConfig, model: string, engine: BatchEngine): ModelPrice | undefined {
  return (
    config.prices[model] ??
    config.prices[model.replace(/-\d{8}$/, '')] ??
    config.prices[config.models[engine].id]
  );
}

/** La petición de un trabajo. Igual que la del camino al momento, con custom_id igual a su id */
export function batchRequestFor(
  job: StoredJob,
  config: AiConfig,
  prompts: PromptSets,
): BatchRequest {
  return {
    custom_id: job.id,
    params: buildMessageParams({
      model: config.models[job.engine],
      system: prompts[job.engine].text,
      user: buildUserMessage(job.input, job.issues),
      schema: ENGINE_CONTRACTS[job.engine].output,
    }),
  };
}

export async function runBatchTick(deps: BatchTickDeps): Promise<TickReport> {
  const options = {
    pollMinutes: deps.pollMinutes ?? DEFAULTS.pollMinutes,
    maxResults: deps.maxResults ?? DEFAULTS.maxResults,
    maxClaim: deps.maxClaim ?? DEFAULTS.maxClaim,
    staleMinutes: deps.staleMinutes ?? DEFAULTS.staleMinutes,
  };
  const report: TickReport = {
    took: false,
    sent: 0,
    ready: 0,
    failed: 0,
    requeued: 0,
    processedBatches: 0,
    scrubbed: 0,
    errors: 0,
  };
  const holder = deps.holder ?? crypto.randomUUID();
  const deadline = deps.clock() + deps.deadlineMs;
  const timeLeft = () => deps.clock() < deadline;
  if (!(await deps.jobs.lease(holder, Math.ceil(deps.deadlineMs / 1000) + 30))) return report;
  report.took = true;
  const config = deps.config();
  const real = deps.mode === 'real';

  /** Una falla se registra con su código y el estado HTTP, nunca con su texto, y el ciclo sigue */
  const fail = (code: string, error: unknown) => {
    report.errors += 1;
    deps.log(code, statusOf(error));
  };

  // ------------------------------------------------------------------------------------------
  // Un resultado

  async function settleBilledAttempt(job: StoredJob, message: Message, costUsd: number) {
    await deps.ledger.settle({
      userId: job.userId,
      engine: job.engine,
      model: real ? message.model : MOCK_MODEL,
      real,
      ok: false,
      costUsd,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      latencyMs: 0,
      mode: 'batch',
      outcome: 'invalid_output',
      promptVersion: job.promptVersion,
      refusalCategory: null,
      jobId: job.id,
    });
  }

  async function requeue(
    job: StoredJob,
    issues: string[],
    reason: Parameters<JobStore['requeue']>[2],
  ) {
    const result = await deps.jobs.requeue(job.id, issues, reason);
    if (result === 'failed') report.failed += 1;
    else report.requeued += 1;
  }

  async function handle(job: StoredJob, line: MessageBatchIndividualResponse) {
    const result = line.result;
    if (result.type === 'expired' || result.type === 'canceled') {
      // No se cobró. Vuelve a la cola con su tope de intentos
      await requeue(job, job.issues, result.type);
      return;
    }
    if (result.type === 'errored') {
      if (result.error.error.type === 'invalid_request_error') {
        await deps.jobs.finish(job.id, { status: 'failed', error: 'provider_error', costUsd: 0 });
        report.failed += 1;
      } else {
        await requeue(job, job.issues, 'errored');
      }
      return;
    }
    const message = result.message;
    const read = readMessage(message);
    const price = priceFor(config, message.model, job.engine);
    const costUsd = real && price ? estimateBatchCostUsd(price, read.usage) : 0;
    if (read.refusal) {
      await deps.jobs.finish(job.id, {
        status: 'failed',
        error: 'refused',
        costUsd,
        refusalCategory: read.refusal.category,
        usage: { model: real ? message.model : MOCK_MODEL, real, ...read.usage },
      });
      report.failed += 1;
      return;
    }
    const checked =
      read.problem === undefined
        ? validateOutput(
            job.engine,
            read.raw,
            job.input as EngineInputs[BatchEngine],
            deps.sourceKeys,
          )
        : { ok: false as const, schemaValid: false, issues: [read.problem] };
    if (!checked.ok) {
      // Se cobró aunque no sirva. Vuelve a la cola con lo que falló, como el reintento de hoy
      await settleBilledAttempt(job, message, costUsd);
      await requeue(job, checked.issues, 'invalid_output');
      return;
    }
    const meta: AiCallMeta = {
      engine: job.engine,
      mode: deps.mode,
      model: real ? job.model : MOCK_MODEL,
      promptVersion: job.promptVersion,
      inputTokens: read.usage.inputTokens,
      outputTokens: read.usage.outputTokens,
      cacheWriteTokens: read.usage.cacheWriteTokens,
      cacheReadTokens: read.usage.cacheReadTokens,
      estimatedCostUsd: costUsd,
      latencyMs: 0,
      outcome: job.attempts > 1 ? 'retried_ok' : 'ok',
      validator: { passed: true, issues: checked.guardIssues },
    };
    await deps.jobs.finish(job.id, { status: 'ready', output: checked.output, meta, costUsd });
    report.ready += 1;
  }

  // ------------------------------------------------------------------------------------------
  // Recoger un lote terminado. Hasta maxResults por ciclo, saltándose lo ya terminado

  let budget = options.maxResults;

  async function collect(batchId: string): Promise<boolean> {
    const lines: MessageBatchIndividualResponse[] = [];
    for await (const line of await deps.batches.results(batchId)) lines.push(line);
    for (let start = 0; start < lines.length; start += 50) {
      const chunk = lines.slice(start, start + 50);
      const pending = new Map(
        (
          await deps.jobs.pending(
            batchId,
            chunk.map((line) => line.custom_id),
          )
        ).map((job) => [job.id, job]),
      );
      for (const line of chunk) {
        const job = pending.get(line.custom_id);
        if (!job) continue;
        if (budget <= 0 || !timeLeft()) return false;
        await handle(job, line);
        budget -= 1;
      }
    }
    try {
      await deps.batches.delete(batchId);
    } catch {
      // Se vuelve a intentar en el siguiente ciclo, sin dar el lote por procesado
      deps.log('ai.batch.delete_failed');
      return false;
    }
    await deps.jobs.mark(batchId, 'processed');
    report.processedBatches += 1;
    return true;
  }

  async function poll(row: BatchRow) {
    if (row.status === 'in_progress' || row.status === 'canceling') {
      const batch = await deps.batches.retrieve(row.id);
      if (batch.processing_status !== 'ended') return;
      await deps.jobs.mark(row.id, 'ended');
    }
    await collect(row.id);
  }

  /**
   * Revisa un lote. Si Anthropic ya no lo encuentra (se borró a mano, es de otro espacio de trabajo, o se
   * borró al procesarlo y el último paso falló), se da por procesado. Marcarlo así devuelve a la cola, con
   * su tope de intentos, los trabajos que se quedaron sin resultado. Lo que ya terminó se queda como está
   */
  async function pollOrLose(row: BatchRow) {
    try {
      await poll(row);
    } catch (error) {
      if (!(error instanceof BatchNotFoundError)) throw error;
      deps.log('ai.batch.lost');
      await deps.jobs.mark(row.id, 'processed');
      report.processedBatches += 1;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Reconocer un lote que se creó y no se registró, por los custom_id de sus resultados. Un reclamo que
  // lleva staleMinutes en submitting y no tiene lote se suelta: antes esperaba 25 horas, un día entero
  // para todo lo que reclamó, aunque el ciclo solo hubiera fallado un segundo

  async function reconcileClaim(
    claim: StaleClaim,
    recent: Awaited<ReturnType<BatchApi['recent']>>,
  ) {
    const claimedAt = Date.parse(claim.claimedAt);
    const since = claimedAt - CLOCK_SKEW_MS;
    const ids = new Set(claim.jobIds);
    // Los lotes que nacieron desde el reclamo, de cualquier estado, son los únicos que pudieron ser suyos
    const born = recent.filter((batch) => Date.parse(batch.created_at) >= since);
    for (const batch of born) {
      if (batch.processing_status !== 'ended') continue;
      const custom: string[] = [];
      try {
        for await (const line of await deps.batches.results(batch.id)) custom.push(line.custom_id);
      } catch (error) {
        if (error instanceof BatchNotFoundError) continue;
        throw error;
      }
      if (custom.length === 0 || !custom.every((id) => ids.has(id))) continue;
      await deps.jobs.submitted(
        claim.claimId,
        batch.id,
        Object.fromEntries(custom.map((id) => [id, 0])),
      );
      deps.log('ai.batch.reconciled', { jobs: custom.length });
      return;
    }
    // Ninguno es suyo. La lista llega del más nuevo al más viejo, así que si ninguno de los recientes nació
    // desde el reclamo, no hay ninguno que pudiera serlo. Uno en curso, que todavía no se puede leer, sí
    // cuenta. Entonces el lote nunca se creó y los trabajos pueden volver a la cola
    const age = deps.clock() - claimedAt;
    if (born.length === 0 || age > ABANDON_CLAIM_MS) {
      await deps.jobs.unclaim(claim.claimId);
      deps.log('ai.batch.claim_released', { minutes: Math.round(age / 60_000) });
    }
  }

  async function reconcile() {
    const stale = await deps.jobs.stale(options.staleMinutes);
    if (stale.length === 0) return;
    const recent = await deps.batches.recent(RECENT_BATCHES);
    for (const claim of stale) {
      try {
        await reconcileClaim(claim, recent);
      } catch (error) {
        fail('ai.batch.reconcile_failed', error);
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Mandar lo que cabe en el presupuesto del día y de la cuota de cada motor

  /** Regresa un reclamo a la cola. Si no se puede, el reconciliador lo suelta a los 15 minutos */
  async function release(claimId: string) {
    try {
      await deps.jobs.unclaim(claimId);
    } catch (error) {
      fail('ai.batch.unclaim_failed', error);
    }
  }

  async function send() {
    const state = await deps.gate.read();
    // Con la pausa no salen lotes nuevos. Los que ya están en curso se siguen recogiendo
    if (state.paused) return;
    const claim = await deps.jobs.claim(options.maxClaim);
    if (claim.jobs.length === 0) return;
    // Desde aquí los trabajos están en submitting. Si algo falla antes de crear el lote se regresan a la
    // cola, no solo si falla crearlo, y no se quedan esperando a que alguien los suelte
    const requests: BatchRequest[] = [];
    const estimates: Record<string, number> = {};
    try {
      const summary = await deps.ledger.summary();
      const { limits } = config;
      const inFlight = Object.values(summary.inFlightUsd).reduce((sum, value) => sum + value, 0);
      let total = limits.dailyBudgetUsd - summary.spentUsd - inFlight;
      const perEngine = new Map<BatchEngine, number>();
      for (const job of claim.jobs) {
        const request = batchRequestFor(job, config, deps.prompts);
        const model = config.models[job.engine];
        const price = config.prices[model.id];
        const text = `${deps.prompts[job.engine].text}${buildUserMessage(job.input, job.issues)}`;
        const worst = real && price ? worstBatchCostUsd(price, text, model.maxTokens) : 0;
        const engineLeft =
          perEngine.get(job.engine) ??
          limits.dailyBudgetUsd * limits.engineShare[job.engine] -
            (summary.byEngine[job.engine]?.costUsd ?? 0) -
            (summary.inFlightUsd[job.engine] ?? 0);
        if (
          worst > total ||
          worst > engineLeft ||
          (real && engineLeft <= 0) ||
          (real && total <= 0)
        ) {
          perEngine.set(job.engine, engineLeft);
          continue;
        }
        total -= worst;
        perEngine.set(job.engine, engineLeft - worst);
        requests.push(request);
        estimates[job.id] = worst;
      }
    } catch (error) {
      fail('ai.batch.send_failed', error);
      await release(claim.claimId);
      return;
    }
    if (requests.length === 0) {
      // Nada cabe hoy. Espera al día siguiente sin contar intento
      await deps.jobs.unclaim(claim.claimId);
      return;
    }
    let batchId: string;
    try {
      batchId = (await deps.batches.create(requests)).id;
    } catch (error) {
      if (error instanceof BatchCreateUncertainError) {
        // El lote pudo haberse creado. Regresar los trabajos los mandaría dos veces, así que se quedan en
        // submitting y el reconciliador busca su lote entre los recientes por custom_id
        fail('ai.batch.create_uncertain', error);
        return;
      }
      // Un 429 o un 5xx al crear. Se regresa todo sin contar intento y se prueba en el siguiente ciclo
      fail('ai.batch.create_failed', error);
      await release(claim.claimId);
      return;
    }
    try {
      await deps.jobs.submitted(claim.claimId, batchId, estimates);
    } catch (error) {
      // El lote ya existe en Anthropic: los trabajos no se regresan, y el reconciliador lo reconoce
      fail('ai.batch.register_failed', error);
      return;
    }
    report.sent += requests.length;
  }

  /** Un paso del ciclo. Si falla se registra y el ciclo sigue con el siguiente */
  async function step(code: string, work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      fail(code, error);
    }
  }

  try {
    await step('ai.batch.reconcile_failed', reconcile);
    let due: BatchRow[] = [];
    await step('ai.batch.due_failed', async () => {
      due = await deps.jobs.due(options.pollMinutes);
    });
    for (const row of due) {
      if (!timeLeft() || budget <= 0) break;
      // Un lote que falla no frena a los demás, ni al envío ni a la limpieza
      await step('ai.batch.poll_failed', () => pollOrLose(row));
    }
    if (timeLeft()) await step('ai.batch.send_failed', send);
    await step('ai.batch.scrub_failed', async () => {
      report.scrubbed = await deps.jobs.scrub();
    });
  } finally {
    try {
      await deps.jobs.lease(holder, 0);
    } catch (error) {
      fail('ai.batch.lease_release_failed', error);
    }
  }
  deps.log('ai.batch.tick', {
    sent: report.sent,
    ready: report.ready,
    failed: report.failed,
    requeued: report.requeued,
    batches: report.processedBatches,
    errors: report.errors,
  });
  return report;
}

// ---------------------------------------------------------------------------------------------
// La función ai-batch (3.4 y 2.6)

export interface BatchHandlerDeps {
  /** ai_tick_secret_ok, que compara contra el secreto de Vault */
  tickOk: (candidate: string) => Promise<boolean>;
  tick: () => Promise<TickReport>;
  /** EdgeRuntime.waitUntil en la función */
  waitUntil: (work: Promise<unknown>) => void;
  log: Log;
}

const reply = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * Solo atiende a pg_cron, con el encabezado x-ai-tick. Una petición con Origin es de un navegador y
 * se rechaza. Sin encabezado o con uno equivocado contesta 401 sin tocar nada. Con el bueno contesta
 * 202 enseguida y trabaja en segundo plano
 */
export function createAiBatchHandler(deps: BatchHandlerDeps) {
  return async (request: Request): Promise<Response> => {
    if (request.headers.has('origin')) return reply({ error: 'origin_not_allowed' }, 403);
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    const candidate = request.headers.get('x-ai-tick') ?? '';
    if (candidate === '') return reply({ error: 'unauthorized' }, 401);
    let ok: boolean;
    try {
      ok = await deps.tickOk(candidate);
    } catch {
      deps.log('ai.batch.secret_unavailable');
      return reply({ error: 'unavailable' }, 503);
    }
    if (!ok) return reply({ error: 'unauthorized' }, 401);
    deps.waitUntil(
      deps.tick().catch(() => {
        deps.log('ai.batch.tick_failed');
      }),
    );
    return reply({ status: 'accepted' }, 202);
  };
}
