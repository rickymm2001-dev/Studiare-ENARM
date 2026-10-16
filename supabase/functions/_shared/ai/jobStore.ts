// La cola de trabajos por lote (B12, 3.4 y 6.2). Aquí viven las reglas que comparten la tabla
// ai_jobs de la base y la cola en memoria del proxy de desarrollo y de las pruebas: cómo se ve un
// trabajo desde la app, cuántos intentos tiene cada falla y qué se asienta al terminar. También el
// adaptador de producción, que llama a las funciones de 20261026000002_ai_jobs.sql con la llave de
// servicio. Ninguna fila guarda texto más tiempo del necesario y nada de esto lee el entorno.
import { z } from 'zod';
import {
  AI_ERROR_CODES,
  BATCH_ENGINES,
  type AiCallMeta,
  type AiErrorCode,
  type AiJobStatus,
  type BatchEngine,
} from './engines/aiContracts.ts';
import { ERROR_MESSAGES, EXPIRED_OUTPUT_MESSAGE } from './messages.ts';
import type {
  BatchRow,
  CallOutcome,
  ClaimedJobs,
  EnqueueInput,
  EnqueueResult,
  JobFinish,
  JobRowStatus,
  JobStore,
  RequeueReason,
  SettlementV2,
  StaleClaim,
  StoredJob,
} from './ports.ts';
import type { Rpc } from './rest.ts';

// ---------------------------------------------------------------------------------------------
// Reglas

/** Un trabajo listo con la misma entrada se reusa sin costo durante 7 días (3.4) */
export const REUSE_DAYS = 7;
/** La salida se limpia 14 días después de entregada o fallida (3.4) */
export const OUTPUT_RETENTION_DAYS = 14;

/**
 * Intentos por motivo de reencolar (tabla de reintentos de 3.4). attempts cuenta los envíos en un
 * lote, así que con el tope ya alcanzado el trabajo queda failed con el código de la derecha
 */
export const REQUEUE_CAPS: Record<RequeueReason, number> = {
  invalid_output: 2,
  errored: 3,
  expired: 2,
  canceled: 2,
};
export const REQUEUE_FAILURE: Record<RequeueReason, AiErrorCode> = {
  invalid_output: 'invalid_output',
  errored: 'provider_error',
  expired: 'provider_error',
  canceled: 'provider_error',
};

/** Igual que la columna ai_jobs.job_key y JobKeySchema del contrato */
export const JOB_KEY_PATTERN = /^[a-z0-9_-]{8,64}$/;

/** Activo es lo que todavía espera respuesta. Solo puede haber uno por alumno, motor y llave */
export const ACTIVE_JOB_STATUSES: readonly JobRowStatus[] = ['queued', 'submitting', 'submitted'];

// ---------------------------------------------------------------------------------------------
// Cómo se ve un trabajo desde la app

/** Lo que devuelven ai_job_enqueue y ai_job_status por trabajo, tal como está en la tabla */
export interface JobStatusRow {
  jobKey: string;
  engine: BatchEngine;
  status: JobRowStatus;
  output: unknown;
  meta: AiCallMeta | null;
  error: AiErrorCode | null;
  /** created_at en ISO 8601 */
  queuedAt: string;
  /** finished_at en ISO 8601 */
  readyAt: string | null;
}

export const JobStatusRowSchema = z.object({
  jobKey: z.string(),
  engine: z.enum(BATCH_ENGINES),
  status: z.enum(['queued', 'submitting', 'submitted', 'ready', 'failed']),
  output: z.unknown(),
  meta: z.unknown(),
  error: z.enum(AI_ERROR_CODES).nullable(),
  queuedAt: z.string(),
  readyAt: z.string().nullable(),
});

/**
 * El trabajo como lo ve la app (AiJobStatusSchema). submitting y submitted son running. Uno listo
 * cuya salida ya se limpió cuenta como fallido, porque la app ya no tiene qué validar
 */
export function jobStatusOf(row: JobStatusRow): AiJobStatus {
  const base = { jobKey: row.jobKey, engine: row.engine, queuedAt: row.queuedAt };
  if (row.status === 'queued') return { ...base, status: 'queued', readyAt: null };
  if (row.status === 'submitting' || row.status === 'submitted') {
    return { ...base, status: 'running', readyAt: null };
  }
  if (row.status === 'ready' && row.output !== null && row.output !== undefined) {
    return {
      ...base,
      status: 'ready',
      output: row.output,
      ...(row.meta ? { meta: row.meta } : {}),
      readyAt: row.readyAt,
    };
  }
  if (row.status === 'ready') {
    return {
      ...base,
      status: 'failed',
      error: 'provider_error',
      message: EXPIRED_OUTPUT_MESSAGE,
      readyAt: row.readyAt,
    };
  }
  const error = row.error ?? 'provider_error';
  return { ...base, status: 'failed', error, message: ERROR_MESSAGES[error], readyAt: row.readyAt };
}

// ---------------------------------------------------------------------------------------------
// Lo que se asienta al terminar (ai_job_finish llama a ai_settle_v2 con esto)

/** El resultado de una falla, como lo guarda ai_call_log.outcome */
export function outcomeOfError(error: AiErrorCode): CallOutcome {
  if (error === 'refused') return 'refused';
  if (error === 'invalid_output') return 'invalid_output';
  if (error === 'rate_limited') return 'rate_limited';
  // Una pausa por el límite de gasto del espacio de trabajo en Anthropic (2.8)
  if (error === 'paused') return 'org_limit';
  return 'provider_error';
}

/** El p_meta de ai_job_finish. callMeta es lo que ve la app y el resto, el renglón de bitácora */
export interface FinishPayload {
  costUsd: number;
  /** null cuando la falla no trae modelo. La base pone entonces el del trabajo */
  model: string | null;
  real: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  outcome: CallOutcome;
  promptVersion: string | null;
  refusalCategory: string | null;
  callMeta: AiCallMeta | null;
}

export function finishPayload(result: JobFinish): FinishPayload {
  if (result.status === 'ready') {
    const meta = result.meta;
    return {
      costUsd: result.costUsd,
      model: meta.model,
      real: meta.mode === 'real',
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      cacheReadTokens: meta.cacheReadTokens,
      cacheWriteTokens: meta.cacheWriteTokens,
      latencyMs: meta.latencyMs,
      outcome: meta.outcome,
      promptVersion: meta.promptVersion,
      refusalCategory: null,
      callMeta: meta,
    };
  }
  return {
    costUsd: result.costUsd,
    model: result.usage?.model ?? null,
    real: result.usage?.real ?? false,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    cacheReadTokens: result.usage?.cacheReadTokens ?? 0,
    cacheWriteTokens: result.usage?.cacheWriteTokens ?? 0,
    latencyMs: 0,
    outcome: outcomeOfError(result.error),
    promptVersion: null,
    refusalCategory: result.refusalCategory ?? null,
    callMeta: null,
  };
}

/** El renglón de bitácora de un trabajo terminado, con mode batch */
export function settlementOfFinish(
  job: Pick<StoredJob, 'id' | 'userId' | 'engine' | 'promptVersion' | 'model'>,
  payload: FinishPayload,
): SettlementV2 {
  return {
    userId: job.userId,
    engine: job.engine,
    model: payload.model ?? job.model,
    real: payload.real,
    ok: payload.callMeta !== null,
    costUsd: payload.real ? payload.costUsd : 0,
    inputTokens: payload.inputTokens,
    outputTokens: payload.outputTokens,
    cacheReadTokens: payload.cacheReadTokens,
    cacheWriteTokens: payload.cacheWriteTokens,
    latencyMs: payload.latencyMs,
    mode: 'batch',
    outcome: payload.outcome,
    promptVersion: payload.promptVersion ?? job.promptVersion,
    refusalCategory: payload.refusalCategory,
    jobId: job.id,
  };
}

// ---------------------------------------------------------------------------------------------
// Adaptador de producción (RPC de 20261026000002_ai_jobs.sql, solo con la llave de servicio)

const StoredJobSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  engine: z.enum(BATCH_ENGINES),
  jobKey: z.string(),
  input: z.unknown(),
  model: z.string(),
  promptVersion: z.string(),
  attempts: z.int().nonnegative(),
  issues: z.array(z.string()),
});
const ClaimSchema = z.object({ claimId: z.string(), jobs: z.array(StoredJobSchema) });
const BatchRowSchema = z.object({
  id: z.string(),
  status: z.enum(['in_progress', 'canceling', 'ended', 'processed']),
  requestCount: z.int().nonnegative(),
  createdAt: z.string(),
  lastPolledAt: z.string().nullable(),
});
const StaleSchema = z.object({
  claimId: z.string(),
  claimedAt: z.string(),
  jobIds: z.array(z.string()),
});
const EnqueueSchema = z.object({
  outcome: z.enum(['queued', 'existing', 'reused', 'too_many_pending']),
  job: JobStatusRowSchema.nullable().optional(),
});

const rowOf = (value: z.infer<typeof JobStatusRowSchema>): JobStatusRow => ({
  ...value,
  output: value.output ?? null,
  meta: (value.meta ?? null) as AiCallMeta | null,
});

export function createRestJobStore(rpc: Rpc): JobStore {
  return {
    async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
      const result = EnqueueSchema.parse(
        await rpc('ai_job_enqueue', {
          p_user: input.userId,
          p_engine: input.engine,
          p_job_key: input.jobKey,
          p_input: input.input,
          p_input_hash: input.inputHash,
          p_prompt_version: input.promptVersion,
          p_model: input.model,
          p_max_pending: input.maxPending,
        }),
      );
      if (result.outcome === 'too_many_pending') return { outcome: 'too_many_pending' };
      if (!result.job) throw new Error('ai_job_enqueue no devolvió el trabajo');
      return { outcome: result.outcome, job: jobStatusOf(rowOf(result.job)) };
    },
    async status(userId, jobKeys) {
      const rows = z
        .array(JobStatusRowSchema)
        .parse(await rpc('ai_job_status', { p_user: userId, p_job_keys: jobKeys }));
      return rows.map((row) => jobStatusOf(rowOf(row)));
    },
    async claim(limit): Promise<ClaimedJobs> {
      const claim = ClaimSchema.parse(await rpc('ai_jobs_claim', { p_limit: limit }));
      return {
        claimId: claim.claimId,
        jobs: claim.jobs.map((job) => ({ ...job, input: job.input ?? null })),
      };
    },
    async submitted(claimId, batchId, estimates) {
      await rpc('ai_jobs_submitted', {
        p_claim: claimId,
        p_batch_id: batchId,
        p_estimates: estimates,
      });
    },
    async unclaim(claimId) {
      await rpc('ai_jobs_unclaim', { p_claim: claimId });
    },
    async due(minMinutes): Promise<BatchRow[]> {
      return z
        .array(BatchRowSchema)
        .parse(await rpc('ai_batches_due', { p_min_minutes: minMinutes }));
    },
    async mark(batchId, status) {
      await rpc('ai_batch_mark', { p_batch_id: batchId, p_status: status });
    },
    async pending(batchId, jobIds): Promise<StoredJob[]> {
      if (jobIds.length === 0) return [];
      const jobs = z
        .array(StoredJobSchema)
        .parse(await rpc('ai_jobs_pending', { p_batch_id: batchId, p_job_ids: jobIds }));
      return jobs.map((job) => ({ ...job, input: job.input ?? null }));
    },
    async finish(jobId, result) {
      await rpc('ai_job_finish', {
        p_job: jobId,
        p_status: result.status,
        p_output: result.status === 'ready' ? result.output : null,
        p_error: result.status === 'failed' ? result.error : null,
        p_meta: finishPayload(result),
      });
    },
    async requeue(jobId, issues, reason) {
      const result = await rpc('ai_job_requeue', {
        p_job: jobId,
        p_issues: issues,
        p_reason: reason,
      });
      if (result === 'requeued' || result === 'failed') return result;
      throw new Error('Respuesta inesperada de ai_job_requeue');
    },
    async scrub() {
      return z
        .int()
        .nonnegative()
        .parse(await rpc('ai_jobs_scrub', {}));
    },
    async lease(holder, seconds) {
      return z
        .boolean()
        .parse(await rpc('ai_tick_lease_take', { p_holder: holder, p_seconds: seconds }));
    },
    async stale(minMinutes): Promise<StaleClaim[]> {
      return z.array(StaleSchema).parse(await rpc('ai_jobs_stale', { p_min_minutes: minMinutes }));
    },
  };
}

/** Los motores con trabajos por lote, para revisar entradas */
export const isBatchEngine = (engine: string): engine is BatchEngine =>
  (BATCH_ENGINES as readonly string[]).includes(engine);
