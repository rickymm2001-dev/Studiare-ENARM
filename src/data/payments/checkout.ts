// Iniciar un pago real en modo prueba (Fase P bloque 5, D-096, y B10 del plan del cambio). El navegador
// solo le pide a la función create-checkout del servidor la dirección donde pagar. Nunca ve una llave,
// no manda precios y no decide a nombre de quién se paga, eso lo hace el servidor con el token de la
// sesión. Tampoco decide si hay prueba gratis. Manda lo que le dijo al alumno (expectTrial) y el
// servidor responde trial_mismatch si no coincide (4.18). La dirección que vuelve se revisa contra los
// dominios de las pasarelas antes de abrirla. Con ui wallet (B17, 6.4) no vuelve una dirección sino el
// secreto de una sesión para los botones de Apple Pay y Google Pay, que solo recibe Stripe.js.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { regularPlanOf, type PaidPlanKey } from '@/config/billing';
import { track } from '../analytics/catalog';
import { functionErrorBody } from './functionError';

export type { PaidPlanKey };
export type PaymentProvider = 'stripe' | 'mercadopago';
export type CheckoutMode = 'subscription' | 'pass';
export type PassMethod = 'oxxo' | 'spei';

/** Las formas de pago que ofrece Suscripción (3.1.2) */
export type PaymentOption = 'card' | 'oxxo' | 'spei' | 'mercadopago' | 'mercadopago_pass';

/**
 * Cómo se paga con Stripe (B17, 6.4), igual a CheckoutUi de las funciones. hosted, o sin el campo, abre la
 * página de pago de Stripe. wallet es la sesión de la pantalla Suscripción con los botones de Apple Pay y
 * Google Pay, solo para Stripe, suscripción y tarjeta
 */
export type CheckoutUi = 'hosted' | 'wallet';

/** Lo que se manda a create-checkout, como CheckoutRequest de las funciones */
export interface CheckoutRequest {
  plan: PaidPlanKey;
  provider: PaymentProvider;
  mode: CheckoutMode;
  method?: PassMethod;
  expectTrial: boolean;
  ui?: CheckoutUi;
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

/** El pago por la página de Stripe o de Mercado Pago. Sin kind, que es como lo conoce todo lo anterior a B17 */
export interface HostedCheckoutResult {
  ok: true;
  kind?: undefined;
  url: string;
  trial: boolean;
}

/**
 * El pago con los botones de Apple Pay y Google Pay (B17, 6.4 y 9.6). El clientSecret es de la sesión que se
 * acaba de crear para este navegador: solo lo recibe Stripe.js, y no se guarda ni se registra en ningún lado.
 * No lleva dirección, así que isAllowedCheckoutUrl no aplica
 */
export interface WalletCheckoutResult {
  ok: true;
  kind: 'wallet';
  clientSecret: string;
  trial: boolean;
}

export interface CheckoutFailureResult {
  ok: false;
  reason: CheckoutFailure;
  /** Con pass_in_force, hasta cuándo vale el pase */
  passEnd?: string | null;
  /** Con trial_mismatch, lo que dice el servidor de la prueba */
  trialAvailable?: boolean;
}

export type CheckoutResult = HostedCheckoutResult | WalletCheckoutResult | CheckoutFailureResult;

const ReplySchema = z.object({ url: z.string(), trial: z.boolean().optional() });

/**
 * La respuesta de create-checkout con ui wallet (B17, 9.6). El secreto de una sesión de Checkout empieza con cs_
 * y no lleva espacios. No se revisa nada más de su forma, que es de Stripe. La prueba se exige: sin ella la
 * pantalla no podría decir qué se cobra hoy
 */
const WalletReplySchema = z.object({
  clientSecret: z.string().regex(/^cs_\S{8,512}$/),
  trial: z.boolean(),
});

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

/**
 * Lo que se pide al servidor para los botones de Apple Pay y Google Pay (B17, 6.4). Es la tarjeta con Stripe de
 * siempre, con el precio Fundador y la prueba, pero con la sesión de la pantalla Suscripción
 */
export function walletCheckoutRequestFor(
  plan: PaidPlanKey,
  trialAvailable: boolean,
): CheckoutRequest & { ui: 'wallet' } {
  return { ...checkoutRequestFor('card', plan, trialAvailable), ui: 'wallet' };
}

/** La forma de pago como la mide la analítica (B15, 1.5). Los pases de Mercado Pago cuentan como Mercado Pago */
export function measuredMethodOf(
  request: CheckoutRequest,
): 'card' | 'oxxo' | 'spei' | 'mercadopago' {
  if (request.provider === 'mercadopago') return 'mercadopago';
  return request.mode === 'pass' && request.method ? request.method : 'card';
}

const KNOWN_FAILURES = new Set<string>([
  'founder_full',
  'founder_lost',
  'already_subscribed',
  'pass_in_force',
  'trial_mismatch',
  'not_configured',
]);

/**
 * El botón de pagar se tocó. Se mide aunque el pago no llegue a abrirse, para ver dónde se atora el embudo.
 * Solo plan, forma de pago y si llevaba prueba, y solo con el permiso Medición de uso (B15, 1.5)
 */
export function trackCheckoutStarted(request: CheckoutRequest): void {
  track('checkout_started', {
    plan: request.plan,
    method: measuredMethodOf(request),
    with_trial: request.expectTrial,
  });
}

/** Qué le pasó a una petición a create-checkout que no salió bien, con lo que la pantalla necesita saber */
async function failureOf(error: unknown): Promise<CheckoutFailureResult> {
  const body = await functionErrorBody(error);
  const code = typeof body?.error === 'string' ? body.error : null;
  if (code === null || !KNOWN_FAILURES.has(code)) return { ok: false, reason: 'failed' };
  const reason = code as CheckoutFailure;
  if (reason === 'pass_in_force') {
    return { ok: false, reason, passEnd: typeof body?.passEnd === 'string' ? body.passEnd : null };
  }
  if (reason === 'trial_mismatch' && typeof body?.trialAvailable === 'boolean') {
    return { ok: false, reason, trialAvailable: body.trialAvailable };
  }
  return { ok: false, reason };
}

/**
 * Pide el pago al servidor. Con ui wallet devuelve WalletCheckoutResult y en cualquier otro caso el pago
 * hospedado de siempre, así quien abre la página de pago no tiene que revisar la variante nueva. Pedir la
 * sesión de las billeteras no mide checkout_started, porque aún no se tocó ningún botón de pagar
 */
export async function startCheckout(
  cloud: SupabaseClient,
  request: CheckoutRequest & { ui: 'wallet' },
): Promise<WalletCheckoutResult | CheckoutFailureResult>;
export async function startCheckout(
  cloud: SupabaseClient,
  request: CheckoutRequest,
): Promise<HostedCheckoutResult | CheckoutFailureResult>;
export async function startCheckout(
  cloud: SupabaseClient,
  request: CheckoutRequest,
): Promise<CheckoutResult> {
  const wallet = request.ui === 'wallet';
  if (!wallet) trackCheckoutStarted(request);
  try {
    const reply = await cloud.functions.invoke<unknown>('create-checkout', {
      body: {
        plan: request.plan,
        provider: request.provider,
        mode: request.mode,
        ...(request.method ? { method: request.method } : {}),
        expectTrial: request.expectTrial,
        ...(wallet ? { ui: 'wallet' } : {}),
      },
    });
    if (reply.error) return await failureOf(reply.error);
    if (wallet) {
      // No hay dirección que revisar. El secreto solo sirve para Stripe.js y no se guarda ni se registra
      const parsed = WalletReplySchema.safeParse(reply.data);
      return parsed.success
        ? {
            ok: true,
            kind: 'wallet',
            clientSecret: parsed.data.clientSecret,
            trial: parsed.data.trial,
          }
        : { ok: false, reason: 'failed' };
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
