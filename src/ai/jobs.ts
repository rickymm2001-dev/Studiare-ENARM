// Trabajos por lote de la IA (B12, 3.4). Las hipótesis de por qué olvidas no se piden al momento. Se
// encolan en el servidor, que las manda a Message Batches a mitad de precio, y llegan en una hora o
// hasta en un día. La app manda el trabajo con una llave sin texto, guarda lo pendiente y, al abrir
// el Tutor y cada minuto mientras sigue abierto, pregunta por los que faltan. Lo que llega vuelve a
// validarse aquí con la entrada que mandó, porque el cliente no confía en nadie. Sin React.
import type { z } from 'zod';
import {
  AiErrorSchema,
  AiJobStatusResponseSchema,
  AiJobStatusSchema,
  ENGINE_CONTRACTS,
  MAX_JOB_STATUS_KEYS,
  type AiEngine,
  type AiJobStatus,
  type BatchEngine,
  type EngineInputs,
  type EngineOutputs,
} from '@/engines/aiContracts';
import type { AiStatus } from './client';
import { aiAuthHeaders } from './endpoint';
import { checkOutput, ENGINE_URL, scrubInput, type CallMeta, type FailureReason } from './engines';

const TIMEOUT_MS = 20_000;

/** Las llaves empiezan con tres letras del motor, como fgt_ en hipótesis */
const KEY_PREFIX: Readonly<Record<BatchEngine, string>> = { forgetting: 'fgt', restructure: 'rst' };

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * La llave de un trabajo, el prefijo del motor y 32 caracteres hexadecimales del SHA-256 de sus
 * partes. Nunca lleva texto. Una hipótesis se identifica por su regla y su área
 */
export async function jobKeyOf(engine: BatchEngine, parts: readonly string[]): Promise<string> {
  return `${KEY_PREFIX[engine]}_${(await sha256Hex(parts.join('|'))).slice(0, 32)}`;
}

/** La llave del trabajo de una hipótesis, por su regla y su área */
export const hypothesisJobKey = (rule: string, area: string) =>
  jobKeyOf('forgetting', [rule, area]);

/** Los trabajos solo se encolan con un proxy que responde. Sin él quien llama usa su camino al momento */
export type QueueableStatus = Extract<AiStatus, { kind: 'real' | 'mock' }>;
export const canQueue = (status: AiStatus): status is QueueableStatus =>
  status.kind === 'real' || status.kind === 'mock';

export interface JobFailure {
  ok: false;
  reason: FailureReason;
  message: string;
}

const NETWORK_MESSAGE = 'No se pudo conectar con la IA. Se usa la versión sin IA.';
const BAD_RESPONSE_MESSAGE =
  'La IA respondió algo que no pasó la revisión. Se usa la versión sin IA.';

interface Options {
  fetchImpl?: typeof fetch;
}

async function post(
  path: string,
  body: unknown,
  schema: z.ZodType,
  options: Options,
): Promise<{ ok: true; data: unknown } | JobFailure> {
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${ENGINE_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(await aiAuthHeaders()),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: 'network', message: NETWORK_MESSAGE };
  }
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = AiErrorSchema.safeParse(raw);
    return failure.success
      ? { ok: false, reason: failure.data.error, message: failure.data.message }
      : { ok: false, reason: 'bad_response', message: BAD_RESPONSE_MESSAGE };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, reason: 'bad_response', message: BAD_RESPONSE_MESSAGE };
}

export type EnqueueResult = { ok: true; job: AiJobStatus } | JobFailure;

/**
 * Encola un trabajo. El servidor es idempotente por llave. Si ya hay uno activo con la misma llave
 * lo devuelve, y si hay uno listo de menos de 7 días con la misma entrada lo devuelve ya terminado
 * y sin costo nuevo
 */
export async function enqueueJob<E extends BatchEngine>(
  engine: E,
  jobKey: string,
  rawInput: EngineInputs[E],
  options: Options & {
    status: QueueableStatus;
    /** El ID seudónimo del alumno. Nunca su nombre ni su correo */
    studentRef: string;
    /** Nombres que no deben llegar al proxy ni al modelo */
    names?: readonly string[];
  },
): Promise<EnqueueResult> {
  const parsed = ENGINE_CONTRACTS[engine].input.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_request', message: BAD_RESPONSE_MESSAGE };
  }
  const input = scrubInput(parsed.data as EngineInputs[E], options.names);
  const sent = await post(
    `/jobs/${engine}`,
    {
      studentRef: options.studentRef,
      promptVersion: `${engine}.local.v1`,
      ...(options.names && options.names.length > 0
        ? { blockedNames: options.names.slice(0, 5) }
        : {}),
      input,
      jobKey,
    },
    AiJobStatusSchema,
    options,
  );
  if (!sent.ok) return sent;
  const job = sent.data as AiJobStatus;
  // El servidor contesta por la llave que se le mandó. Otra cosa no es de este trabajo
  if (job.jobKey !== jobKey || job.engine !== engine) {
    return { ok: false, reason: 'bad_response', message: BAD_RESPONSE_MESSAGE };
  }
  return { ok: true, job };
}

export type FetchJobsResult = { ok: true; jobs: AiJobStatus[] } | JobFailure;

/** El estado de hasta 20 trabajos propios por pedido. Los que no existen o no son del alumno no aparecen */
export async function fetchJobs(
  jobKeys: readonly string[],
  options: Options = {},
): Promise<FetchJobsResult> {
  const jobs: AiJobStatus[] = [];
  for (let start = 0; start < jobKeys.length; start += MAX_JOB_STATUS_KEYS) {
    const sent = await post(
      '/jobs/status',
      { jobKeys: jobKeys.slice(start, start + MAX_JOB_STATUS_KEYS) },
      AiJobStatusResponseSchema,
      options,
    );
    if (!sent.ok) return sent;
    jobs.push(...(sent.data as { jobs: AiJobStatus[] }).jobs);
  }
  return { ok: true, jobs };
}

/** Un trabajo terminado, ya validado contra la entrada que mandó la app */
export type JobResult<E extends AiEngine> =
  | { state: 'waiting' }
  | { state: 'ready'; output: EngineOutputs[E]; meta: CallMeta }
  | { state: 'failed'; reason: FailureReason; message: string };

/**
 * Lo que dice un trabajo. Un trabajo listo se vuelve a validar con el esquema del motor y sus guardas
 * contra la entrada que la app guardó al mandarlo. Si no pasa, falla como una respuesta mala y la
 * plantilla se queda
 */
export function resultOfJob<E extends BatchEngine>(
  engine: E,
  job: AiJobStatus,
  input: EngineInputs[E],
): JobResult<E> {
  if (job.status === 'queued' || job.status === 'running') return { state: 'waiting' };
  if (job.status === 'failed') {
    return {
      state: 'failed',
      reason: job.error ?? 'provider_error',
      message: job.message ?? 'La IA no pudo con esta explicación. Se usa la versión sin IA.',
    };
  }
  const checked =
    job.output !== undefined && job.meta ? checkOutput(engine, job.output, input) : null;
  if (!job.meta || !checked) {
    return { state: 'failed', reason: 'bad_response', message: BAD_RESPONSE_MESSAGE };
  }
  return {
    state: 'ready',
    output: checked.output,
    meta: {
      ...job.meta,
      validator: {
        passed: true,
        issues: [...new Set([...job.meta.validator.issues, ...checked.issues])],
      },
    },
  };
}
