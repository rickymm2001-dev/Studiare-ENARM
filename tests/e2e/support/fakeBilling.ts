// Planes y pagos del Supabase simulado de las e2e de nube (B10 del plan del cambio, 5.5 del diseño).
// Sale de fakeSupabase.ts todo lo de planes y pagos. Imita lo que hacen la base (user_plan, my_plan v2,
// checkout_context, apply_charge, apply_subscription_state, request_invoice y las funciones del admin de
// las migraciones 20261022000001 a 20261022000003) y las funciones create-checkout, create-portal-session
// y cancel-subscription (supabase/functions/_shared), con los mismos códigos de respuesta. Guarda
// suscripciones con prueba y cambio programado, pases, pruebas por cuenta y por correo, lugares Fundador,
// pagos con método, estado, código y descuento, solicitudes de factura, la cola de correos y un reloj con
// desfase. La pasarela, el portal y Mercado Pago simulados (fakeGateway.ts y fakeMercadoPago.ts) solo
// llaman a esta interfaz, nunca a la red.
//
// El reloj de aquí solo mueve lo de pagos. Las sesiones, los dispositivos y los meses por referido siguen
// con la hora real, así adelantar una prueba no vence la sesión de la página.
import { randomUUID } from 'node:crypto';
import {
  PASS_PRICES_MXN,
  PLAN_PRICES_MXN,
  isFounderPlan,
  isPaidPlan,
  type BillingAction,
  type ChargeMethod,
  type ChargeNotice,
  type CheckoutContext,
  type CheckoutError,
  type CheckoutMode,
  type PaidPlan,
  type PassPlan,
  type Provider,
  type SubscriptionNotice,
} from '../../../supabase/functions/_shared/billingTypes.ts';
import { addMonths } from '../../../supabase/functions/_shared/mercadopago.ts';
import { parseCheckoutRequest } from '../../../supabase/functions/_shared/payments.ts';
import { oxxoExpiresAt } from '../../../supabase/functions/_shared/stripe.ts';

type Json = Record<string, unknown>;

export type { PaidPlan, PassPlan, Provider };
export type BillingPlan = 'free' | PaidPlan;
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type BillingIssue = 'founder_full' | 'trial_duplicate' | 'second_subscription';

/** Respuesta HTML o de redirección de una página simulada, con la forma que entiende fakeSupabase.ts */
export interface FakeReply {
  status: number;
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
}

/** Respuesta de una Edge Function, el cuerpo JSON y su estado */
export interface FunctionReply {
  status: number;
  body: Json;
}

/** Respuesta de una función de la base. El error lleva su SQLSTATE, como lo traduce PostgREST */
export type RpcResult =
  { ok: true; data: unknown } | { ok: false; code: string; message: string; detail?: string };

/** Quién llama, como lo dice su token */
export interface BillingUser {
  id: string;
  email: string | null;
}

export interface BillingSubscription {
  userId: string;
  plan: PaidPlan;
  status: SubscriptionStatus;
  provider: Provider;
  subscriptionId: string;
  periodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledChange: boolean;
  /** El plan al que baja al terminar el periodo, como el schedule que deja el portal de Stripe */
  scheduledPlan: PaidPlan | null;
  promotionCode: string | null;
  firstChargeAt: string | null;
  stateAt: string | null;
  issue: BillingIssue | null;
  issueAt: string | null;
}

export interface BillingPayment {
  id: string;
  userId: string;
  provider: Provider;
  providerPaymentId: string;
  amountMxn: number;
  status: 'paid' | 'pending' | 'expired' | 'needs_refund' | 'refunded';
  purpose: 'subscription' | 'pass';
  plan: PaidPlan | null;
  method: ChargeMethod | null;
  paymentIntentId: string | null;
  providerSubscriptionId: string | null;
  discountMxn: number | null;
  promotionCode: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  refundedAt: string | null;
  adminNote: string | null;
}

export interface BillingPass {
  id: string;
  userId: string;
  plan: PassPlan;
  provider: Provider;
  providerPaymentId: string;
  method: 'oxxo' | 'spei' | 'mercadopago';
  startsAt: string;
  endsAt: string;
  status: 'active' | 'refunded';
  createdAt: string;
}

export interface FounderSeat {
  userId: string | null;
  plan: 'founder' | 'founder_annual';
  status: 'held' | 'confirmed' | 'released';
  provider: Provider;
  subscriptionId: string | null;
}

export interface TrialClaim {
  userId: string;
  emailKey: string;
  provider: Provider;
  subscriptionId: string;
  plan: PaidPlan;
  status: 'started' | 'converted' | 'canceled' | 'voided';
  promotionCode: string | null;
  startedAt: string;
  endsAt: string | null;
}

export interface InvoiceRequest {
  id: string;
  userId: string;
  paymentId: string | null;
  rfc: string;
  legalName: string;
  taxRegime: string;
  postalCode: string;
  cfdiUse: string;
  email: string;
  status: 'pending' | 'issued' | 'rejected';
  adminNote: string | null;
  handledBy: string | null;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
}

export interface OutboxEmail {
  kind: 'trial_ending' | 'pass_expiring' | 'invoice_requested';
  dedupeKey: string;
  recipientUser: string | null;
  recipientRole: 'team' | null;
  data: Json;
  createdAt: string;
}

/** Una sesión de pago abierta por create-checkout, de Stripe o de Mercado Pago */
export interface FakeCheckout {
  id: string;
  userId: string;
  email: string | null;
  plan: PaidPlan;
  provider: Provider;
  mode: CheckoutMode;
  method: 'oxxo' | 'spei' | null;
  trial: boolean;
  trialDays: number;
  successUrl: string;
  cancelUrl: string;
  /** Regreso de un pago que queda pendiente, como una ficha OXXO o datos de SPEI */
  pendingUrl: string | null;
  status: 'open' | 'paid' | 'pending' | 'canceled';
  promotionCode: string | null;
  /** Id de la suscripción que crea al pagar, en Stripe sub_ y en Mercado Pago el preapproval */
  subscriptionId: string | null;
}

/** Una sesión del portal de facturación de Stripe */
export interface FakePortal {
  id: string;
  userId: string;
  flow: 'update' | 'cancel' | null;
  configuration: 'founder' | 'regular';
  returnUrl: string;
}

/** Un aviso de pago como lo recibía apply_payment_notice, para las pruebas de B7 */
export interface LegacyNotice {
  eventId: string;
  userId: string;
  plan: PaidPlan;
  provider: Provider;
  paymentId: string;
  amountMxn: number;
}

export interface BillingRules {
  trialDays: number;
  guaranteeDays: number;
  oxxoExpiresDays: number;
  passReminderDays: number;
}

/**
 * Lo que comparte el Supabase simulado con la pasarela, el portal y Mercado Pago simulados. Las
 * operaciones con id de alumno son las de la base y las funciones. fakeSupabase.ts pone encima las
 * ayudas por correo para las pruebas
 */
export interface FakeBilling {
  /** Hora del reloj de pagos, en milisegundos */
  now(): number;
  /** Adelanta el reloj de pagos. Encola el aviso de fin de prueba 3 días antes, como trial_will_end */
  advanceTime(ms: number): void;
  readonly rules: BillingRules;
  /** Lugares Fundador, como founder_seats en platform_settings */
  founderSeats: { total: number; open: boolean };
  /** Códigos de descuento válidos en la pasarela simulada, con su porcentaje */
  readonly promotionCodes: Map<string, number>;

  myPlan(userId: string): Json;
  userPlan(userId: string): BillingPlan;
  checkoutContext(userId: string): CheckoutContext;
  hasPaidCharge(userId: string): boolean;
  blocksAccountDeletion(userId: string): boolean;

  createCheckout(user: BillingUser, body: unknown): FunctionReply;
  createPortal(user: BillingUser, body: unknown): FunctionReply;
  cancelSubscription(user: BillingUser): FunctionReply;
  checkoutOf(id: string): FakeCheckout | undefined;
  portalOf(id: string): FakePortal | undefined;
  /** Pagar o empezar la prueba en la pasarela simulada. Devuelve a dónde regresa */
  completeCheckout(id: string, promotionCode: string | null): string;
  /** Cancelar en la pasarela simulada. Devuelve a dónde regresa */
  cancelCheckout(id: string): string;
  /** Cancelar al final del periodo desde el portal */
  portalCancel(portalId: string): void;
  /** El plan al que cambia el portal según su configuración, o null si no hay cambio posible */
  portalTarget(portalId: string): PaidPlan | null;
  /** Subir cobra hoy la diferencia, bajar se programa al final del periodo (2.3) */
  portalChangePlan(portalId: string): void;

  applyCharge(notice: ChargeNotice): string;
  applySubscriptionState(notice: SubscriptionNotice): string;
  /** apply_payment_notice de antes de B10, con su misma regla (20261019000001) */
  legacyNotice(notice: LegacyNotice): 'applied' | 'duplicate' | 'ignored';
  lastNoticeOf(userId: string): LegacyNotice | null;

  /** El fin de la prueba. charge cobra el primer periodo y cancel la termina sin cobro */
  endTrial(userId: string, outcome: 'charge' | 'cancel'): void;
  /** El fin del periodo. Renueva con el cambio programado o termina si estaba cancelada */
  endPeriod(userId: string): void;
  /** OXXO o Mercado Pago confirman la ficha pendiente, o vence sin pago */
  settleVoucher(userId: string, outcome: 'paid' | 'expired'): void;
  /** Llega la transferencia SPEI pendiente */
  fundTransfer(userId: string): void;

  subscriptionOf(userId: string): BillingSubscription | null;
  setSubscription(userId: string, row: BillingSubscription | null): void;
  paymentsOf(userId: string): BillingPayment[];
  passesOf(userId: string): BillingPass[];
  trialClaimOf(userId: string): TrialClaim | null;
  founderSeatsTaken(): number;
  readonly outbox: readonly OutboxEmail[];
  readonly actions: readonly BillingAction[];
  invoiceRequestsOf(userId: string): InvoiceRequest[];
  /** Borra lo de la cuenta, como el on delete cascade. El lugar Fundador queda sin dueño */
  forgetUser(userId: string): void;

  /** Filas de las tablas con permiso por fila. null es todas, para el admin */
  paymentRows(userId: string | null): Json[];
  passRows(userId: string | null): Json[];
  invoiceRows(userId: string | null): Json[];
  subscriptionRow(userId: string): Json | null;

  requestInvoice(userId: string, args: Json): RpcResult;
  adminInvoiceRequests(args: Json): RpcResult;
  adminSetInvoiceStatus(adminId: string, args: Json): RpcResult;
  adminBillingSummary(): RpcResult;
  adminRecentPayments(args: Json): RpcResult;
  adminMarkPaymentRefunded(args: Json): RpcResult;
  adminPromotionCodeStats(): RpcResult;
}

export interface FakeBillingOptions {
  /** Dirección pública de la app, para las URL de regreso */
  appUrl: string;
  /** Origen de la pasarela de Stripe simulada */
  gatewayOrigin: string;
  /** Origen del portal de Stripe simulado */
  portalOrigin: string;
  /** Origen de Mercado Pago simulado */
  mercadoPagoOrigin: string;
  founderSeats?: number;
  /** Fin del mes regalado por referido vigente, que vive en fakeSupabase.ts */
  grantEndOf: (userId: string) => string | null;
  /** El primer cobro mayor a 0 concreta el referido (complete_referral) */
  onPaidCharge: (userId: string) => void;
  aliasOf: (userId: string) => string | null;
  emailOf: (userId: string) => string | null;
}

const DAY_MS = 86_400_000;
const PASS_MONTHS: Record<PassPlan, number> = { monthly: 1, annual: 12 };
const PLAN_MONTHS: Record<PaidPlan, number> = {
  founder: 1,
  founder_annual: 12,
  monthly: 1,
  annual: 12,
};
const TAX_REGIMES = new Set(
  '601 603 605 606 607 608 610 611 612 614 615 616 620 621 622 623 624 625 626'.split(' '),
);
const CFDI_USES = new Set(
  'G01 G02 G03 I01 I02 I03 I04 I05 I06 I07 I08 D01 D02 D03 D04 D05 D06 D07 D08 D09 D10 S01 CP01 CN01'.split(
    ' ',
  ),
);

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (value: string | null) => (value === null ? null : Date.parse(value));
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const isYearly = (plan: PaidPlan) => plan === 'annual' || plan === 'founder_annual';
const regularOf = (plan: PaidPlan): PassPlan => (isYearly(plan) ? 'annual' : 'monthly');
const cents = (value: number) => Math.round(value * 100) / 100;

/** Si el cobro o el reembolso es de la suscripción de esa fila. Sin id de suscripción cuenta como suya */
const ownsSubscription = (
  row: BillingSubscription | null | undefined,
  subscriptionId: string | null,
): row is BillingSubscription => {
  if (!row) return false;
  return (subscriptionId ?? row.subscriptionId) === row.subscriptionId;
};

/** El correo como lo cuenta trial_email_key. Sin +algo y, en Gmail, sin puntos */
export function trialEmailKey(email: string): string {
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf('@');
  if (at < 0) return clean;
  let local = clean.slice(0, at).split('+')[0] ?? '';
  let domain = clean.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replaceAll('.', '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

const fail = (code: string, message: string, detail?: string): RpcResult => ({
  ok: false,
  code,
  message,
  ...(detail === undefined ? {} : { detail }),
});

export function createFakeBilling(options: FakeBillingOptions): FakeBilling {
  let offset = 0;
  let counter = 0;
  const now = () => Date.now() + offset;
  const stamp = () => iso(now());
  const nextId = (prefix: string) => `${prefix}_${String((counter += 1)).padStart(6, '0')}`;

  const rules: BillingRules = {
    trialDays: 7,
    guaranteeDays: 7,
    oxxoExpiresDays: 3,
    passReminderDays: 3,
  };
  const founderSeats = { total: options.founderSeats ?? 100, open: true };
  const promotionCodes = new Map<string, number>([['PRUEBA10', 10]]);

  const subscriptions = new Map<string, BillingSubscription>();
  const payments: BillingPayment[] = [];
  const passes: BillingPass[] = [];
  const seats: FounderSeat[] = [];
  const claims = new Map<string, TrialClaim>();
  const invoices: InvoiceRequest[] = [];
  const outbox: OutboxEmail[] = [];
  const actions: BillingAction[] = [];
  const events = new Set<string>();
  const customers = new Map<string, string>();
  const checkouts = new Map<string, FakeCheckout>();
  const portals = new Map<string, FakePortal>();
  const lastNotices = new Map<string, LegacyNotice>();

  // ------------------------------------------------------------------ reglas del plan (1.5 a 1.8)

  /** billing_in_force. Vigente es prueba, activa, cobro fallido o cancelada con periodo por delante */
  function inForce(row: BillingSubscription | null | undefined): row is BillingSubscription {
    if (!row) return false;
    const end = ms(row.periodEnd);
    if (end === null) return row.status === 'trialing' || row.status === 'active';
    return end > now();
  }

  const activePasses = (userId: string) =>
    passes.filter((pass) => pass.userId === userId && pass.status === 'active');

  /** Fin acumulado de los pases activos que no han vencido */
  function passEndOf(userId: string): string | null {
    const ends = activePasses(userId)
      .map((pass) => Date.parse(pass.endsAt))
      .filter((end) => end > now());
    return ends.length > 0 ? iso(Math.max(...ends)) : null;
  }

  function passNow(userId: string): BillingPass[] {
    return activePasses(userId).filter(
      (pass) => Date.parse(pass.startsAt) <= now() && Date.parse(pass.endsAt) > now(),
    );
  }

  function userPlan(userId: string): BillingPlan {
    const row = subscriptions.get(userId);
    if (inForce(row)) return row.plan;
    const current = passNow(userId);
    if (current.length > 0)
      return current.some((pass) => pass.plan === 'annual') ? 'annual' : 'monthly';
    return options.grantEndOf(userId) === null ? 'free' : 'monthly';
  }

  function hasPaidCharge(userId: string): boolean {
    return payments.some(
      (payment) =>
        payment.userId === userId &&
        payment.amountMxn > 0 &&
        ['paid', 'refunded', 'needs_refund'].includes(payment.status),
    );
  }

  const USED = new Set<TrialClaim['status']>(['started', 'converted', 'canceled']);

  function trialAlreadyUsed(userId: string): boolean {
    const own = claims.get(userId);
    if (own && USED.has(own.status)) return true;
    const email = options.emailOf(userId);
    if (email !== null) {
      const key = trialEmailKey(email);
      for (const claim of claims.values()) {
        if (claim.userId !== userId && claim.emailKey === key && USED.has(claim.status))
          return true;
      }
    }
    return hasPaidCharge(userId);
  }

  const trialAvailable = (userId: string) => rules.trialDays > 0 && !trialAlreadyUsed(userId);

  const seatsTaken = () =>
    seats.filter((seat) => seat.status === 'held' || seat.status === 'confirmed').length;
  const seatOf = (userId: string) => seats.find((seat) => seat.userId === userId);
  const founderOpen = () => founderSeats.open && founderSeats.total - seatsTaken() > 0;

  function myPlan(userId: string): Json {
    const plan = userPlan(userId);
    const row = subscriptions.get(userId) ?? null;
    const live = inForce(row);
    const passEnd = passEndOf(userId);
    const source =
      plan === 'free'
        ? 'none'
        : live && row.plan === plan
          ? 'payment'
          : passNow(userId).length > 0
            ? 'pass'
            : 'referral';
    const periodEnd =
      source === 'payment'
        ? (row?.periodEnd ?? null)
        : source === 'pass'
          ? passEnd
          : source === 'referral'
            ? options.grantEndOf(userId)
            : null;
    let guarantee: number | null = null;
    if (source === 'payment' && row?.firstChargeAt) {
      guarantee = Date.parse(row.firstChargeAt) + rules.guaranteeDays * DAY_MS;
    } else if (source === 'pass') {
      const paid = payments
        .filter((p) => p.userId === userId && p.purpose === 'pass' && p.status === 'paid')
        .map((p) => Date.parse(p.paidAt ?? p.createdAt));
      if (paid.length > 0) guarantee = Math.max(...paid) + rules.guaranteeDays * DAY_MS;
    }
    if (guarantee !== null && guarantee <= now()) guarantee = null;
    const pending = payments
      .filter(
        (p) =>
          p.userId === userId &&
          p.status === 'pending' &&
          p.purpose === 'pass' &&
          (p.method === 'oxxo' && p.expiresAt !== null
            ? Date.parse(p.expiresAt) > now()
            : Date.parse(p.createdAt) > now() - 7 * DAY_MS),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    let issue: string | null = null;
    if (row?.issue && row.issueAt && Date.parse(row.issueAt) > now() - 72 * 3_600_000) {
      issue = row.issue;
    } else {
      const expired = payments.find(
        (p) =>
          p.userId === userId &&
          p.purpose === 'pass' &&
          p.status === 'expired' &&
          Date.parse(p.expiresAt ?? p.createdAt) > now() - 72 * 3_600_000 &&
          !payments.some(
            (q) =>
              q.userId === userId &&
              q.purpose === 'pass' &&
              (q.status === 'pending' || q.status === 'paid') &&
              q.createdAt > p.createdAt,
          ),
      );
      if (expired) issue = 'voucher_expired';
    }
    return {
      plan,
      source,
      status: row?.status ?? 'none',
      provider: row?.provider ?? null,
      periodEnd,
      trialEnd: live && row.status === 'trialing' ? row.trialEndsAt : null,
      cancelAtPeriodEnd: live && row.cancelAtPeriodEnd,
      scheduledChange: live && row.scheduledChange,
      passEnd,
      trialAvailable: trialAvailable(userId),
      guaranteeUntil: guarantee === null ? null : iso(guarantee),
      pendingPayment: pending
        ? {
            method: pending.method,
            plan: pending.plan,
            amountMxn: pending.amountMxn,
            expiresAt: pending.expiresAt,
            createdAt: pending.createdAt,
          }
        : null,
      issue,
    };
  }

  function checkoutContext(userId: string): CheckoutContext {
    const row = subscriptions.get(userId) ?? null;
    const live = inForce(row);
    const passEnd = passEndOf(userId);
    const confirmed = seats.some((seat) => seat.userId === userId && seat.status === 'confirmed');
    return {
      inForce: live ? 'subscription' : passEnd !== null ? 'pass' : null,
      subscription: row
        ? {
            plan: row.plan,
            status: row.status,
            provider: row.provider,
            subscriptionId: row.subscriptionId,
            periodEnd: row.periodEnd,
            cancelAtPeriodEnd: row.cancelAtPeriodEnd,
          }
        : null,
      passEnd,
      trialAvailable: trialAvailable(userId),
      trialDays: Math.max(rules.trialDays, 0),
      founderOpen: founderOpen(),
      founderSeatsLeft: Math.max(founderSeats.total - seatsTaken(), 0),
      founderLost: confirmed && !(live && isFounderPlan(row.plan)),
      oxxoExpiresDays: Math.min(Math.max(rules.oxxoExpiresDays, 1), 7),
      customerId: customers.get(userId) ?? null,
    };
  }

  // ------------------------------------------------------------------ lugares, pruebas y acciones

  function queueCancel(provider: Provider, target: string, reason: BillingAction['reason']): void {
    if (actions.some((action) => action.provider === provider && action.target === target)) return;
    // La función de avisos la ejecuta enseguida. Aquí queda hecha, con la pasarela simulada
    actions.push({
      id: randomUUID(),
      provider,
      kind: 'cancel_subscription',
      target,
      reason,
      attempts: 1,
    });
  }

  function markIssue(userId: string, issue: BillingIssue, provider: Provider, subId: string): void {
    const row = subscriptions.get(userId);
    if (row) {
      row.issue = issue;
      row.issueAt = stamp();
      return;
    }
    // Sin fila, la suscripción rechazada queda terminada con su aviso, sin acceso
    subscriptions.set(userId, {
      userId,
      plan: 'monthly',
      status: 'canceled',
      provider,
      subscriptionId: subId,
      periodEnd: stamp(),
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      scheduledChange: false,
      scheduledPlan: null,
      promotionCode: null,
      firstChargeAt: null,
      stateAt: stamp(),
      issue,
      issueAt: stamp(),
    });
  }

  /** Aparta el lugar Fundador. false si ya no hay lugar */
  function holdSeat(userId: string, plan: PaidPlan, provider: Provider, subId: string): boolean {
    if (!isFounderPlan(plan)) return true;
    const mine = seatOf(userId);
    if (mine && mine.status !== 'released') return true;
    if (!founderOpen()) return false;
    if (mine) {
      Object.assign(mine, { status: 'held', plan, provider, subscriptionId: subId });
    } else {
      seats.push({ userId, plan, status: 'held', provider, subscriptionId: subId });
    }
    return true;
  }

  /** El disparador de subscriptions. Una suscripción Fundador sin lugar lo recibe */
  function syncSeat(row: BillingSubscription): void {
    if (!isFounderPlan(row.plan) || seatOf(row.userId)) return;
    seats.push({
      userId: row.userId,
      plan: row.plan,
      status: row.status === 'trialing' ? 'held' : 'confirmed',
      provider: row.provider,
      subscriptionId: row.subscriptionId,
    });
  }

  function releaseSeat(userId: string): void {
    const seat = seatOf(userId);
    if (seat && seat.status !== 'released') seat.status = 'released';
  }

  // ------------------------------------------------------------------ avisos

  function register(provider: Provider, eventId: string): boolean {
    const key = `${provider}:${eventId}`;
    if (events.has(key)) return false;
    events.add(key);
    return true;
  }

  function applySubscriptionState(notice: SubscriptionNotice): string {
    if (!register(notice.provider, notice.eventId)) return 'duplicate';
    const userId = notice.userId;
    if (userId === null) return 'unknown_user';
    const row = subscriptions.get(userId) ?? null;
    const same = row?.subscriptionId === notice.subscriptionId;
    if (same && row.stateAt !== null && Date.parse(notice.eventAt) < Date.parse(row.stateAt)) {
      return 'stale';
    }
    if (!same && inForce(row) && notice.status !== 'ended') {
      const issue: BillingIssue =
        notice.status === 'trialing' ? 'trial_duplicate' : 'second_subscription';
      markIssue(userId, issue, notice.provider, notice.subscriptionId);
      queueCancel(notice.provider, notice.subscriptionId, issue);
      return issue;
    }
    if (notice.status === 'ended') {
      if (!same) return 'ignored';
      row.status = 'canceled';
      row.periodEnd = iso(Math.min(ms(row.periodEnd) ?? now(), now()));
      row.stateAt = notice.eventAt;
      row.scheduledChange = false;
      row.scheduledPlan = null;
      if (row.firstChargeAt === null) releaseSeat(userId);
      const claim = claims.get(userId);
      if (claim?.subscriptionId === row.subscriptionId && claim.status === 'started') {
        claim.status = 'canceled';
      }
      return 'applied';
    }
    const plan = notice.plan ?? row?.plan ?? null;
    if (plan === null) return 'ignored';
    if (!same && notice.status === 'trialing') {
      if (trialAlreadyUsed(userId)) {
        markIssue(userId, 'trial_duplicate', notice.provider, notice.subscriptionId);
        queueCancel(notice.provider, notice.subscriptionId, 'trial_duplicate');
        return 'trial_duplicate';
      }
      if (!holdSeat(userId, plan, notice.provider, notice.subscriptionId)) {
        markIssue(userId, 'founder_full', notice.provider, notice.subscriptionId);
        queueCancel(notice.provider, notice.subscriptionId, 'founder_full');
        return 'founder_full';
      }
      const email = options.emailOf(userId) ?? `${userId}@sin-correo`;
      claims.set(userId, {
        userId,
        emailKey: trialEmailKey(email),
        provider: notice.provider,
        subscriptionId: notice.subscriptionId,
        plan,
        status: 'started',
        promotionCode: notice.promotionCode,
        startedAt: stamp(),
        endsAt: notice.trialEnd,
      });
    }
    const priceChanged = same && row.plan !== plan;
    const next: BillingSubscription = {
      userId,
      plan,
      status: notice.status,
      provider: notice.provider,
      subscriptionId: notice.subscriptionId,
      // Un aviso de estado no alarga el periodo. Solo la prueba y los cobros lo hacen
      periodEnd:
        notice.status === 'trialing'
          ? (notice.trialEnd ?? notice.periodEnd)
          : same
            ? row.periodEnd
            : null,
      trialEndsAt: notice.trialEnd ?? (same ? row.trialEndsAt : null),
      cancelAtPeriodEnd: notice.cancelAtPeriodEnd,
      scheduledChange: priceChanged ? false : notice.scheduledChange,
      scheduledPlan: priceChanged || !notice.scheduledChange ? null : (row?.scheduledPlan ?? null),
      promotionCode: notice.promotionCode ?? (same ? row.promotionCode : null),
      firstChargeAt: same ? row.firstChargeAt : null,
      stateAt: notice.eventAt,
      issue: row?.issue ?? null,
      issueAt: row?.issueAt ?? null,
    };
    subscriptions.set(userId, next);
    syncSeat(next);
    const seat = seatOf(userId);
    if (seat && isFounderPlan(plan) && seat.status !== 'released') seat.plan = plan;
    return 'applied';
  }

  function findPayment(provider: Provider, id: string | null): BillingPayment | undefined {
    if (id === null) return undefined;
    return payments.find(
      (payment) =>
        payment.provider === provider &&
        (payment.providerPaymentId === id || payment.paymentIntentId === id),
    );
  }

  function refund(payment: BillingPayment, note: string | null): void {
    payment.status = 'refunded';
    payment.refundedAt = stamp();
    if (note !== null) payment.adminNote = note;
    if (payment.purpose === 'pass') {
      const pass = passes.find(
        (item) =>
          item.provider === payment.provider &&
          item.providerPaymentId === payment.providerPaymentId,
      );
      if (pass) pass.status = 'refunded';
      return;
    }
    const row = subscriptions.get(payment.userId);
    if (ownsSubscription(row, payment.providerSubscriptionId)) {
      // Un reembolso completo quita el plan y la base deja la acción de cancelarla (D-106, 8.6)
      row.status = 'canceled';
      row.periodEnd = stamp();
      queueCancel(row.provider, row.subscriptionId, 'refund');
      const charged = payments.filter(
        (item) =>
          item.userId === row.userId &&
          item.providerSubscriptionId === row.subscriptionId &&
          item.amountMxn > 0 &&
          item.status === 'paid',
      );
      // El único cobro de un Fundador devuelto libera su lugar (8.5)
      if (charged.length === 0 && isFounderPlan(row.plan)) releaseSeat(row.userId);
    }
  }

  function applyCharge(notice: ChargeNotice): string {
    if (!register(notice.provider, notice.eventId)) return 'duplicate';
    if (notice.kind === 'refunded') {
      const payment =
        findPayment(notice.provider, notice.providerPaymentId) ??
        findPayment(notice.provider, notice.paymentIntentId);
      if (!payment) return 'ignored';
      if (payment.status !== 'refunded') refund(payment, null);
      return 'applied';
    }
    const userId = notice.userId;
    if (userId === null) return 'unknown_user';
    const row = subscriptions.get(userId) ?? null;

    if (notice.kind === 'failed') {
      if (ownsSubscription(row, notice.providerSubscriptionId)) {
        row.status = 'past_due';
      }
      return 'applied';
    }
    if (notice.kind === 'expired') {
      const pending = findPayment(notice.provider, notice.providerPaymentId);
      if (pending?.status !== 'pending') return 'ignored';
      pending.status = 'expired';
      pending.expiresAt = pending.expiresAt ?? stamp();
      return 'applied';
    }
    const existing = findPayment(notice.provider, notice.providerPaymentId);
    const amount = notice.amountMxn ?? 0;
    const base = (): BillingPayment => ({
      id: randomUUID(),
      userId,
      provider: notice.provider,
      providerPaymentId: notice.providerPaymentId ?? nextId('pay'),
      amountMxn: amount,
      status: 'pending',
      purpose: notice.purpose,
      plan: notice.plan,
      method: notice.method,
      paymentIntentId: notice.paymentIntentId,
      providerSubscriptionId: notice.providerSubscriptionId,
      discountMxn: notice.discountMxn,
      promotionCode: notice.promotionCode,
      createdAt: stamp(),
      paidAt: null,
      expiresAt: notice.expiresAt,
      refundedAt: null,
      adminNote: null,
    });

    if (notice.kind === 'pending') {
      if (existing) return 'duplicate';
      payments.push(base());
      return 'applied';
    }

    // Cobro pagado
    if (notice.purpose === 'pass') {
      if (existing && existing.status !== 'pending') return 'duplicate';
      const payment = existing ?? base();
      if (!existing) payments.push(payment);
      payment.status = 'paid';
      payment.paidAt = stamp();
      payment.promotionCode ??= notice.promotionCode;
      payment.discountMxn ??= notice.discountMxn;
      const plan: PassPlan = notice.plan === null ? 'monthly' : regularOf(notice.plan);
      const lastEnd = activePasses(userId)
        .map((pass) => Date.parse(pass.endsAt))
        .reduce((max, end) => Math.max(max, end), now());
      const startsAt = iso(Math.max(lastEnd, now()));
      passes.push({
        id: randomUUID(),
        userId,
        plan,
        provider: notice.provider,
        providerPaymentId: payment.providerPaymentId,
        method:
          payment.method === 'oxxo' || payment.method === 'spei' ? payment.method : 'mercadopago',
        startsAt,
        endsAt: addMonths(startsAt, PASS_MONTHS[plan]),
        status: 'active',
        createdAt: stamp(),
      });
      if (payment.amountMxn > 0) options.onPaidCharge(userId);
      return 'applied';
    }

    if (existing) return 'duplicate';
    const payment = base();
    payment.status = 'paid';
    payment.paidAt = stamp();
    payments.push(payment);
    const sameSub =
      row !== null &&
      (notice.providerSubscriptionId === null ||
        row.subscriptionId === notice.providerSubscriptionId);
    if (row && !sameSub && inForce(row)) {
      // El cobro de una segunda suscripción que D-118 no alcanzó a frenar se devuelve
      payment.status = 'needs_refund';
      return 'applied';
    }
    if (row && sameSub) {
      payment.plan = row.plan;
      const end = ms(notice.periodEnd);
      if (end !== null) row.periodEnd = iso(Math.max(ms(row.periodEnd) ?? 0, end));
      if (row.status === 'past_due') row.status = 'active';
      if (payment.discountMxn !== null && payment.discountMxn > 0) {
        payment.promotionCode ??= row.promotionCode;
      }
    } else {
      const plan = notice.plan ?? 'monthly';
      const next: BillingSubscription = {
        userId,
        plan,
        status: 'active',
        provider: notice.provider,
        subscriptionId: notice.providerSubscriptionId ?? nextId('sub_fake'),
        periodEnd: notice.periodEnd,
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
        scheduledChange: false,
        scheduledPlan: null,
        promotionCode: notice.promotionCode,
        firstChargeAt: null,
        stateAt: stamp(),
        issue: null,
        issueAt: null,
      };
      subscriptions.set(userId, next);
      syncSeat(next);
    }
    const current = subscriptions.get(userId);
    if (amount > 0 && current?.firstChargeAt === null) {
      current.firstChargeAt = stamp();
      const claim = claims.get(userId);
      if (claim?.subscriptionId === current.subscriptionId && claim.status === 'started') {
        claim.status = 'converted';
      }
      // El primer cobro confirma el lugar Fundador, también el de una prueba que ya se había liberado
      if (isFounderPlan(current.plan)) {
        const seat = seatOf(userId);
        if (seat) Object.assign(seat, { status: 'confirmed', plan: current.plan });
        else syncSeat(current);
      }
    }
    if (amount > 0) options.onPaidCharge(userId);
    return 'applied';
  }

  function legacyNotice(notice: LegacyNotice): 'applied' | 'duplicate' | 'ignored' {
    if (!register(notice.provider, notice.eventId)) return 'duplicate';
    lastNotices.set(notice.userId, notice);
    if (notice.amountMxn <= 0) return 'ignored';
    const result = applyCharge({
      provider: notice.provider,
      eventId: `${notice.eventId}:cobro`,
      payload: {},
      kind: 'paid',
      userId: notice.userId,
      purpose: 'subscription',
      plan: notice.plan,
      method: 'card',
      providerPaymentId: notice.paymentId,
      paymentIntentId: null,
      providerSubscriptionId: subscriptions.get(notice.userId)?.subscriptionId ?? null,
      amountMxn: notice.amountMxn,
      discountMxn: null,
      promotionCode: null,
      periodEnd: addMonths(stamp(), PLAN_MONTHS[notice.plan]),
      expiresAt: null,
    });
    return result === 'duplicate' ? 'duplicate' : 'applied';
  }

  // ------------------------------------------------------------------ crear el pago

  const subscriptionUrl = (params: Record<string, string> = {}) => {
    const target = new URL(options.appUrl);
    target.pathname = `${target.pathname.replace(/\/+$/, '')}/suscripcion`;
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
    return target.toString();
  };

  const CHECKOUT_STATUS: Record<CheckoutError, number> = {
    invalid: 400,
    unauthorized: 401,
    already_subscribed: 409,
    pass_in_force: 409,
    founder_full: 409,
    founder_lost: 409,
    trial_mismatch: 409,
    provider: 502,
    not_configured: 503,
  };
  const checkoutFail = (error: CheckoutError, extra: Json = {}): FunctionReply => ({
    status: CHECKOUT_STATUS[error],
    body: { error, ...extra },
  });

  /** create-checkout v2 con las reglas de 2.2, en el mismo orden que la función real */
  function createCheckout(user: BillingUser, body: unknown): FunctionReply {
    const ask = parseCheckoutRequest(body);
    if (!ask) return checkoutFail('invalid');
    const mode: CheckoutMode = ask.mode ?? 'subscription';
    const context = checkoutContext(user.id);
    if (context.inForce === 'subscription') return checkoutFail('already_subscribed');
    if (mode === 'subscription' && context.inForce === 'pass') {
      return checkoutFail('pass_in_force', { passEnd: context.passEnd });
    }
    if (isFounderPlan(ask.plan)) {
      if (context.founderLost) return checkoutFail('founder_lost');
      if (!context.founderOpen) return checkoutFail('founder_full');
    }
    const trial =
      mode === 'subscription' &&
      ask.provider === 'stripe' &&
      context.trialAvailable &&
      context.trialDays > 0;
    if (ask.expectTrial !== undefined && ask.expectTrial !== trial) {
      return checkoutFail('trial_mismatch', { trialAvailable: trial });
    }
    if (ask.provider === 'stripe' && !customers.has(user.id)) {
      customers.set(user.id, nextId('cus_fake'));
    }
    const id =
      ask.provider === 'stripe'
        ? nextId(mode === 'subscription' ? 'cs_test_sub' : 'cs_test_pase')
        : randomUUID().replaceAll('-', '');
    const method = mode === 'pass' && ask.provider === 'stripe' ? (ask.method ?? 'oxxo') : null;
    const checkout: FakeCheckout = {
      id,
      userId: user.id,
      email: user.email,
      plan: ask.plan,
      provider: ask.provider,
      mode,
      method,
      trial,
      trialDays: trial ? context.trialDays : 0,
      successUrl:
        mode === 'pass' && method !== null
          ? subscriptionUrl({ pago: 'pendiente', metodo: method })
          : subscriptionUrl({ pago: 'ok' }),
      cancelUrl: subscriptionUrl({ pago: 'cancelado' }),
      pendingUrl:
        ask.provider === 'mercadopago' && mode === 'pass'
          ? subscriptionUrl({ pago: 'pendiente', metodo: 'mercadopago' })
          : method === null
            ? null
            : subscriptionUrl({ pago: 'pendiente', metodo: method }),
      status: 'open',
      promotionCode: null,
      subscriptionId: null,
    };
    checkouts.set(id, checkout);
    const url =
      ask.provider === 'stripe'
        ? `${options.gatewayOrigin}/c/pay/${id}`
        : mode === 'subscription'
          ? `${options.mercadoPagoOrigin}/subscriptions/checkout?preapproval_id=${id}`
          : `${options.mercadoPagoOrigin}/checkout/v1/redirect?pref_id=${id}`;
    return { status: 200, body: { url, mode, trial } };
  }

  /** El precio con el código aplicado, en pesos con centavos */
  function discountFor(price: number, code: string | null): number {
    const percent = code === null ? 0 : (promotionCodes.get(code) ?? 0);
    return cents((price * percent) / 100);
  }

  /** El botón de la pasarela de Stripe simulada. Crea la suscripción o el pendiente del pase */
  function completeCheckout(id: string, rawCode: string | null): string {
    const checkout = checkouts.get(id);
    if (!checkout) throw new Error(`Sesión de pago desconocida ${id}`);
    if (checkout.status !== 'open') return checkout.successUrl;
    const code = rawCode?.trim().toUpperCase() ?? '';
    checkout.promotionCode = code !== '' && promotionCodes.has(code) ? code : null;
    const eventAt = stamp();
    if (checkout.mode === 'pass') {
      const price = PASS_PRICES_MXN[regularOf(checkout.plan)];
      const discount = discountFor(price, checkout.promotionCode);
      applyCharge({
        provider: checkout.provider,
        eventId: `evt_${checkout.id}:pendiente`,
        payload: {},
        kind: 'pending',
        userId: checkout.userId,
        purpose: 'pass',
        plan: regularOf(checkout.plan),
        method: checkout.method ?? 'oxxo',
        providerPaymentId: `pi_${checkout.id}`,
        paymentIntentId: `pi_${checkout.id}`,
        providerSubscriptionId: null,
        amountMxn: cents(price - discount),
        discountMxn: discount > 0 ? discount : null,
        promotionCode: checkout.promotionCode,
        periodEnd: null,
        expiresAt: checkout.method === 'oxxo' ? oxxoExpiresAt(now(), rules.oxxoExpiresDays) : null,
      });
      checkout.status = 'pending';
      return checkout.successUrl;
    }
    const subscriptionId = nextId('sub_fake');
    checkout.subscriptionId = subscriptionId;
    if (checkout.trial) {
      const trialEnd = iso(now() + checkout.trialDays * DAY_MS);
      applySubscriptionState({
        provider: 'stripe',
        eventId: `evt_${checkout.id}`,
        eventAt,
        payload: {},
        userId: checkout.userId,
        subscriptionId,
        plan: checkout.plan,
        status: 'trialing',
        periodEnd: trialEnd,
        trialEnd,
        cancelAtPeriodEnd: false,
        scheduledChange: false,
        priceId: `price_fake_${checkout.plan}`,
        promotionCode: checkout.promotionCode,
      });
      // La factura de 0 pesos de la prueba no es un cobro
      lastNotices.set(checkout.userId, {
        eventId: `evt_${checkout.id}:factura`,
        userId: checkout.userId,
        plan: checkout.plan,
        provider: 'stripe',
        paymentId: `in_${checkout.id}`,
        amountMxn: 0,
      });
    } else {
      const price = PLAN_PRICES_MXN[checkout.plan];
      const discount = discountFor(price, checkout.promotionCode);
      applySubscriptionState({
        provider: 'stripe',
        eventId: `evt_${checkout.id}`,
        eventAt,
        payload: {},
        userId: checkout.userId,
        subscriptionId,
        plan: checkout.plan,
        status: 'active',
        periodEnd: addMonths(eventAt, PLAN_MONTHS[checkout.plan]),
        trialEnd: null,
        cancelAtPeriodEnd: false,
        scheduledChange: false,
        priceId: `price_fake_${checkout.plan}`,
        promotionCode: checkout.promotionCode,
      });
      chargeSubscription(checkout.userId, {
        eventId: `evt_${checkout.id}:cobro`,
        paymentId: `in_${checkout.id}`,
        amount: cents(price - discount),
        discount,
        code: checkout.promotionCode,
        periodEnd: addMonths(eventAt, PLAN_MONTHS[checkout.plan]),
      });
    }
    checkout.status = 'paid';
    return checkout.successUrl;
  }

  /** Un cobro de la suscripción vigente de Stripe, como invoice.paid */
  function chargeSubscription(
    userId: string,
    input: {
      eventId: string;
      paymentId: string;
      amount: number;
      discount: number;
      code: string | null;
      periodEnd: string;
    },
  ): void {
    const row = subscriptions.get(userId);
    if (!row) return;
    applyCharge({
      provider: row.provider,
      eventId: input.eventId,
      payload: {},
      kind: 'paid',
      userId,
      purpose: 'subscription',
      plan: row.plan,
      method: row.provider === 'stripe' ? 'card' : 'mercadopago',
      providerPaymentId: input.paymentId,
      paymentIntentId: null,
      providerSubscriptionId: row.subscriptionId,
      amountMxn: input.amount,
      discountMxn: input.discount > 0 ? input.discount : null,
      promotionCode: input.code,
      periodEnd: input.periodEnd,
      expiresAt: null,
    });
    lastNotices.set(userId, {
      eventId: input.eventId,
      userId,
      plan: row.plan,
      provider: row.provider,
      paymentId: input.paymentId,
      amountMxn: input.amount,
    });
  }

  function cancelCheckout(id: string): string {
    const checkout = checkouts.get(id);
    if (!checkout) throw new Error(`Sesión de pago desconocida ${id}`);
    if (checkout.status === 'open') checkout.status = 'canceled';
    return checkout.cancelUrl;
  }

  // ------------------------------------------------------------------ portal y Mercado Pago

  function createPortal(user: BillingUser, body: unknown): FunctionReply {
    const raw = body === null || body === undefined ? {} : (body as Json);
    const flow = raw.flow ?? null;
    if (flow !== null && flow !== 'update' && flow !== 'cancel') {
      return { status: 400, body: { error: 'invalid' } };
    }
    const context = checkoutContext(user.id);
    const row = subscriptions.get(user.id) ?? null;
    const live = context.inForce === 'subscription' && row !== null;
    if (live && row.provider === 'mercadopago')
      return { status: 409, body: { error: 'mercadopago' } };
    if (!customers.has(user.id)) return { status: 404, body: { error: 'no_customer' } };
    const portal: FakePortal = {
      id: nextId('bps_fake'),
      userId: user.id,
      flow: live ? flow : null,
      configuration: row && isFounderPlan(row.plan) ? 'founder' : 'regular',
      returnUrl: subscriptionUrl(),
    };
    portals.set(portal.id, portal);
    return { status: 200, body: { url: `${options.portalOrigin}/p/session/${portal.id}` } };
  }

  function portalRow(portalId: string): BillingSubscription | null {
    const portal = portals.get(portalId);
    if (!portal) throw new Error(`Sesión del portal desconocida ${portalId}`);
    const row = subscriptions.get(portal.userId);
    return inForce(row) ? row : null;
  }

  function portalTarget(portalId: string): PaidPlan | null {
    const row = portalRow(portalId);
    if (row?.provider !== 'stripe' || row.cancelAtPeriodEnd) return null;
    const portal = portals.get(portalId);
    // Cada configuración lista solo sus dos precios (2.3)
    if (portal?.configuration === 'founder') {
      return row.plan === 'founder' ? 'founder_annual' : 'founder';
    }
    return isYearly(row.plan) ? 'monthly' : 'annual';
  }

  function stateOf(row: BillingSubscription, patch: Partial<SubscriptionNotice>, tag: string) {
    const notice: SubscriptionNotice = {
      provider: row.provider,
      eventId: `evt_${tag}_${String((counter += 1))}`,
      eventAt: stamp(),
      payload: {},
      userId: row.userId,
      subscriptionId: row.subscriptionId,
      plan: row.plan,
      status: row.status,
      periodEnd: row.periodEnd,
      trialEnd: row.trialEndsAt,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      scheduledChange: row.scheduledChange,
      priceId: `price_fake_${row.plan}`,
      promotionCode: row.promotionCode,
      ...patch,
    };
    return applySubscriptionState(notice);
  }

  function portalCancel(portalId: string): void {
    const row = portalRow(portalId);
    if (row) stateOf(row, { cancelAtPeriodEnd: true, scheduledChange: false }, 'portal_cancelar');
  }

  function portalChangePlan(portalId: string): void {
    const row = portalRow(portalId);
    const target = portalTarget(portalId);
    if (!row || target === null) return;
    // En la prueba el cambio conserva los días gratis (continue_trial, 8.17)
    if (row.status === 'trialing') {
      stateOf(row, { plan: target, priceId: `price_fake_${target}` }, 'portal_cambio');
      return;
    }
    if (isYearly(target) && !isYearly(row.plan)) {
      // Subir cobra hoy la diferencia, con el crédito de lo que no se usó del mes (always_invoice)
      const end = ms(row.periodEnd) ?? now();
      const start = Date.parse(addMonths(iso(end), -PLAN_MONTHS[row.plan]));
      const left = Math.min(Math.max((end - now()) / Math.max(end - start, 1), 0), 1);
      const amount = cents(PLAN_PRICES_MXN[target] - PLAN_PRICES_MXN[row.plan] * left);
      stateOf(
        row,
        { plan: target, priceId: `price_fake_${target}`, scheduledChange: false },
        'portal_subir',
      );
      chargeSubscription(row.userId, {
        eventId: `evt_portal_subir_cobro_${String((counter += 1))}`,
        paymentId: nextId('in_prorrateo'),
        amount,
        discount: 0,
        code: null,
        // El nuevo periodo anual empieza hoy
        periodEnd: addMonths(stamp(), PLAN_MONTHS[target]),
      });
      return;
    }
    // Bajar se programa para el fin del periodo
    stateOf(row, { scheduledChange: true }, 'portal_bajar');
    const current = subscriptions.get(row.userId);
    if (current) current.scheduledPlan = target;
  }

  /** cancel-subscription. Cancela la suscripción de Mercado Pago y vale hasta el fin de lo pagado */
  function cancelSubscription(user: BillingUser): FunctionReply {
    const context = checkoutContext(user.id);
    const subscription = context.subscription;
    const row = subscriptions.get(user.id);
    if (subscription?.provider !== 'mercadopago' || !row || !isPaidPlan(subscription.plan)) {
      return { status: 404, body: { error: 'no_subscription' } };
    }
    const done = { status: 'canceled', periodEnd: subscription.periodEnd };
    if (subscription.status === 'canceled') return { status: 200, body: done };
    if (!['trialing', 'active', 'past_due'].includes(subscription.status)) {
      return { status: 404, body: { error: 'no_subscription' } };
    }
    applySubscriptionState({
      provider: 'mercadopago',
      eventId: `cancel:${row.subscriptionId}`,
      eventAt: stamp(),
      payload: { id: row.subscriptionId, status: 'cancelled', source: 'cancel-subscription' },
      userId: user.id,
      subscriptionId: row.subscriptionId,
      plan: row.plan,
      status: 'canceled',
      periodEnd: null,
      trialEnd: null,
      cancelAtPeriodEnd: true,
      scheduledChange: false,
      priceId: null,
      promotionCode: null,
    });
    return { status: 200, body: done };
  }

  // ------------------------------------------------------------------ ayudas de las pruebas

  function advanceTime(delta: number): void {
    offset += Math.max(0, delta);
    // trial_will_end llega 3 días antes del fin de la prueba (note_trial_will_end)
    for (const row of subscriptions.values()) {
      const end = ms(row.trialEndsAt);
      if (row.status !== 'trialing' || row.cancelAtPeriodEnd || end === null) continue;
      if (end - 3 * DAY_MS > now()) continue;
      const key = `trial_ending:${row.subscriptionId}:${row.trialEndsAt ?? ''}`;
      if (outbox.some((mail) => mail.dedupeKey === key)) continue;
      outbox.push({
        kind: 'trial_ending',
        dedupeKey: key,
        recipientUser: row.userId,
        recipientRole: null,
        data: { plan: row.plan, trialEnd: row.trialEndsAt, amountMxn: PLAN_PRICES_MXN[row.plan] },
        createdAt: stamp(),
      });
    }
  }

  const moveTo = (target: number) => {
    if (target > now()) advanceTime(target - now() + 1000);
  };

  function endTrial(userId: string, outcome: 'charge' | 'cancel'): void {
    const row = subscriptions.get(userId);
    if (row?.status !== 'trialing' || row.trialEndsAt === null) {
      throw new Error(`La cuenta ${userId} no está en prueba`);
    }
    const trialEnd = row.trialEndsAt;
    moveTo(Date.parse(trialEnd));
    if (outcome === 'cancel' || row.cancelAtPeriodEnd) {
      stateOf(row, { status: 'ended' }, 'fin_prueba');
      return;
    }
    stateOf(row, { status: 'active', trialEnd: null }, 'fin_prueba');
    const price = PLAN_PRICES_MXN[row.plan];
    const discount = discountFor(price, row.promotionCode);
    chargeSubscription(userId, {
      eventId: `evt_primer_cobro_${row.subscriptionId}`,
      paymentId: `in_primer_cobro_${row.subscriptionId}`,
      amount: cents(price - discount),
      discount,
      code: discount > 0 ? row.promotionCode : null,
      periodEnd: addMonths(trialEnd, PLAN_MONTHS[row.plan]),
    });
  }

  function endPeriod(userId: string): void {
    const row = subscriptions.get(userId);
    if (!row?.periodEnd) throw new Error(`La cuenta ${userId} no tiene un periodo que termine`);
    const periodEnd = row.periodEnd;
    moveTo(Date.parse(periodEnd));
    if (row.cancelAtPeriodEnd || row.status === 'canceled') {
      stateOf(row, { status: 'ended' }, 'fin_periodo');
      return;
    }
    const plan = row.scheduledPlan ?? row.plan;
    stateOf(
      row,
      { status: 'active', plan, priceId: `price_fake_${plan}`, scheduledChange: false },
      'renovacion',
    );
    chargeSubscription(userId, {
      eventId: `evt_renovacion_${String((counter += 1))}`,
      paymentId: nextId('in_renovacion'),
      amount: PLAN_PRICES_MXN[plan],
      discount: 0,
      code: null,
      periodEnd: addMonths(periodEnd, PLAN_MONTHS[plan]),
    });
  }

  function latestPending(userId: string, methods: readonly string[]): BillingPayment {
    const pending = payments
      .filter(
        (payment) =>
          payment.userId === userId &&
          payment.status === 'pending' &&
          methods.includes(payment.method ?? ''),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!pending) throw new Error(`La cuenta ${userId} no tiene un pago pendiente`);
    return pending;
  }

  function settle(payment: BillingPayment, outcome: 'paid' | 'expired'): void {
    applyCharge({
      provider: payment.provider,
      eventId: `evt_${payment.providerPaymentId}:${outcome}`,
      payload: {},
      kind: outcome,
      userId: payment.userId,
      purpose: 'pass',
      plan: outcome === 'paid' ? payment.plan : null,
      method: payment.method,
      providerPaymentId: payment.providerPaymentId,
      paymentIntentId: payment.paymentIntentId,
      providerSubscriptionId: null,
      amountMxn: payment.amountMxn,
      discountMxn: payment.discountMxn,
      promotionCode: payment.promotionCode,
      periodEnd: null,
      expiresAt: null,
    });
  }

  function settleVoucher(userId: string, outcome: 'paid' | 'expired'): void {
    const pending = latestPending(userId, ['oxxo', 'mercadopago']);
    if (outcome === 'expired' && pending.expiresAt !== null) moveTo(Date.parse(pending.expiresAt));
    settle(pending, outcome);
  }

  function fundTransfer(userId: string): void {
    settle(latestPending(userId, ['spei']), 'paid');
  }

  // ------------------------------------------------------------------ facturas

  function requestInvoice(userId: string, args: Json): RpcResult {
    const paymentId = asString(args.p_payment);
    const rfc = (asString(args.p_rfc) ?? '').replace(/[\s-]/g, '').toUpperCase();
    const legalName = (asString(args.p_legal_name) ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
    const regime = (asString(args.p_tax_regime) ?? '').trim();
    const postal = (asString(args.p_postal_code) ?? '').trim();
    const use = (asString(args.p_cfdi_use) ?? '').trim().toUpperCase();
    const email = (asString(args.p_email) ?? '').trim().toLowerCase();
    if (paymentId === null) return fail('IV001', 'Elige el pago', 'payment');
    if (!/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(rfc))
      return fail('IV001', 'Revisa el RFC', 'rfc');
    if (legalName.length < 1 || legalName.length > 254) {
      return fail('IV001', 'Revisa la razón social', 'legal_name');
    }
    if (!TAX_REGIMES.has(regime)) return fail('IV001', 'Revisa el régimen fiscal', 'tax_regime');
    if (!/^[0-9]{5}$/.test(postal)) return fail('IV001', 'Revisa el código postal', 'postal_code');
    if (!CFDI_USES.has(use)) return fail('IV001', 'Revisa el uso del CFDI', 'cfdi_use');
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return fail('IV001', 'Revisa el correo', 'email');
    }
    const payment = payments.find(
      (item) =>
        item.id === paymentId &&
        item.userId === userId &&
        item.status === 'paid' &&
        item.amountMxn > 0,
    );
    if (!payment) return fail('IV002', 'Ese pago no se puede facturar');
    if (invoices.some((item) => item.paymentId === paymentId && item.status !== 'rejected')) {
      return fail('IV003', 'Ya pediste factura de este pago');
    }
    const request: InvoiceRequest = {
      id: randomUUID(),
      userId,
      paymentId,
      rfc,
      legalName,
      taxRegime: regime,
      postalCode: postal,
      cfdiUse: use,
      email,
      status: 'pending',
      adminNote: null,
      handledBy: null,
      createdAt: stamp(),
      updatedAt: stamp(),
      issuedAt: null,
    };
    invoices.push(request);
    // Aviso al equipo, sin RFC ni datos fiscales (4.1)
    outbox.push({
      kind: 'invoice_requested',
      dedupeKey: `invoice_requested:${request.id}`,
      recipientUser: null,
      recipientRole: 'team',
      data: { requestId: request.id, amountMxn: payment.amountMxn },
      createdAt: stamp(),
    });
    return { ok: true, data: request.id };
  }

  const page = (args: Json) => {
    const limit = Math.min(Math.max(typeof args.p_limit === 'number' ? args.p_limit : 50, 1), 100);
    const offsetRows = Math.max(typeof args.p_offset === 'number' ? args.p_offset : 0, 0);
    return { limit, offset: offsetRows };
  };

  function adminInvoiceRequests(args: Json): RpcResult {
    const status = asString(args.p_status);
    const { limit, offset: skip } = page(args);
    const matched = invoices
      .filter((item) => status === null || item.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    return {
      ok: true,
      data: matched.slice(skip, skip + limit).map((item) => {
        const payment = payments.find((p) => p.id === item.paymentId);
        return {
          id: item.id,
          user_id: item.userId,
          alias: options.aliasOf(item.userId),
          account_email: options.emailOf(item.userId),
          payment_id: item.paymentId,
          amount_mxn: payment?.amountMxn ?? null,
          paid_at: payment?.paidAt ?? null,
          plan: payment?.plan ?? null,
          method: payment?.method ?? null,
          rfc: item.rfc,
          legal_name: item.legalName,
          tax_regime: item.taxRegime,
          postal_code: item.postalCode,
          cfdi_use: item.cfdiUse,
          email: item.email,
          status: item.status,
          admin_note: item.adminNote,
          created_at: item.createdAt,
          issued_at: item.issuedAt,
          total: matched.length,
        };
      }),
    };
  }

  function adminSetInvoiceStatus(adminId: string, args: Json): RpcResult {
    const id = asString(args.p_id);
    const status = asString(args.p_status);
    const note = asString(args.p_note);
    if (status === null || !['pending', 'issued', 'rejected'].includes(status)) {
      return fail('22023', 'Estado de factura desconocido');
    }
    if (note !== null && note.trim().length > 500) {
      return fail('22023', 'La nota tiene hasta 500 caracteres');
    }
    const request = invoices.find((item) => item.id === id);
    if (!request) return fail('22023', 'No existe esa solicitud');
    if (
      status !== 'rejected' &&
      invoices.some(
        (item) =>
          item.id !== request.id &&
          item.paymentId === request.paymentId &&
          item.status !== 'rejected',
      )
    ) {
      return fail('IV003', 'Ya hay otra solicitud de ese pago');
    }
    request.status = status as InvoiceRequest['status'];
    request.adminNote = note === null || note.trim() === '' ? null : note.trim();
    request.handledBy = adminId;
    request.issuedAt = status === 'issued' ? (request.issuedAt ?? stamp()) : null;
    request.updatedAt = stamp();
    return { ok: true, data: null };
  }

  // ------------------------------------------------------------------ admin

  function adminBillingSummary(): RpcResult {
    return {
      ok: true,
      data: {
        founder: {
          total: founderSeats.total,
          held: seats.filter((seat) => seat.status === 'held').length,
          confirmed: seats.filter((seat) => seat.status === 'confirmed').length,
          open: founderSeats.open,
        },
        activeTrials: [...subscriptions.values()].filter(
          (row) => row.status === 'trialing' && inForce(row),
        ).length,
        activePasses: passes.filter(
          (pass) =>
            pass.status === 'active' &&
            Date.parse(pass.startsAt) <= now() &&
            Date.parse(pass.endsAt) > now(),
        ).length,
        needsRefund: payments.filter((payment) => payment.status === 'needs_refund').length,
        pendingActions: 0,
        failedActions: 0,
        pendingInvoices: invoices.filter((item) => item.status === 'pending').length,
      },
    };
  }

  function adminRecentPayments(args: Json): RpcResult {
    const { limit, offset: skip } = page(args);
    const sorted = [...payments].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
    return {
      ok: true,
      data: sorted.slice(skip, skip + limit).map((payment) => ({
        id: payment.id,
        user_id: payment.userId,
        alias: options.aliasOf(payment.userId),
        plan: payment.plan,
        purpose: payment.purpose,
        method: payment.method,
        provider: payment.provider,
        amount_mxn: payment.amountMxn,
        discount_mxn: payment.discountMxn,
        promotion_code: payment.promotionCode,
        status: payment.status,
        paid_at: payment.paidAt,
        created_at: payment.createdAt,
        total: sorted.length,
      })),
    };
  }

  function adminMarkPaymentRefunded(args: Json): RpcResult {
    const note = (asString(args.p_note) ?? '').trim();
    if (note === '' || note.length > 500) {
      return fail('22023', 'Escribe una nota de hasta 500 caracteres');
    }
    const payment = payments.find((item) => item.id === asString(args.p_payment));
    if (!payment) return fail('22023', 'No existe ese pago');
    if (payment.status === 'refunded') return { ok: true, data: 'already_refunded' };
    if (payment.status !== 'paid' && payment.status !== 'needs_refund') {
      return fail('22023', 'Ese pago no se cobró');
    }
    refund(payment, note);
    return { ok: true, data: 'refunded' };
  }

  function adminPromotionCodeStats(): RpcResult {
    const codes = new Set<string>();
    for (const claim of claims.values()) {
      if (claim.promotionCode && claim.status !== 'voided')
        codes.add(claim.promotionCode.toUpperCase());
    }
    for (const payment of payments) {
      if (payment.promotionCode) codes.add(payment.promotionCode.toUpperCase());
    }
    const rows = [...codes].map((code) => {
      const paid = payments.filter(
        (p) => p.promotionCode?.toUpperCase() === code && p.status === 'paid' && p.amountMxn > 0,
      );
      return {
        code,
        trials: [...claims.values()].filter(
          (claim) => claim.promotionCode?.toUpperCase() === code && claim.status !== 'voided',
        ).length,
        payments: paid.length,
        paying_users: new Set(paid.map((p) => p.userId)).size,
        revenue_mxn: cents(paid.reduce((sum, p) => sum + p.amountMxn, 0)),
      };
    });
    rows.sort((a, b) => b.payments - a.payments || a.code.localeCompare(b.code));
    return { ok: true, data: rows };
  }

  // ------------------------------------------------------------------ filas por permiso

  const paymentRow = (payment: BillingPayment): Json => ({
    id: payment.id,
    user_id: payment.userId,
    provider: payment.provider,
    provider_payment_id: payment.providerPaymentId,
    amount_mxn: payment.amountMxn,
    status: payment.status,
    created_at: payment.createdAt,
    purpose: payment.purpose,
    plan: payment.plan,
    method: payment.method,
    discount_mxn: payment.discountMxn,
    promotion_code: payment.promotionCode,
    paid_at: payment.paidAt,
    expires_at: payment.expiresAt,
    refunded_at: payment.refundedAt,
    admin_note: payment.adminNote,
  });

  return {
    now,
    advanceTime,
    rules,
    founderSeats,
    promotionCodes,
    myPlan,
    userPlan,
    checkoutContext,
    hasPaidCharge,
    blocksAccountDeletion(userId) {
      const row = subscriptions.get(userId);
      return (
        row !== undefined &&
        ['trialing', 'active', 'past_due'].includes(row.status) &&
        !row.cancelAtPeriodEnd &&
        (row.periodEnd === null || Date.parse(row.periodEnd) > now())
      );
    },
    createCheckout,
    createPortal,
    cancelSubscription,
    checkoutOf: (id) => checkouts.get(id),
    portalOf: (id) => portals.get(id),
    completeCheckout,
    cancelCheckout,
    portalCancel,
    portalTarget,
    portalChangePlan,
    applyCharge,
    applySubscriptionState,
    legacyNotice,
    lastNoticeOf: (userId) => lastNotices.get(userId) ?? null,
    endTrial,
    endPeriod,
    settleVoucher,
    fundTransfer,
    subscriptionOf: (userId) => subscriptions.get(userId) ?? null,
    setSubscription(userId, row) {
      if (row === null) {
        subscriptions.delete(userId);
        return;
      }
      subscriptions.set(userId, row);
      if (row.provider === 'stripe' && !customers.has(userId)) {
        customers.set(userId, nextId('cus_fake'));
      }
      syncSeat(row);
    },
    paymentsOf: (userId) => payments.filter((payment) => payment.userId === userId),
    passesOf: (userId) => passes.filter((pass) => pass.userId === userId),
    trialClaimOf: (userId) => claims.get(userId) ?? null,
    founderSeatsTaken: seatsTaken,
    outbox,
    actions,
    invoiceRequestsOf: (userId) => invoices.filter((item) => item.userId === userId),
    forgetUser(userId) {
      subscriptions.delete(userId);
      claims.delete(userId);
      customers.delete(userId);
      const keep = (list: { userId: string }[]) => {
        const left = list.filter((item) => item.userId !== userId);
        list.length = 0;
        list.push(...left);
      };
      keep(payments);
      keep(passes);
      keep(invoices);
      // El lugar Fundador queda sin dueño y sigue contando (respuesta 17)
      for (const seat of seats) if (seat.userId === userId) seat.userId = null;
    },
    paymentRows: (userId) =>
      payments.filter((payment) => userId === null || payment.userId === userId).map(paymentRow),
    passRows: (userId) =>
      passes
        .filter((pass) => userId === null || pass.userId === userId)
        .map((pass) => ({
          id: pass.id,
          user_id: pass.userId,
          plan: pass.plan,
          provider: pass.provider,
          provider_payment_id: pass.providerPaymentId,
          method: pass.method,
          starts_at: pass.startsAt,
          ends_at: pass.endsAt,
          status: pass.status,
          created_at: pass.createdAt,
        })),
    invoiceRows: (userId) =>
      invoices
        .filter((item) => userId === null || item.userId === userId)
        .map((item) => ({
          id: item.id,
          user_id: item.userId,
          payment_id: item.paymentId,
          rfc: item.rfc,
          legal_name: item.legalName,
          tax_regime: item.taxRegime,
          postal_code: item.postalCode,
          cfdi_use: item.cfdiUse,
          email: item.email,
          status: item.status,
          admin_note: item.adminNote,
          created_at: item.createdAt,
          updated_at: item.updatedAt,
          issued_at: item.issuedAt,
        })),
    subscriptionRow(userId) {
      const row = subscriptions.get(userId);
      return row
        ? {
            user_id: row.userId,
            plan: row.plan,
            status: row.status,
            provider: row.provider,
            provider_subscription_id: row.subscriptionId,
            current_period_end: row.periodEnd,
            trial_ends_at: row.trialEndsAt,
            cancel_at_period_end: row.cancelAtPeriodEnd,
            scheduled_change: row.scheduledChange,
            promotion_code: row.promotionCode,
          }
        : null;
    },
    requestInvoice,
    adminInvoiceRequests,
    adminSetInvoiceStatus,
    adminBillingSummary,
    adminRecentPayments,
    adminMarkPaymentRefunded,
    adminPromotionCodeStats,
  };
}
