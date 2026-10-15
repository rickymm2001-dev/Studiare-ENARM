// El costo de la IA en la nube (B12, 2.5 y 6.1). admin_ai_cost_report da al admin lo que gastó la nube en
// un periodo, por motor, por modo (al momento o por lote), por resultado y por alumno al mes, sin el
// texto de nadie. Se valida con zod al llegar y se traduce el error de la base. No lanza.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ForbiddenHandler } from './aiGate.ts';

const count = z.coerce.number().int().nonnegative();
const usd = z.coerce.number().nonnegative();
const Spent = z.object({ calls: count, costUsd: usd });

export const CostReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  calls: count,
  totalUsd: usd,
  byEngine: z.record(z.string(), Spent),
  byMode: z.record(z.string(), Spent),
  byOutcome: z.record(z.string(), count),
  /** Cuentas distintas que llamaron, con o sin ser alumnos */
  users: count,
  /** Alumnos distintos, que son sobre los que se calcula el costo por alumno */
  students: count,
  /** Lo que cuesta un alumno al mes en este periodo */
  perStudentMonthlyUsd: z.object({ mean: usd, p50: usd, p90: usd }),
  paidStudentsToday: count,
});
export type CostReport = z.infer<typeof CostReportSchema>;

export type CostFailure = 'forbidden' | 'no_session' | 'invalid' | 'network' | 'unknown';
export type CostResult = { ok: true; report: CostReport } | { ok: false; reason: CostFailure };

const SQLSTATE: Readonly<Record<string, CostFailure>> = {
  '42501': 'forbidden',
  '28000': 'no_session',
  '22023': 'invalid',
};

/** El reporte de un periodo, de una fecha AAAA-MM-DD a otra, de hasta un año */
export async function fetchCostReport(
  cloud: Pick<SupabaseClient, 'rpc'>,
  range: { from: string; to: string },
  onForbidden?: ForbiddenHandler,
): Promise<CostResult> {
  let reply: { data: unknown; error: { code?: string } | null };
  try {
    reply = (await cloud.rpc('admin_ai_cost_report', {
      p_from: range.from,
      p_to: range.to,
    })) as typeof reply;
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (reply.error) {
    const code = reply.error.code;
    if (!code) return { ok: false, reason: 'network' };
    const reason = SQLSTATE[code] ?? 'unknown';
    if (reason === 'forbidden') onForbidden?.();
    return { ok: false, reason };
  }
  const parsed = CostReportSchema.safeParse(reply.data);
  return parsed.success ? { ok: true, report: parsed.data } : { ok: false, reason: 'unknown' };
}
