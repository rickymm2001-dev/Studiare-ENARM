// Iniciar un pago real en modo prueba (Fase P bloque 5, D-096). El navegador solo le pide a la función
// create-checkout del servidor la dirección donde pagar. Nunca ve una llave, no manda precios y no
// decide a nombre de quién se paga: eso lo hace el servidor con el token de la sesión. La dirección que
// vuelve se revisa contra los dominios de las pasarelas antes de abrirla.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { PlanKey } from '@/config/billing';

export type PaymentProvider = 'stripe' | 'mercadopago';
export type PaidPlanKey = Exclude<PlanKey, 'free'>;

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'founder_full' | 'not_configured' | 'unsafe_url' | 'failed' };

const ReplySchema = z.object({ url: z.string() });

const MERCADO_PAGO_HOST = /(^|\.)mercadopago\.com(\.mx)?$/;

/** Solo se abre una dirección de pago https en los dominios de la pasarela elegida */
export function isAllowedCheckoutUrl(raw: string, provider: PaymentProvider): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  return provider === 'stripe'
    ? url.hostname === 'checkout.stripe.com'
    : MERCADO_PAGO_HOST.test(url.hostname);
}

/** El código de error que mandó la función, si el cuerpo trae uno */
async function errorCodeOf(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return null;
  try {
    const body: unknown = await context.clone().json();
    const code = (body as { error?: unknown } | null)?.error;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

export async function startCheckout(
  cloud: SupabaseClient,
  input: { plan: PaidPlanKey; provider: PaymentProvider },
): Promise<CheckoutResult> {
  try {
    const reply = await cloud.functions.invoke<unknown>('create-checkout', {
      body: { plan: input.plan, provider: input.provider },
    });
    if (reply.error) {
      const code = await errorCodeOf(reply.error);
      if (code === 'founder_full') return { ok: false, reason: 'founder_full' };
      if (code === 'not_configured') return { ok: false, reason: 'not_configured' };
      return { ok: false, reason: 'failed' };
    }
    const parsed = ReplySchema.safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'failed' };
    return isAllowedCheckoutUrl(parsed.data.url, input.provider)
      ? { ok: true, url: parsed.data.url }
      : { ok: false, reason: 'unsafe_url' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
