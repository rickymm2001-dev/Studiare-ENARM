// Puertos del núcleo de IA (B12, 1.5 del plan). Son lo único que cambia entre la Edge Function, el
// proxy de desarrollo y las pruebas. El núcleo habla con estas interfaces y cada uno pone su
// adaptador. Solo tipos, sin Node ni Deno.
//
// | Puerto       | Producción (Edge Function)    | Desarrollo (server/)               | Pruebas y e2e  |
// | WhoAmI       | RPC ai_whoami con el token    | Sin sesión, el alumno del sobre    | Memoria        |
// | LedgerPortV2 | RPC v2 con la llave de servicio | server/.ai-ledger.json           | Memoria        |
// | JobStore     | RPC de ai_jobs                | Memoria                            | Memoria        |
// | BatchApi     | SDK de Anthropic              | SDK con clave, o lote simulado     | fakeAnthropic  |
// | GateReader   | platform_settings, ai_gate    | Todo abierto, o el archivo local   | Memoria        |
// | ConfigStore  | Tabla ai_config               | server/ai-config.local.json        | Memoria        |
//
// El proveedor del camino al momento sigue siendo AiProvider de provider.ts, y el motor completo
// runEngine de run.ts con sus RunDeps (contrato C3).
import type {
  BatchCreateParams,
  MessageBatch,
  MessageBatchIndividualResponse,
} from '@anthropic-ai/sdk/resources/messages';
import type { AiConfig } from './config.ts';
import type {
  AiCallMeta,
  AiEngine,
  AiErrorCode,
  AiGateState,
  AiJobStatus,
  BatchEngine,
} from './engines/aiContracts.ts';
import type { UsageSummary } from './ledger.ts';

// ---------------------------------------------------------------------------------------------
// Reloj y registro

/** Milisegundos desde 1970. Las pruebas ponen uno fijo */
export type Clock = () => number;

/**
 * Registro de la función. Solo un código y números, nunca texto de una petición, un token, un cuerpo
 * ni un error completo del SDK (2.5). El código va en minúsculas con puntos, como ai.batch.created
 */
export type Log = (code: string, values?: Readonly<Record<string, number>>) => void;
export const LOG_CODE = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

// ---------------------------------------------------------------------------------------------
// Quién llama (2.3)

/** Igual que RoleSchema de src/data/schemas/common.ts. La función no importa de src */
export const AI_ROLES = ['student', 'physician', 'admin', 'owner'] as const;
export type AiRole = (typeof AI_ROLES)[number];

export interface AiCaller {
  /** El id de la cuenta. Es siempre el alumno de la llamada, nunca el studentRef del sobre */
  userId: string;
  role: AiRole;
  /** user_plan(uid) distinto de free. Incluye la prueba gratis y los pases */
  paid: boolean;
}

/**
 * unauthenticated, sin token o vencido (401). other_device, la cuenta está activa en otro
 * dispositivo (403). unavailable, Supabase no contestó bien (503). Una falla nunca se recuerda
 */
export type WhoAmIFailure = 'unauthenticated' | 'other_device' | 'unavailable';
export type WhoAmIResult = { ok: true; caller: AiCaller } | { ok: false; failure: WhoAmIFailure };
export type WhoAmI = (token: string) => Promise<WhoAmIResult>;

/** Médicos, admins y dueño no tienen tope en dólares por persona y usan los motores cerrados */
export const isStaff = (role: AiRole): boolean => role !== 'student';

// ---------------------------------------------------------------------------------------------
// Libro del día v2 (2.4 y 2.5, RPC ai_admit_v2, ai_settle_v2 y ai_usage_summary_v2)

export interface AdmitV2Input {
  userId: string;
  engine: AiEngine;
  /** Médico, admin o dueño. Sin tope en dólares por persona */
  staff: boolean;
  perStudentPerDay: number;
  dailyBudgetUsd: number;
  /** Fracción del presupuesto que puede gastar el motor (AiLimits.engineShare) */
  engineShare: number;
  perUserDailyUsd: number;
  /** La generación de tarjetas de la llamada, o null fuera de tarjetas */
  generationRef: string | null;
  maxGenerations: number;
  maxSections: number;
}

export type AdmissionV2Reason = 'student_limit' | 'generation_limit' | 'budget_exceeded';
export type AdmissionV2 = { ok: true } | { ok: false; reason: AdmissionV2Reason };

/** Al momento o por lote (ai_call_log.mode) */
export type CallMode = 'sync' | 'batch';

/** Cómo terminó una llamada (ai_call_log.outcome) */
export const CALL_OUTCOMES = [
  'ok',
  'retried_ok',
  'invalid_output',
  'provider_error',
  'rate_limited',
  'refused',
  'org_limit',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** Lo que se asienta de una llamada hecha, sin texto de la petición ni de la respuesta */
export interface SettlementV2 {
  /** null solo en una reestructurada de sistema (B14) */
  userId: string | null;
  engine: AiEngine;
  model: string;
  real: boolean;
  ok: boolean;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  mode: CallMode;
  outcome: CallOutcome;
  promptVersion: string | null;
  /** La categoría de stop_details cuando el modelo se negó */
  refusalCategory: string | null;
  jobId: string | null;
}

export interface UsageSummaryV2 extends UsageSummary {
  /** Trabajos por lote que esperan respuesta */
  pendingJobs: number;
}

export interface LedgerPortV2 {
  /** Cuenta la llamada desde ahora, para que varias a la vez no se salten el límite */
  admit(input: AdmitV2Input): Promise<AdmissionV2>;
  settle(input: SettlementV2): Promise<void>;
  /** Devuelve el cupo de una llamada que no llegó al modelo por un error nuestro */
  release(input: { userId: string; engine: AiEngine; generationRef: string | null }): Promise<void>;
  summary(): Promise<UsageSummaryV2>;
}

// ---------------------------------------------------------------------------------------------
// Cola de trabajos por lote (3.4 y 6.2)

/** Estado de una fila de ai_jobs. La app ve queued, running (submitting o submitted), ready o failed */
export type JobRowStatus = 'queued' | 'submitting' | 'submitted' | 'ready' | 'failed';

export interface EnqueueInput {
  /** null solo en una reestructurada de sistema (B14) */
  userId: string | null;
  engine: BatchEngine;
  jobKey: string;
  /** La entrada ya validada. Se guarda solo mientras hace falta */
  input: unknown;
  inputHash: string;
  promptVersion: string;
  model: string;
  maxPending: number;
}

/**
 * queued es un trabajo nuevo. existing es uno activo con la misma llave. reused es uno listo de
 * menos de 7 días con la misma entrada, que se entrega sin costo. too_many_pending es el tope
 */
export type EnqueueResult =
  { outcome: 'queued' | 'existing' | 'reused'; job: AiJobStatus } | { outcome: 'too_many_pending' };

/** Un trabajo listo para mandarse o para validarse contra su entrada guardada */
export interface StoredJob {
  id: string;
  userId: string | null;
  engine: BatchEngine;
  jobKey: string;
  input: unknown;
  model: string;
  promptVersion: string;
  attempts: number;
  /** Lo que falló en el intento anterior, para el mensaje del reintento */
  issues: string[];
}

export interface ClaimedJobs {
  claimId: string;
  jobs: StoredJob[];
}

export type BatchRowStatus = 'in_progress' | 'canceling' | 'ended' | 'processed';

export interface BatchRow {
  id: string;
  status: BatchRowStatus;
  requestCount: number;
  createdAt: string;
  lastPolledAt: string | null;
}

export type JobFinish =
  | { status: 'ready'; output: unknown; meta: AiCallMeta; costUsd: number }
  | {
      status: 'failed';
      error: AiErrorCode;
      costUsd: number;
      refusalCategory?: string | null;
    };

/** Por qué vuelve a la cola, para la tabla de reintentos de 3.4 */
export type RequeueReason = 'invalid_output' | 'errored' | 'expired' | 'canceled';

export interface JobStore {
  enqueue(input: EnqueueInput): Promise<EnqueueResult>;
  /** Los trabajos del alumno con esas llaves. Marca como entregados los listos */
  status(userId: string, jobKeys: readonly string[]): Promise<AiJobStatus[]>;
  /** Pasa hasta limit trabajos de queued a submitting, con su entrada */
  claim(limit: number): Promise<ClaimedJobs>;
  /** El lote ya existe en Anthropic. estimates es el peor costo de cada trabajo, por id */
  submitted(
    claimId: string,
    batchId: string,
    estimates: Readonly<Record<string, number>>,
  ): Promise<void>;
  /** Crear el lote falló. Regresa los trabajos a la cola sin contar intento */
  unclaim(claimId: string): Promise<void>;
  /** Los lotes en curso que no se revisan hace minMinutes o más */
  due(minMinutes: number): Promise<BatchRow[]>;
  mark(batchId: string, status: BatchRowStatus): Promise<void>;
  /** De esos ids, los que siguen esperando resultado en ese lote, con su entrada guardada */
  pending(batchId: string, jobIds: readonly string[]): Promise<StoredJob[]>;
  /** Guarda la salida o la falla y asienta su costo con mode batch */
  finish(jobId: string, result: JobFinish): Promise<void>;
  /** Vuelve a la cola con lo que falló, o queda failed si ya no tiene intentos */
  requeue(
    jobId: string,
    issues: readonly string[],
    reason: RequeueReason,
  ): Promise<'requeued' | 'failed'>;
  /** Pone en null entradas terminadas y salidas viejas. Devuelve cuántas filas limpió */
  scrub(): Promise<number>;
  /** Un solo ciclo a la vez. true si este holder tomó el candado por seconds segundos */
  lease(holder: string, seconds: number): Promise<boolean>;
}

// ---------------------------------------------------------------------------------------------
// Message Batches de Anthropic (3.4). Con los tipos del SDK, que el núcleo ya usa

export type BatchRequest = BatchCreateParams.Request;

export interface BatchApi {
  create(requests: readonly BatchRequest[]): Promise<MessageBatch>;
  retrieve(batchId: string): Promise<MessageBatch>;
  /** Los resultados en JSONL, en cualquier orden y con su custom_id */
  results(batchId: string): Promise<AsyncIterable<MessageBatchIndividualResponse>>;
  cancel(batchId: string): Promise<MessageBatch>;
  /** Borra el lote y sus resultados en Anthropic, ya terminado (10.17) */
  delete(batchId: string): Promise<void>;
  /** Los lotes más recientes, para reconocer uno que se creó y no se registró */
  recent(limit: number): Promise<MessageBatch[]>;
}

// ---------------------------------------------------------------------------------------------
// Compuerta 1 (5.5) y configuración (2.4)

/** La bandera ai_gate. Con caché de 60 s en producción. Si no se puede leer, todo cuenta cerrado */
export interface GateReader {
  read(): Promise<AiGateState>;
}

/** La configuración guardada de los motores. Con caché de 60 s en producción */
export interface ConfigStore {
  load(): Promise<AiConfig>;
  save(config: AiConfig): Promise<void>;
}
