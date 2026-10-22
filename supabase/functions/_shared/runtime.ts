// Arma las dependencias de las funciones desde el entorno de Deno. Es lo único que lee el entorno,
// para que el resto se pueda probar sin él.
import type {
  CancelSubscriptionDeps,
  FunctionEnv,
  MercadoPagoWebhookDeps,
} from './billingTypes.ts';
import type { CheckoutDeps, PortalDeps, StripeWebhookDeps } from './payments.ts';
import {
  adminSessionOkViaRest,
  analyticsTickOkViaRest,
  applyChargeViaRest,
  applySubscriptionStateViaRest,
  authenticateUser,
  bankSyncApplyViaRest,
  bankSyncAuthorizeViaRest,
  bankSyncBeginViaRest,
  bankSyncCronOkViaRest,
  bankSyncFinishViaRest,
  bankSyncVersionsContentViaRest,
  checkoutContextViaRest,
  claimAnalyticsBatchViaRest,
  claimBillingActionsViaRest,
  claimEmailBatchViaRest,
  emailRecipientsViaRest,
  emailTickOkViaRest,
  emailUnsubscribeViaRest,
  finishAnalyticsBatchViaRest,
  finishBillingActionViaRest,
  finishEmailViaRest,
  linkCustomerViaRest,
  noteTrialWillEndViaRest,
  releaseEmailViaRest,
  userOfCustomerViaRest,
  type SupabaseEnv,
} from './supabase.ts';
import type { AnalyticsFlushDeps } from './analyticsFlush.ts';
import { captureException } from './monitoring.ts';
import { monitoringDeps } from './monitoringRuntime.ts';
import type { MonitoringTestDeps } from './monitoringTest.ts';
import { createResendSender } from './resend.ts';
import type { SendEmailsDeps } from './sendEmails.ts';
import type { UnsubscribeDeps } from './unsubscribe.ts';
import { createGoogleClient } from './bank/google.ts';
import {
  parseApplyResults,
  parseBegin,
  parseVersionsContent,
  type BankSyncDeps,
  type BankSyncStore,
} from './bank/sync.ts';

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

/** Las funciones de la base de la sincronización del banco, con la llave de servicio (B11) */
function restBankSyncStore(supabase: SupabaseEnv): BankSyncStore {
  return {
    begin: async (trigger, target, actorId) =>
      parseBegin(await bankSyncBeginViaRest(supabase, { trigger, target, actorId })),
    versionsContent: async (versionIds) =>
      parseVersionsContent(await bankSyncVersionsContentViaRest(supabase, versionIds)),
    apply: async (runId, rows, forceDryRun) =>
      parseApplyResults(await bankSyncApplyViaRest(supabase, { runId, rows, forceDryRun })),
    finish: async (runId, input) => {
      await bankSyncFinishViaRest(supabase, { runId, ...input });
    },
  };
}

/**
 * Sincronización del banco con el Google Sheet (bank-sync, B11). Lee del entorno solo la llave de la
 * cuenta de servicio y los ID de los Sheets, que pone Ricardo como secretos de las Edge Functions. Nunca
 * se registran
 */
export function bankSyncDeps(onRun?: (runId: string | null) => void): BankSyncDeps {
  const { supabase } = readEnv();
  return {
    env: {
      appUrl: Deno.env.get('APP_URL'),
      serviceAccountKey: Deno.env.get('GOOGLE_SA_KEY'),
      sheetId: Deno.env.get('GOOGLE_BANK_SHEET_ID'),
      testSheetId: Deno.env.get('GOOGLE_BANK_TEST_SHEET_ID'),
    },
    log,
    authorizeAdmin: (authorization) => bankSyncAuthorizeViaRest(supabase, authorization),
    cronOk: (token) => bankSyncCronOkViaRest(supabase, token),
    store: restBankSyncStore(supabase),
    google: (key) =>
      createGoogleClient(key, {
        fetch,
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      }),
    waitUntil: (work) => {
      EdgeRuntime.waitUntil(work);
    },
    ...(onRun ? { onRun } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Correos, analítica y alertas de B15 (5.3 del plan de B15). Nada de esto manda algo sin sus llaves: sin
// RESEND_API_KEY y EMAIL_FROM no hay envío de correos, sin POSTHOG_PROJECT_KEY y POSTHOG_HOST no hay
// analítica del servidor y sin SENTRY_DSN no hay alertas. Las llaves las pone Ricardo como secretos de las
// Edge Functions y nunca se registran

/** Los nombres de 5.3 del plan de B15. Lo que no esté aquí no llega a las funciones nuevas */
const ENGAGEMENT_NAMES = [
  'APP_URL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'SUPPORT_EMAIL',
  'SENTRY_DSN',
  'POSTHOG_PROJECT_KEY',
  'POSTHOG_HOST',
] as const;
export type EngagementEnv = Partial<Record<(typeof ENGAGEMENT_NAMES)[number], string>>;

export function readEngagementEnv(): { env: EngagementEnv; supabase: SupabaseEnv } {
  const env: EngagementEnv = {};
  for (const name of ENGAGEMENT_NAMES) {
    const value = Deno.env.get(name)?.trim();
    if (value) env[name] = value;
  }
  return { env, supabase: readEnv().supabase };
}

/** Envío de correos con Resend (send-emails). Sin las llaves de Resend el envío queda en null */
export function sendEmailsDeps(): SendEmailsDeps {
  const { env, supabase } = readEngagementEnv();
  return {
    env: {
      appUrl: env.APP_URL,
      supabaseUrl: supabase.url === '' ? undefined : supabase.url,
      supportEmail: env.SUPPORT_EMAIL,
    },
    sender:
      env.RESEND_API_KEY && env.EMAIL_FROM
        ? createResendSender({
            apiKey: env.RESEND_API_KEY,
            from: env.EMAIL_FROM,
            replyTo: env.SUPPORT_EMAIL,
            fetch,
          })
        : null,
    tickOk: (token) => emailTickOkViaRest(supabase, token),
    claim: (limit) => claimEmailBatchViaRest(supabase, limit),
    recipients: (ids) => emailRecipientsViaRest(supabase, ids),
    finish: (result) => finishEmailViaRest(supabase, result),
    release: (id) => releaseEmailViaRest(supabase, id),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log,
    waitUntil: (work) => {
      EdgeRuntime.waitUntil(work);
    },
    // Un error del trabajo en segundo plano ya no lo ve la envoltura de la función, y se avisa aquí
    onError: (error) => {
      void captureException(monitoringDeps, 'send-emails', error);
    },
  };
}

/** La baja de los recordatorios (email-unsubscribe) */
export function emailUnsubscribeDeps(): UnsubscribeDeps {
  const { env, supabase } = readEngagementEnv();
  return {
    appUrl: env.APP_URL,
    unsubscribe: (token) => emailUnsubscribeViaRest(supabase, token),
    log,
  };
}

/** El envío de los eventos de dinero a PostHog (analytics-flush). Sin la llave y el host no manda nada */
export function analyticsFlushDeps(): AnalyticsFlushDeps {
  const { env, supabase } = readEngagementEnv();
  return {
    env: { projectKey: env.POSTHOG_PROJECT_KEY, host: env.POSTHOG_HOST },
    fetch,
    tickOk: (token) => analyticsTickOkViaRest(supabase, token),
    claim: (limit) => claimAnalyticsBatchViaRest(supabase, limit),
    finish: (ids, status) => finishAnalyticsBatchViaRest(supabase, ids, status),
    log,
  };
}

/** La prueba de alertas del admin (monitoring-test). Comprueba la sesión con admin_email_overview */
export function monitoringTestDeps(): MonitoringTestDeps {
  const { env, supabase } = readEngagementEnv();
  return {
    appUrl: env.APP_URL,
    adminOk: (authorization) => adminSessionOkViaRest(supabase, authorization),
    monitoring: monitoringDeps(),
  };
}

// Las demás funciones siguen importándolo de aquí. Vive en monitoringRuntime.ts para que las de IA no carguen este archivo
export { monitoringDeps } from './monitoringRuntime.ts';
