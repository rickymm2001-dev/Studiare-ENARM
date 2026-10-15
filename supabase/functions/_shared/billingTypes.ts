// Tipos y constantes de pagos que comparten las funciones (B10 del plan del cambio, 6.5 del diseño).
//
// Es el contrato entre los módulos de las funciones. payments.ts y stripe.ts (Stripe), mercadopago.ts
// (Mercado Pago), supabase.ts (llamadas a la base) y runtime.ts (dependencias de cada función) hablan
// con estos tipos. Las formas de ChargeNotice, SubscriptionNotice y CheckoutContext son las mismas que
// reciben y devuelven las funciones de la base (apply_charge, apply_subscription_state y
// checkout_context, migración 20261022000002), con los nombres en camelCase. Un cambio aquí se acuerda
// entre los dueños de los módulos. No depende de Deno, así se prueba con Vitest (D-096).

/** Versión fija de la API de Stripe. Toda llamada la manda y el endpoint del webhook usa la misma (8.1) */
export const STRIPE_API_VERSION = '2026-09-30.endive';

export type Provider = 'stripe' | 'mercadopago';
export type PaidPlan = 'founder' | 'founder_annual' | 'monthly' | 'annual';
export type PassPlan = 'monthly' | 'annual';
export type CheckoutMode = 'subscription' | 'pass';
export type PassMethod = 'oxxo' | 'spei' | 'mercadopago';
export type ChargeMethod = 'card' | 'oxxo' | 'spei' | 'mercadopago';
export type ChargeKind = 'paid' | 'pending' | 'failed' | 'expired' | 'refunded';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'ended';
export type CheckoutError =
  | 'invalid'
  | 'unauthorized'
  | 'not_configured'
  | 'provider'
  | 'already_subscribed'
  | 'pass_in_force'
  | 'founder_full'
  | 'founder_lost'
  | 'trial_mismatch';

/** Lo que manda la app a create-checkout. Sin mode cuenta como subscription (app vieja, 8.19) */
export interface CheckoutRequest {
  plan: PaidPlan;
  provider: Provider;
  mode?: CheckoutMode;
  method?: 'oxxo' | 'spei';
  expectTrial?: boolean;
}

/** Lo que la función manda a apply_charge, con los mismos nombres en snake_case y prefijo p_ */
export interface ChargeNotice {
  provider: Provider;
  eventId: string;
  payload: Record<string, unknown>;
  kind: ChargeKind;
  userId: string | null;
  /** En un reembolso la base usa el del cobro que encuentra */
  purpose: 'subscription' | 'pass';
  plan: PaidPlan | null;
  method: ChargeMethod | null;
  providerPaymentId: string | null;
  paymentIntentId: string | null;
  providerSubscriptionId: string | null;
  amountMxn: number | null;
  discountMxn: number | null;
  promotionCode: string | null;
  periodEnd: string | null;
  expiresAt: string | null;
}

/** Lo que la función manda a apply_subscription_state */
export interface SubscriptionNotice {
  provider: Provider;
  eventId: string;
  eventAt: string;
  payload: Record<string, unknown>;
  userId: string | null;
  subscriptionId: string;
  plan: PaidPlan | null;
  status: SubscriptionStatus;
  periodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledChange: boolean;
  priceId: string | null;
  promotionCode: string | null;
}

/** Lo que la función manda a note_trial_will_end */
export interface TrialEndingNotice {
  provider: Provider;
  eventId: string;
  payload: Record<string, unknown>;
  userId: string | null;
  subscriptionId: string;
  trialEnd: string | null;
}

/** La suscripción que guarda la base, como la devuelve checkout_context */
export interface CheckoutSubscription {
  plan: string;
  status: string;
  provider: Provider | null;
  /** sub_ de Stripe o id de la suscripción de Mercado Pago */
  subscriptionId: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Las banderas de lanzamiento que el servidor hace cumplir al abrir un pago. Son las de feature_flags en
 * platform_settings, la misma clave que lee la app, y solo el booleano true las prende. freeTrial no viene
 * aquí porque ya decide trialAvailable
 */
export interface CheckoutFlags {
  /** Pases de un solo pago con OXXO o SPEI en Stripe */
  cashPasses: boolean;
  /** Suscripción y pase con Mercado Pago */
  mercadoPago: boolean;
}

/** Respuesta de checkout_context, igual a 1.8 del diseño */
export interface CheckoutContext {
  inForce: 'subscription' | 'pass' | null;
  subscription: CheckoutSubscription | null;
  passEnd: string | null;
  trialAvailable: boolean;
  trialDays: number;
  founderOpen: boolean;
  founderSeatsLeft: number;
  founderLost: boolean;
  oxxoExpiresDays: number;
  /** El cliente de Stripe ligado a la cuenta */
  customerId: string | null;
  /** Sin el campo, como en una base sin la migración, las banderas cuentan como apagadas */
  flags?: CheckoutFlags;
}

/** Una acción con la pasarela que decidió la base, como la devuelve claim_billing_actions */
export interface BillingAction {
  id: string;
  provider: Provider;
  kind: 'cancel_subscription';
  /** Id de la suscripción en la pasarela */
  target: string;
  reason: 'trial_duplicate' | 'second_subscription' | 'founder_full' | 'refund';
  attempts: number;
}

/** Quién llamó, según el token de Supabase */
export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

/**
 * Secretos y variables de las funciones (2.6 del diseño). Los Price ID y las configuraciones del
 * portal no son secretos, pero viven aquí para no estar en el repo
 */
export interface FunctionEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_FOUNDER?: string;
  STRIPE_PRICE_FOUNDER_ANNUAL?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_ANNUAL?: string;
  STRIPE_PRICE_PASS_MONTHLY?: string;
  STRIPE_PRICE_PASS_ANNUAL?: string;
  STRIPE_PORTAL_CONFIG_FOUNDER?: string;
  STRIPE_PORTAL_CONFIG_REGULAR?: string;
  /**
   * Con true, Checkout calcula el impuesto con Stripe Tax y pide dirección y RFC opcional. Se deja
   * apagado hasta activar Stripe Tax en el panel y poner el domicilio fiscal, porque con Stripe Tax
   * sin configurar Stripe rechaza abrir el pago
   */
  STRIPE_AUTOMATIC_TAX?: string;
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
  /** Dirección pública de la app, con la que se arman las URL de regreso y el CORS */
  APP_URL?: string;
  /** Dirección pública de las funciones, para la notificación de Mercado Pago */
  FUNCTIONS_URL?: string;
}

/** Lo que exporta _shared/mercadopago.ts para payments.ts y runtime.ts */
export interface MercadoPagoCheckoutInput {
  user: AuthenticatedUser;
  plan: PassPlan;
  mode: CheckoutMode;
  context: CheckoutContext;
  env: { MERCADOPAGO_ACCESS_TOKEN?: string; APP_URL?: string; FUNCTIONS_URL?: string };
  fetch: typeof fetch;
  log: (line: string) => void;
}
export type MercadoPagoCheckoutResult =
  { ok: true; url: string } | { ok: false; error: CheckoutError };

/**
 * Dependencias del aviso de Mercado Pago (payment-webhook-mercadopago, paquete C). applyCharge y
 * applySubscriptionState aplican el cobro y el estado de la suscripción. claimBillingActions y
 * finishBillingAction ejecutan las acciones de Mercado Pago que deja la base, como cancelar una
 * suscripción reembolsada o una segunda suscripción (8.6). Sin ellas el aviso no ejecuta acciones
 */
export interface MercadoPagoWebhookDeps {
  env: FunctionEnv;
  fetch: typeof fetch;
  now: () => number;
  log: (line: string) => void;
  applyCharge: (notice: ChargeNotice) => Promise<string>;
  applySubscriptionState: (notice: SubscriptionNotice) => Promise<string>;
  /** claim_billing_actions solo de Mercado Pago. Lanza si la base falla */
  claimBillingActions?: (limit: number) => Promise<BillingAction[]>;
  /** finish_billing_action. Lanza si la base falla */
  finishBillingAction?: (result: {
    id: string;
    ok: boolean;
    error: string | null;
  }) => Promise<void>;
}

/** Dependencias de cancel-subscription, la cancelación de una suscripción de Mercado Pago (paquete C) */
export interface CancelSubscriptionDeps {
  env: FunctionEnv;
  fetch: typeof fetch;
  now: () => number;
  log: (line: string) => void;
  authenticate: (authorization: string | null) => Promise<AuthenticatedUser | null>;
  /** Lanza si la base falla */
  checkoutContext: (userId: string) => Promise<CheckoutContext>;
  applySubscriptionState: (notice: SubscriptionNotice) => Promise<string>;
}

/** Precios en pesos con IVA (1.2). Una prueba confirma que coinciden con los de la app y Stripe */
export const PLAN_PRICES_MXN: Record<PaidPlan, number> = {
  founder: 79,
  founder_annual: 749,
  monthly: 149,
  annual: 1499,
};

/** Precio de los pases de un solo pago, de 1 mes o de 1 año (1.7) */
export const PASS_PRICES_MXN: Record<PassPlan, number> = {
  monthly: 149,
  annual: 1499,
};

/** Nombre de cada plan como lo ve el alumno en la pasarela */
export const PLAN_TITLES: Record<PaidPlan, string> = {
  founder: 'Studiare. Plan Fundador',
  founder_annual: 'Studiare. Plan anual Fundador',
  monthly: 'Studiare. Plan mensual',
  annual: 'Studiare. Plan anual',
};

const PAID_PLANS = Object.keys(PLAN_PRICES_MXN) as PaidPlan[];
const PASS_PLANS = Object.keys(PASS_PRICES_MXN) as PassPlan[];

export const isPaidPlan = (value: unknown): value is PaidPlan =>
  typeof value === 'string' && (PAID_PLANS as string[]).includes(value);

export const isPassPlan = (value: unknown): value is PassPlan =>
  typeof value === 'string' && (PASS_PLANS as string[]).includes(value);

/** Los planes Fundador comparten los mismos 100 lugares (4.5) */
export const isFounderPlan = (value: unknown): value is 'founder' | 'founder_annual' =>
  value === 'founder' || value === 'founder_annual';

export const isProvider = (value: unknown): value is Provider =>
  value === 'stripe' || value === 'mercadopago';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);
