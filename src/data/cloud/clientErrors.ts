// Mandar y leer los errores del navegador en Supabase (Fase G, G5, D-107). Mandar no pide sesión,
// porque un error puede pasar antes de entrar, y nunca lanza: un error al reportar un error no puede
// causar otro. Leer lo pueden hacer solo el admin y el dueño, por el permiso por fila.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ClientErrorReport } from '../telemetry/clientErrors.ts';

/** Devuelve true si el servidor lo registró o lo sumó a uno que ya tenía */
export async function sendClientError(
  cloud: Pick<SupabaseClient, 'rpc'>,
  report: ClientErrorReport,
): Promise<boolean> {
  try {
    const reply = await cloud.rpc('report_client_error', {
      p_fingerprint: report.fingerprint,
      p_kind: report.kind,
      p_message: report.message,
      p_stack: report.stack,
      p_screen: report.screen,
      p_version: report.version,
    });
    const data: unknown = reply.data;
    return !reply.error && (data === 'recorded' || data === 'counted');
  } catch {
    return false;
  }
}

const RowSchema = z.object({
  day: z.string(),
  fingerprint: z.string(),
  kind: z.enum(['error', 'rejection', 'render']),
  message: z.string(),
  stack: z.string().nullable(),
  screen: z.string(),
  version: z.string(),
  occurrences: z.number().int(),
  first_seen: z.string(),
  last_seen: z.string(),
});
export type ClientErrorRow = z.infer<typeof RowSchema>;

export const CLIENT_ERROR_ROWS = 100;

/** Los errores más recientes. null si no se pudo leer, por ejemplo si la migración falta */
export async function fetchClientErrors(
  cloud: Pick<SupabaseClient, 'from'>,
): Promise<ClientErrorRow[] | null> {
  try {
    const reply = await cloud
      .from('client_errors')
      .select('day,fingerprint,kind,message,stack,screen,version,occurrences,first_seen,last_seen')
      .order('last_seen', { ascending: false })
      .limit(CLIENT_ERROR_ROWS);
    if (reply.error) return null;
    const parsed = z.array(RowSchema).safeParse(reply.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
