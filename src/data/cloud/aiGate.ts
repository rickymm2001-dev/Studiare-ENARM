// La compuerta 1 de la IA en la nube (B12, 5 y 6.3 del plan). Dos médicos califican, cada uno sin ver al
// otro, una muestra de textos que escribió la IA, y la base calcula si cada motor pasa. Aquí viven las
// llamadas de la pantalla Auditoría de la IA. El médico asignado lee sus textos y guarda su rúbrica con
// ai_gate_my_samples, ai_gate_my_items y ai_gate_review. El admin importa la muestra, la cierra, ve el
// veredicto y abre o cierra cada motor con admin_ai_*. La bandera ai_gate de platform_settings la leen
// todos y nadie la escribe directo. Cada función valida lo que llega con zod y traduce el error de la
// base a un motivo y, cuando la base lo explica en español, a su texto. Ninguna lanza.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  AiGateReviewSchema,
  AiGateStateSchema,
  BiasTipOutputSchema,
  FlashcardsOutputSchema,
  GATE_SOURCE_KINDS,
  HypothesisInputSchema,
  HypothesisOutputSchema,
  RestructureOutputSchema,
  WeeklyReportOutputSchema,
  BiasTipInputSchema,
  FlashcardsInputSchema,
  RestructureInputSchema,
  WeeklyReportInputSchema,
  type AiEngine,
  type AiGateReview,
  type AiGateSampleFile,
  type AiGateState,
} from '../../engines/aiContracts.ts';

type Rpc = Pick<SupabaseClient, 'rpc'>;
type Tables = Pick<SupabaseClient, 'from'>;

/**
 * Por qué una llamada falló. forbidden es el 42501, que con B9 también es el equipo sin segundo factor.
 * invalid es el 22023 y conflict el 55000 (muestra cerrada, motor que no pasó), los dos con el texto en
 * español que manda la base
 */
export type AiRpcFailure =
  'forbidden' | 'no_session' | 'invalid' | 'conflict' | 'network' | 'unknown';

export type AiRpcResult<T> =
  { ok: true; value: T } | { ok: false; reason: AiRpcFailure; message: string | null };

const SQLSTATE: Readonly<Record<string, AiRpcFailure>> = {
  '42501': 'forbidden',
  '28000': 'no_session',
  '22023': 'invalid',
  '55000': 'conflict',
};

/** Avisa del 42501 antes de devolver la falla, para pedir el segundo factor del equipo (B9) */
export type ForbiddenHandler = () => void;

async function call<T>(
  cloud: Rpc,
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
  onForbidden?: ForbiddenHandler,
): Promise<AiRpcResult<T>> {
  let reply: { data: unknown; error: { code?: string; message?: string } | null };
  try {
    reply = (await cloud.rpc(name, args)) as typeof reply;
  } catch {
    return { ok: false, reason: 'network', message: null };
  }
  if (reply.error) {
    const code = reply.error.code;
    if (!code) return { ok: false, reason: 'network', message: null };
    const reason = SQLSTATE[code] ?? 'unknown';
    if (reason === 'forbidden') onForbidden?.();
    const explains = reason === 'invalid' || reason === 'conflict';
    return { ok: false, reason, message: explains ? (reply.error.message ?? null) : null };
  }
  const parsed = schema.safeParse(reply.data);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: 'unknown', message: null };
}

const count = z.coerce.number().int().nonnegative();
const GateStatusSchema = z.enum(['open', 'closed']);

// ===================================================================== La bandera ai_gate

const CLOSED_GATE: AiGateState = { paused: false, engines: {} };

/**
 * La bandera ai_gate de platform_settings, que todos leen. Sin fila o con otro formato, todo cerrado.
 * Falla si no se pudo leer
 */
export async function fetchGateState(cloud: Tables): Promise<AiRpcResult<AiGateState>> {
  try {
    const { data, error } = await cloud
      .from('platform_settings')
      .select('value')
      .eq('key', 'ai_gate')
      .maybeSingle();
    if (error) return { ok: false, reason: error.code ? 'unknown' : 'network', message: null };
    const row = data as { value?: unknown } | null;
    if (row === null) return { ok: true, value: CLOSED_GATE };
    const parsed = AiGateStateSchema.safeParse(row.value);
    return { ok: true, value: parsed.success ? parsed.data : CLOSED_GATE };
  } catch {
    return { ok: false, reason: 'network', message: null };
  }
}

// ===================================================================== El médico

/** Una muestra abierta que le toca calificar al médico */
export const MySampleSchema = z.object({
  sampleId: z.string(),
  status: GateStatusSchema,
  createdAt: z.string(),
});
export type MySample = z.infer<typeof MySampleSchema>;

export const fetchMySamples = (cloud: Rpc, onForbidden?: ForbiddenHandler) =>
  call(cloud, 'ai_gate_my_samples', {}, z.array(MySampleSchema), onForbidden);

const itemBase = {
  id: z.string(),
  sourceKind: z.enum(GATE_SOURCE_KINDS),
  review: AiGateReviewSchema.nullable(),
};

/**
 * Un texto de la muestra como lo ve el médico, con su fuente y lo que vería el alumno, y su reseña si
 * ya la puso. Sin el modelo ni el prompt, para calificar el texto y no la máquina
 */
export const MyItemSchema = z.discriminatedUnion('engine', [
  z.object({
    ...itemBase,
    engine: z.literal('forgetting'),
    input: HypothesisInputSchema,
    output: HypothesisOutputSchema,
  }),
  z.object({
    ...itemBase,
    engine: z.literal('weekly_report'),
    input: WeeklyReportInputSchema,
    output: WeeklyReportOutputSchema,
  }),
  z.object({
    ...itemBase,
    engine: z.literal('flashcards'),
    input: FlashcardsInputSchema,
    output: FlashcardsOutputSchema,
  }),
  z.object({
    ...itemBase,
    engine: z.literal('bias_tips'),
    input: BiasTipInputSchema,
    output: BiasTipOutputSchema,
  }),
  z.object({
    ...itemBase,
    engine: z.literal('restructure'),
    input: RestructureInputSchema,
    output: RestructureOutputSchema,
  }),
]);
export type MyItem = z.infer<typeof MyItemSchema>;

export const MyItemsSchema = z.object({
  sampleId: z.string(),
  status: GateStatusSchema,
  total: count,
  reviewed: count,
  items: z.array(MyItemSchema),
});
export type MyItems = z.infer<typeof MyItemsSchema>;

export const fetchMyItems = (cloud: Rpc, sampleId: string, onForbidden?: ForbiddenHandler) =>
  call(cloud, 'ai_gate_my_items', { p_sample: sampleId }, MyItemsSchema, onForbidden);

/** Guarda la rúbrica de un texto. Se puede cambiar mientras la muestra está abierta */
export async function reviewItem(
  cloud: Rpc,
  itemId: string,
  review: AiGateReview,
  onForbidden?: ForbiddenHandler,
): Promise<AiRpcResult<undefined>> {
  const checked = AiGateReviewSchema.safeParse(review);
  if (!checked.success) return { ok: false, reason: 'invalid', message: null };
  return call(
    cloud,
    'ai_gate_review',
    { p_item: itemId, p_review: checked.data },
    z.unknown().transform((): undefined => undefined),
    onForbidden,
  );
}

// ===================================================================== El admin

export const SampleRowSchema = z.object({
  sampleId: z.string(),
  status: GateStatusSchema,
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  reviewers: z.array(z.string()),
  total: count,
});
export type SampleRow = z.infer<typeof SampleRowSchema>;

export const listSamples = (cloud: Rpc, onForbidden?: ForbiddenHandler) =>
  call(cloud, 'admin_ai_gate_samples', {}, z.array(SampleRowSchema), onForbidden);

/** Los criterios que no cumplió un motor, como los calcula la base (5.4) */
export const GATE_FAIL_REASONS = [
  'incomplete',
  'severe',
  'safety',
  'grounded',
  'approved',
  'usefulness',
  'clarity',
  'agreement',
] as const;
export type GateFailReason = (typeof GATE_FAIL_REASONS)[number];

export const EngineVerdictSchema = z.object({
  items: count,
  passed: z.boolean(),
  reasons: z.array(z.string()),
  severe: count,
  safetyIssues: count,
  groundedMin: z.number(),
  approvedMin: z.number(),
  usefulnessMean: z.number(),
  clarityMean: z.number(),
  agreement: z.number(),
  kappa: z.number().nullable(),
  reviewers: z.array(
    z.object({
      reviewerId: z.string().nullable(),
      reviewed: count,
      grounded: z.number(),
      approved: z.number(),
    }),
  ),
});
export type EngineVerdict = z.infer<typeof EngineVerdictSchema>;

export const VerdictSchema = z.object({
  sampleId: z.string(),
  closedAt: z.string().optional(),
  engines: z.record(z.string(), EngineVerdictSchema),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/** El veredicto de un motor, o undefined si la muestra no trae textos de ese motor */
export const verdictOf = (verdict: Verdict, engine: AiEngine): EngineVerdict | undefined =>
  verdict.engines[engine];

export const ProgressSchema = z.object({
  sampleId: z.string(),
  status: GateStatusSchema,
  total: count,
  reviewers: z.array(
    z.object({ reviewerId: z.string().nullable(), reviewed: count, severe: count }),
  ),
  closedAt: z.string().nullable(),
  verdict: VerdictSchema.nullable(),
});
export type Progress = z.infer<typeof ProgressSchema>;

export const fetchProgress = (cloud: Rpc, sampleId: string, onForbidden?: ForbiddenHandler) =>
  call(cloud, 'admin_ai_gate_progress', { p_sample: sampleId }, ProgressSchema, onForbidden);

/**
 * Importa una muestra y asigna exactamente a dos médicos. La base solo revisa la forma de arriba, así
 * que el archivo se valida antes con AiGateSampleFileSchema en quien llama. Devuelve el id
 */
export function createSample(
  cloud: Rpc,
  file: AiGateSampleFile,
  reviewers: readonly [string, string],
  onForbidden?: ForbiddenHandler,
) {
  return call(
    cloud,
    'admin_ai_gate_sample_create',
    { p_sample: file, p_reviewers: [...reviewers] },
    z.string(),
    onForbidden,
  );
}

/** Cierra la muestra y la base calcula el veredicto por motor. Cerrarla otra vez devuelve el mismo */
export const closeSample = (cloud: Rpc, sampleId: string, onForbidden?: ForbiddenHandler) =>
  call(cloud, 'admin_ai_gate_close', { p_sample: sampleId }, VerdictSchema, onForbidden);

/**
 * Abre o cierra un motor para los alumnos. Abrir pide que el motor haya pasado en esa muestra cerrada.
 * Cerrar siempre se puede. Devuelve la bandera completa
 */
export function setEngineOpen(
  cloud: Rpc,
  engine: AiEngine,
  open: boolean,
  sampleId: string,
  onForbidden?: ForbiddenHandler,
) {
  return call(
    cloud,
    'admin_ai_gate_set',
    { p_engine: engine, p_open: open, p_sample: sampleId },
    AiGateStateSchema,
    onForbidden,
  );
}

/** La pausa global. Frena a todos salvo admin y dueño en lo que dura la caché de la función */
export const setPaused = (cloud: Rpc, paused: boolean, onForbidden?: ForbiddenHandler) =>
  call(cloud, 'admin_ai_pause', { p_paused: paused }, AiGateStateSchema, onForbidden);
