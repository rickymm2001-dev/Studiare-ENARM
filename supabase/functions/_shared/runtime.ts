// Arma las dependencias de las funciones desde el entorno de Deno. Es lo único que lee el entorno,
// para que el resto se pueda probar sin él.
import type {
  CancelSubscriptionDeps,
  FunctionEnv,
  MercadoPagoWebhookDeps,
} from './billingTypes.ts';
import type { CheckoutDeps, PortalDeps, StripeWebhookDeps } from './payments.ts';
import {
  applyChargeViaRest,
  applyNoticeViaRest,
  applySubscriptionStateViaRest,
  authenticateUser,
  checkoutContextViaRest,
  claimBillingActionsViaRest,
  finishBillingActionViaRest,
  linkCustomerViaRest,
  noteTrialWillEndViaRest,
  userOfCustomerViaRest,
  type SupabaseEnv,
} from './supabase.ts';

/** Los nombres de 2.6 del diseño. Lo que no esté aquí no llega a las funciones */
const NAMES = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_FOUNDER',
  'STRIPE_PRICE_FOUNDER_ANNUAL',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_ANNUAL',
  'STRIPE_PRICE_PASS_MONTHLY',
  'STRIPE_PRICE_PASS_ANNUAL',
  'STRIPE_PORTAL_CONFIG_FOUNDER',
  'STRIPE_PORTAL_CONFIG_REGULAR',
  'STRIPE_AUTOMATIC_TAX',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_WEBHOOK_SECRET',
  'APP_URL',
  'FUNCTIONS_URL',
] as const satisfies readonly (keyof FunctionEnv)[];

export function readEnv(): { env: FunctionEnv; supabase: SupabaseEnv } {
  const env: FunctionEnv = {};
  for (const name of NAMES) {
    const value = Deno.env.get(name);
    if (value) env[name] = value;
  }
  return {
    env,
    // Supabase inyecta estas tres en toda función. No se piden ni se guardan en ningún otro lado
    supabase: {
      url: Deno.env.get('SUPABASE_URL') ?? '',
      anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    },
  };
}

/** Registro de las funciones, sin llaves ni datos del alumno. Se lee en Edge Functions, Logs */
const log = (line: string) => {
  console.error(line);
};

/** Aviso de Stripe (payment-webhook-stripe) */
export function stripeWebhookDeps(): StripeWebhookDeps {
  const { env, supabase } = readEnv();
  return {
    env,
    fetch,
    now: () => Date.now(),
    log,
    applyCharge: (notice) => applyChargeViaRest(supabase, notice),
    applySubscriptionState: (notice) => applySubscriptionStateViaRest(supabase, notice),
    noteTrialWillEnd: (notice) => noteTrialWillEndViaRest(supabase, notice),
    linkCustomer: (link) => linkCustomerViaRest(supabase, link),
    userOfCustomer: (customerId) => userOfCustomerViaRest(supabase, customerId),
    claimBillingActions: (options) => claimBillingActionsViaRest(supabase, options),
    finishBillingAction: (result) => finishBillingActionViaRest(supabase, result),
  };
}

/** Crear el pago (create-checkout) */
export function checkoutDeps(): CheckoutDeps {
  const { env, supabase } = readEnv();
  return {
    env,
    fetch,
    now: () => Date.now(),
    log,
    authenticate: (authorization) => authenticateUser(supabase, authorization),
    checkoutContext: (userId) => checkoutContextViaRest(supabase, userId),
    linkCustomer: (link) => linkCustomerViaRest(supabase, link),
  };
}

/** Portal de Stripe (create-portal-session) */
export function portalDeps(): PortalDeps {
  const { env, supabase } = readEnv();
  return {
    env,
    fetch,
    now: () => Date.now(),
    log,
    authenticate: (authorization) => authenticateUser(supabase, authorization),
    checkoutContext: (userId) => checkoutContextViaRest(supabase, userId),
  };
}

/** Aviso de Mercado Pago (payment-webhook-mercadopago, paquete C) */
export function mercadoPagoWebhookDeps(): MercadoPagoWebhookDeps {
  const { env, supabase } = readEnv();
  return {
    env,
    fetch,
    now: () => Date.now(),
    log,
    applyNotice: (notice) => applyNoticeViaRest(supabase, notice),
    applyCharge: (notice) => applyChargeViaRest(supabase, notice),
    applySubscriptionState: (notice) => applySubscriptionStateViaRest(supabase, notice),
    claimBillingActions: (limit) =>
      claimBillingActionsViaRest(supabase, { limit, provider: 'mercadopago' }),
    finishBillingAction: (result) => finishBillingActionViaRest(supabase, result),
  };
}

/** Cancelar la suscripción de Mercado Pago desde la app (cancel-subscription, paquete C) */
export function cancelSubscriptionDeps(): CancelSubscriptionDeps {
  const { env, supabase } = readEnv();
  return {
    env,
    fetch,
    now: () => Date.now(),
    log,
    authenticate: (authorization) => authenticateUser(supabase, authorization),
    checkoutContext: (userId) => checkoutContextViaRest(supabase, userId),
    applySubscriptionState: (notice) => applySubscriptionStateViaRest(supabase, notice),
  };
}
