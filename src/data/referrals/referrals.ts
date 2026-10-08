// Referidos con mes gratis (Fase P bloque 11, D-080, D-096). Todo ocurre en el servidor. El navegador
// pide su código, canjea el de otra persona y lee su resumen. El mes gratis lo da la base cuando el
// referido hace su primer pago verificado, así que aquí nunca se otorga nada.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const ReferralSummarySchema = z.object({
  pending: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  monthsEarned: z.number().int().nonnegative(),
  grantedUntil: z.string().nullable(),
  referredBy: z.boolean(),
});
export type ReferralSummary = z.infer<typeof ReferralSummarySchema>;

export interface ReferralState {
  code: string;
  summary: ReferralSummary;
}

const CodeSchema = z.string().regex(/^[A-Z0-9]{8}$/);

/** Mi código y mi resumen. null si la nube no responde o la migración todavía no está aplicada */
export async function fetchReferralState(cloud: SupabaseClient): Promise<ReferralState | null> {
  try {
    const [code, summary] = await Promise.all([
      cloud.rpc('my_referral_code'),
      cloud.rpc('my_referrals'),
    ]);
    if (code.error || summary.error) return null;
    const parsedCode = CodeSchema.safeParse(code.data);
    const parsedSummary = ReferralSummarySchema.safeParse(summary.data);
    return parsedCode.success && parsedSummary.success
      ? { code: parsedCode.data, summary: parsedSummary.data }
      : null;
  } catch {
    return null;
  }
}

export type RedeemResult =
  'ok' | 'invalid' | 'own' | 'already' | 'too_late' | 'already_paid' | 'failed';

const RedeemSchema = z.enum(['ok', 'invalid', 'own', 'already', 'too_late', 'already_paid']);

/** Lo que se escribió, sin espacios y en mayúsculas. Una cadena vacía no se manda */
export function normalizeReferralCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export async function redeemReferralCode(
  cloud: SupabaseClient,
  rawCode: string,
): Promise<RedeemResult> {
  const code = normalizeReferralCode(rawCode);
  if (!CodeSchema.safeParse(code).success) return 'invalid';
  try {
    const reply = await cloud.rpc('redeem_referral_code', { p_code: code });
    if (reply.error) return 'failed';
    const parsed = RedeemSchema.safeParse(reply.data as unknown);
    return parsed.success ? parsed.data : 'failed';
  } catch {
    return 'failed';
  }
}
