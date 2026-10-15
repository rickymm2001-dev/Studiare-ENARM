// Abrir el portal de facturación de Stripe (Fase G, G4, D-106, y B10 del plan del cambio). Ahí el alumno
// cambia de plan, cancela su suscripción, cambia su tarjeta o ve sus facturas. El navegador solo le pide
// a la función create-portal-session la dirección. No manda ningún id de cliente, la función lo saca de
// la cuenta con sesión abierta. Con flow update o cancel el portal abre directo en cambiar de plan o en
// cancelar. La dirección que vuelve se revisa contra el dominio del portal antes de abrirla.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { functionErrorCode } from './functionError';

export type PortalFlow = 'update' | 'cancel';

export type PortalResult =
  | { ok: true; url: string }
  | {
      ok: false;
      /** mercadopago es que la suscripción es de Mercado Pago, que se cancela con cancel-subscription */
      reason: 'no_customer' | 'mercadopago' | 'not_configured' | 'unsafe_url' | 'failed';
    };

const ReplySchema = z.object({ url: z.string() });

/** Solo se abre una dirección https del portal de Stripe */
export function isAllowedPortalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.hostname === 'billing.stripe.com'
    );
  } catch {
    return false;
  }
}

export async function openBillingPortal(
  cloud: SupabaseClient,
  options: { flow?: PortalFlow } = {},
): Promise<PortalResult> {
  try {
    const reply = await cloud.functions.invoke<unknown>('create-portal-session', {
      body: options.flow ? { flow: options.flow } : {},
    });
    if (reply.error) {
      const code = await functionErrorCode(reply.error);
      if (code === 'no_customer' || code === 'mercadopago' || code === 'not_configured') {
        return { ok: false, reason: code };
      }
      return { ok: false, reason: 'failed' };
    }
    const parsed = ReplySchema.safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'failed' };
    return isAllowedPortalUrl(parsed.data.url)
      ? { ok: true, url: parsed.data.url }
      : { ok: false, reason: 'unsafe_url' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
