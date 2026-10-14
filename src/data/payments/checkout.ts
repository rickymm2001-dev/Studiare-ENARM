// Iniciar un pago real en modo prueba (Fase P bloque 5, D-096, y B10 del plan del cambio). El navegador
// solo le pide a la función create-checkout del servidor la dirección donde pagar. Nunca ve una llave,
// no manda precios y no decide a nombre de quién se paga, eso lo hace el servidor con el token de la
// sesión. Tampoco decide si hay prueba gratis. Manda lo que le dijo al alumno (expectTrial) y el
// servidor responde trial_mismatch si no coincide (4.18). La dirección que vuelve se revisa contra los
// dominios de las pasarelas antes de abrirla.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { regularPlanOf, type PaidPlanKey } from '@/config/billing';
import { functionErrorBody } from './functionError';

export type { PaidPlanKey };
export type PaymentProvider = 'stripe' | 'mercadopago';
export type CheckoutMode = 'subscription' | 'pass';
export type PassMethod = 'oxxo' | 'spei';

/** Las formas de pago que ofrece Suscripción (3.1.2) */
export type PaymentOption = 'card' | 'oxxo' | 'spei' | 'mercadopago' | 'mercadopago_pass';

/** Lo que se manda a create-checkout, como CheckoutRequest de las funciones */
export interface CheckoutRequest {
  plan: PaidPlanKey;
  provider: PaymentProvider;
  mode: CheckoutMode;
  method?: PassMethod;
  expectTrial: boolean;
}

export type CheckoutFailure =
  | 'founder_full'
  | 'founder_lost'
  | 'already_subscribed'
  | 'pass_in_force'
  | 'trial_mismatch'
  | 'not_configured'
  | 'unsafe_url'
  | 'failed';

export type CheckoutResult =
  | { ok: true; url: string; trial: boolean }
  | {
      ok: false;
      reason: CheckoutFailure;
      /** Con pass_in_force, hasta cuándo vale el pase */
      passEnd?: string | null;
      /** Con trial_mismatch, lo que dice el servidor de la prueba */
      trialAvailable?: boolean;
    };

const ReplySchema = z.object({ url: z.string(), trial: z.boolean().optional() });

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

/**
 * Lo que se pide al servidor para una forma de pago. Solo la tarjeta con Stripe lleva el precio
 * Fundador y la prueba gratis. Los pases y Mercado Pago van siempre con el plan regular (8.3)
 */
export function checkoutRequestFor(
  option: PaymentOption,
  plan: PaidPlanKey,
  trialAvailable: boolean,
): CheckoutRequest {
  const regular = regularPlanOf(plan);
  switch (option) {
    case 'card':
      return { plan, provider: 'stripe', mode: 'subscription', expectTrial: trialAvailable };
    case 'oxxo':
    case 'spei':
      return {
        plan: regular,
        provider: 'stripe',
        mode: 'pass',
        method: option,
        expectTrial: false,
      };
    case 'mercadopago':
      return { plan: regular, provider: 'mercadopago', mode: 'subscription', expectTrial: false };
    case 'mercadopago_pass':
      return { plan: regular, provider: 'mercadopago', mode: 'pass', expectTrial: false };
  }
}

const KNOWN_FAILURES = new Set<string>([
  'founder_full',
  'founder_lost',
  'already_subscribed',
  'pass_in_force',
  'trial_mismatch',
  'not_configured',
]);

export async function startCheckout(
  cloud: SupabaseClient,
  request: CheckoutRequest,
): Promise<CheckoutResult> {
  try {
    const reply = await cloud.functions.invoke<unknown>('create-checkout', {
      body: {
        plan: request.plan,
        provider: request.provider,
        mode: request.mode,
        ...(request.method ? { method: request.method } : {}),
        expectTrial: request.expectTrial,
      },
    });
    if (reply.error) {
      const body = await functionErrorBody(reply.error);
      const code = typeof body?.error === 'string' ? body.error : null;
      if (code === null || !KNOWN_FAILURES.has(code)) return { ok: false, reason: 'failed' };
      const reason = code as CheckoutFailure;
      if (reason === 'pass_in_force') {
        return {
          ok: false,
          reason,
          passEnd: typeof body?.passEnd === 'string' ? body.passEnd : null,
        };
      }
      if (reason === 'trial_mismatch' && typeof body?.trialAvailable === 'boolean') {
        return { ok: false, reason, trialAvailable: body.trialAvailable };
      }
      return { ok: false, reason };
    }
    const parsed = ReplySchema.safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'failed' };
    return isAllowedCheckoutUrl(parsed.data.url, request.provider)
      ? { ok: true, url: parsed.data.url, trial: parsed.data.trial ?? false }
      : { ok: false, reason: 'unsafe_url' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
