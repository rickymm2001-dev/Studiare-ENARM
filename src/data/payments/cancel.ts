// Cancelar la suscripción de Mercado Pago (B10 del plan del cambio, 2.5). Mercado Pago no tiene portal
// como Stripe, así que la app llama a la función cancel-subscription. La suscripción sale de la cuenta
// con sesión abierta, nunca de lo que mande el navegador. El plan vale hasta el fin de lo pagado.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { functionErrorCode } from './functionError';

export type CancelResult =
  | { ok: true; periodEnd: string | null }
  | { ok: false; reason: 'no_subscription' | 'not_configured' | 'failed' };

const ReplySchema = z.object({ status: z.literal('canceled'), periodEnd: z.string().nullable() });

export async function cancelMercadoPagoSubscription(cloud: SupabaseClient): Promise<CancelResult> {
  try {
    const reply = await cloud.functions.invoke<unknown>('cancel-subscription', { body: {} });
    if (reply.error) {
      const code = await functionErrorCode(reply.error);
      if (code === 'no_subscription' || code === 'not_configured') {
        return { ok: false, reason: code };
      }
      return { ok: false, reason: 'failed' };
    }
    const parsed = ReplySchema.safeParse(reply.data);
    return parsed.success
      ? { ok: true, periodEnd: parsed.data.periodEnd }
      : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
