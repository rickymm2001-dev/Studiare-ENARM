// Abrir el portal de facturación de Stripe (Fase G, G4, D-106). Ahí el alumno cancela su suscripción,
// cambia su tarjeta o ve sus facturas. El navegador solo le pide a la función create-portal-session
// la dirección. No manda ningún id de cliente: la función lo saca de la cuenta con sesión abierta.
// La dirección que vuelve se revisa contra el dominio del portal antes de abrirla.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export type PortalResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'no_customer' | 'not_configured' | 'unsafe_url' | 'failed' };

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

export async function openBillingPortal(cloud: SupabaseClient): Promise<PortalResult> {
  try {
    const reply = await cloud.functions.invoke<unknown>('create-portal-session', { body: {} });
    if (reply.error) {
      const code = await errorCodeOf(reply.error);
      if (code === 'no_customer') return { ok: false, reason: 'no_customer' };
      if (code === 'not_configured') return { ok: false, reason: 'not_configured' };
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
