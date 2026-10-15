// Banco en la nube para el alumno (B11, 2.5 y 5 del plan de B11). Llamadas tipadas a las funciones de
// supabase/migrations/20261023000002_bank_core.sql. Ninguna lee una tabla del banco, porque la base no
// lo permite. Cada respuesta se valida con zod, porque el servidor es un tercero, y cada error se
// traduce a una causa. Las filas del catálogo y los cuerpos se validan uno por uno más adelante
// (src/data/bank/catalogMerge.ts y bodies.ts), así una fila rara no tira toda la respuesta. Al servidor
// solo viajan ids de preguntas y el motivo de un reporte, nunca texto del alumno.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  BiasAgreementSummary,
  DenyReason,
  QuotaInfo,
  ReadPurpose,
  ReportQuestionResult,
} from '../bank/contracts';
import type { ContentReport } from '../schemas/bank';

type Rpc = Pick<SupabaseClient, 'rpc'>;

export type BankFailure =
  /** La sesión venció o no hay */
  | 'no_session'
  /** Este dispositivo ya no es el activo de la cuenta */
  | 'other_device'
  /** El servidor rechazó los datos */
  | 'invalid'
  /** La migración del banco todavía no está aplicada */
  | 'unavailable'
  /** La petición no llegó al servidor */
  | 'network'
  | 'unknown';

export type BankReply<T> = { ok: true; value: T } | { ok: false; reason: BankFailure };

interface RpcError {
  code?: string | null;
}

/** Traduce el error de la base. Sin código es que la petición ni llegó al servidor */
export function bankFailureOf(error: RpcError): BankFailure {
  const code = error.code ?? '';
  if (code === '28000' || code === 'PGRST301') return 'no_session';
  if (code === '42501') return 'other_device';
  if (code === '22023' || code === '22P02') return 'invalid';
  if (code === 'PGRST202') return 'unavailable';
  if (code === '') return 'network';
  return 'unknown';
}

/** Un instante del servidor en ISO UTC con milisegundos, como lo guarda la app */
const InstantSchema = z.string().transform((value, ctx) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    ctx.addIssue({ code: 'custom', message: 'Fecha inválida' });
    return z.NEVER;
  }
  return new Date(time).toISOString();
});

const QuotaWireSchema = z.object({
  open: z.boolean(),
  plan: z.string().min(1).max(32),
  limit: z.int().min(0).nullable(),
  used: z.int().min(0),
  left: z.int().min(0).nullable(),
  day: z.iso.date(),
  resetsAt: InstantSchema,
  brake: z.object({ retryAt: InstantSchema.nullable() }),
});

const DENY_REASONS: readonly DenyReason[] = [
  'daily_limit',
  'brake',
  'not_found',
  'retired',
  'closed',
];

const DeniedSchema = z.object({
  id: z.string().min(1).max(64),
  // Un motivo que esta app no conoce cuenta como que no está
  reason: z
    .string()
    .transform((value): DenyReason =>
      (DENY_REASONS as readonly string[]).includes(value) ? (value as DenyReason) : 'not_found',
    ),
});

const CatalogPageWireSchema = z.object({
  open: z.boolean(),
  rows: z.array(z.unknown()),
  nextSince: z.number().int().min(0),
  done: z.boolean(),
});

/** La página del catálogo con sus filas todavía sin revisar */
export type CatalogPageWire = z.infer<typeof CatalogPageWireSchema>;

const FetchWireSchema = z.object({
  questions: z.array(z.unknown()),
  cases: z.array(z.unknown()),
  denied: z.array(DeniedSchema),
  quota: QuotaWireSchema,
});

/** Lo que devolvió fetch_questions, con los cuerpos y los casos todavía sin revisar */
export type FetchWire = z.infer<typeof FetchWireSchema>;

const ReportWireSchema = z.object({
  status: z.enum(['created', 'duplicate', 'limit', 'not_found']),
  reportId: z.string().nullable(),
});

const AgreementWireSchema = z.object({
  pairs: z.int().min(0),
  kappa: z.number().min(-1).max(1).nullable(),
  vocabulary: z.enum(['bias', 'trap']),
  calibrating: z.boolean(),
  minPairs: z.int().min(0),
  minKappa: z.number(),
});

async function call<T>(
  cloud: Rpc,
  name: string,
  args: Record<string, unknown> | undefined,
  schema: z.ZodType<T>,
): Promise<BankReply<T>> {
  try {
    const reply = args === undefined ? await cloud.rpc(name) : await cloud.rpc(name, args);
    if (reply.error) return { ok: false, reason: bankFailureOf(reply.error) };
    const parsed = schema.safeParse(reply.data as unknown);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Filas del catálogo que pide la app en cada página. Es el máximo de catalog_changes */
export const CATALOG_PAGE_SIZE = 1000;

/** Las filas del catálogo desde el seq since, en orden de seq */
export function fetchCatalogPage(
  cloud: Rpc,
  since: number,
  limit: number = CATALOG_PAGE_SIZE,
): Promise<BankReply<CatalogPageWire>> {
  return call(cloud, 'catalog_changes', { p_since: since, p_limit: limit }, CatalogPageWireSchema);
}

/** Los cuerpos de las versiones exactas pedidas, ids en uuid. Lo negado sale en denied sin error */
export function fetchQuestionBodies(
  cloud: Rpc,
  versionIds: readonly string[],
  purpose: ReadPurpose,
): Promise<BankReply<FetchWire>> {
  return call(
    cloud,
    'fetch_questions',
    { p_version_ids: [...versionIds], p_purpose: purpose },
    FetchWireSchema,
  );
}

/** La cuota del día sin pedir preguntas */
export function fetchBankQuota(cloud: Rpc): Promise<BankReply<QuotaInfo>> {
  return call(cloud, 'bank_quota', undefined, QuotaWireSchema);
}

/** Reporta un error en la versión que el alumno tenía a la vista. Solo el motivo, sin texto libre */
export function reportQuestionInCloud(
  cloud: Rpc,
  versionId: string,
  reason: ContentReport['reason'],
): Promise<BankReply<ReportQuestionResult>> {
  return call(
    cloud,
    'report_question',
    { p_version_id: versionId, p_reason: reason },
    ReportWireSchema,
  );
}

/** El acuerdo entre médicos que dice si la app habla de sesgos o de trampas (4.4) */
export function fetchAgreementSummary(cloud: Rpc): Promise<BankReply<BiasAgreementSummary>> {
  return call(cloud, 'bias_agreement_summary', undefined, AgreementWireSchema);
}
