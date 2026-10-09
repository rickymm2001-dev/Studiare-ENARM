// Arma las dependencias de las funciones desde el entorno de Deno. Es lo único que lee el entorno,
// para que el resto se pueda probar sin él.
import type { CheckoutDeps, FunctionEnv, PaymentDeps, PortalDeps } from './payments.ts';
import {
  applyNoticeViaRest,
  authenticateUser,
  customerOfUserViaRest,
  founderSeatsLeftViaRest,
  linkCustomerViaRest,
  userOfCustomerViaRest,
  type SupabaseEnv,
} from './supabase.ts';

const NAMES = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_FOUNDER',
  'STRIPE_PRICE_MONTHLY',
  'STRIPE_PRICE_ANNUAL',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_WEBHOOK_SECRET',
  'APP_URL',
  'FUNCTIONS_URL',
] as const;

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

export function paymentDeps(): PaymentDeps {
  const { env, supabase } = readEnv();
  return {
    env,
    fetch,
    now: () => Date.now(),
    applyNotice: (notice) => applyNoticeViaRest(supabase, notice),
    linkCustomer: (link) => linkCustomerViaRest(supabase, link),
    userOfCustomer: (customerId) => userOfCustomerViaRest(supabase, customerId),
  };
}

export function checkoutDeps(): CheckoutDeps {
  const { env, supabase } = readEnv();
  return {
    env,
    fetch,
    now: () => Date.now(),
    authenticate: (authorization) => authenticateUser(supabase, authorization),
    founderSeatsLeft: () => founderSeatsLeftViaRest(supabase),
    customerOf: (userId) => customerOfUserViaRest(supabase, userId),
  };
}

export function portalDeps(): PortalDeps {
  const { env, supabase } = readEnv();
  return {
    env,
    fetch,
    now: () => Date.now(),
    authenticate: (authorization) => authenticateUser(supabase, authorization),
    customerOf: (userId) => customerOfUserViaRest(supabase, userId),
    log: (line) => {
      console.error(line);
    },
  };
}
