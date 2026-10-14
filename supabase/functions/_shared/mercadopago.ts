// Mercado Pago en las funciones de pago (Fase P bloque 5, D-096, y B10 del plan del cambio, paquete C).
//
// Pase de un solo pago con Checkout Pro (preferencia), suscripción mensual o anual sin plan (preapproval),
// los tres temas del aviso (payment, subscription_preapproval y subscription_authorized_payment) y la
// cancelación desde la app (cancel-subscription). Sigue 2.5 del diseño de B10. Lo que este módulo le da a
// payments.ts y a runtime.ts es el contrato de billingTypes.ts (createMercadoPagoCheckout con
// MercadoPagoCheckoutInput, MercadoPagoWebhookDeps y CancelSubscriptionDeps). No depende de Deno, así se
// prueba con Vitest (D-096).
//
// Reglas que se cumplen aquí
//   - Un aviso solo cuenta si su firma es válida. Sin firma, con firma vieja o con firma de otro
//     secreto, la respuesta es 401 y no se toca la base
//   - La notificación es solo una señal. Después de verificar la firma se consulta el recurso a Mercado
//     Pago con el token del servidor y se confía en esa respuesta, nunca en el cuerpo del aviso
//   - Quién pagó, qué plan y si es pase o suscripción salen de la referencia que puso esta misma función
//     al crear el pago, nunca de lo que mande el navegador
//   - Cada aviso se aplica una sola vez, porque la base reconoce su id. Cada cobro una sola vez, porque
//     la base reconoce el id del pago, que es el mismo en los temas payment y subscription_authorized_payment
//   - El estado de una suscripción no da acceso por sí solo. Solo un cobro aprobado alarga el periodo
//   - Un aviso que no entendemos se contesta con 200 para que no insista. Si Mercado Pago no contesta la
//     consulta se responde 502, y si la base falla 500, para que lo reintente. Reintentar es seguro
//   - Lo que se guarda del recurso en payment_webhook_events va sin los datos del pagador
//
// Los campos que se leen salen de los tipos del SDK oficial (npm mercadopago 3.6.1) y de su guía de
// webhooks, consultados el 2026-10-14 porque la documentación web no abre desde este entorno. Falta
// confirmarlos con respuestas reales del sandbox. La lista está en docs/MERCADOPAGO.md
import {
  PASS_PRICES_MXN,
  PLAN_PRICES_MXN,
  PLAN_TITLES,
  isPaidPlan,
  isPassPlan,
  isUuid,
  type BillingAction,
  type CancelSubscriptionDeps,
  type ChargeNotice,
  type CheckoutContext,
  type CheckoutMode,
  type MercadoPagoCheckoutInput,
  type MercadoPagoCheckoutResult,
  type MercadoPagoWebhookDeps,
  type PaidPlan,
  type PassPlan,
  type SubscriptionNotice,
  type SubscriptionStatus,
} from './billingTypes.ts';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  corsHeaders,
  hmacSha256Hex,
  json,
  readJsonRecord,
  safeEqual,
  subscriptionUrl,
  text,
  type Json,
} from './http.ts';

const API = 'https://api.mercadopago.com';

/** Una notificación firmada hace más de esto se rechaza, para que no sirva repetirla (8.14) */
export const MERCADOPAGO_TOLERANCE_MS = 300_000;

/** Cuántas acciones pendientes con Mercado Pago se ejecutan después de cada aviso, como en Stripe */
const ACTIONS_PER_NOTICE = 5;

/** Nombre de cada pase como lo ve el alumno en Mercado Pago */
const PASS_TITLES: Record<PassPlan, string> = {
  monthly: 'Studiare. Pase de 1 mes',
  annual: 'Studiare. Pase de 1 año',
};

/** Meses que cubre cada cobro según el plan */
const PERIOD_MONTHS: Record<PaidPlan, number> = {
  founder: 1,
  founder_annual: 12,
  monthly: 1,
  annual: 12,
};

/** Medios de Mercado Pago que dan una ficha o datos para transferir y quedan pendientes hasta pagarse */
const VOUCHER_TYPES = new Set(['ticket', 'atm', 'bank_transfer']);

/** La app solo abre direcciones de pago https en estos dominios (src/data/payments/checkout.ts) */
const CHECKOUT_HOST = /(^|\.)mercadopago\.com(\.mx)?$/;

/** De un estado de suscripción de Mercado Pago al de la base. pending y los demás se ignoran */
const PREAPPROVAL_STATUS = new Map<string, SubscriptionStatus>([
  ['authorized', 'active'],
  ['paused', 'past_due'],
  ['cancelled', 'canceled'],
]);

// ---------------------------------------------------------------------------------------------
// Firma

/**
 * La hora de ts en milisegundos. Hasta 10 dígitos son segundos, como los trata el validador del SDK, y
 * más son milisegundos, como en los ejemplos reales de 13 dígitos (8.14). null si no son solo dígitos
 */
export function signatureTimeMs(ts: string): number | null {
  if (!/^[0-9]{1,16}$/.test(ts)) return null;
  const value = Number(ts);
  return ts.length > 10 ? value : value * 1000;
}

/** ts y v1 del encabezado x-signature, con la misma lectura que el validador del SDK */
function readSignatureHeader(header: string): { ts: string | null; v1: string | null } {
  let ts: string | null = null;
  let v1: string | null = null;
  for (const piece of header.split(',')) {
    const at = piece.indexOf('=');
    if (at <= 0) continue;
    const name = piece.slice(0, at).trim().toLowerCase();
    const value = piece.slice(at + 1).trim();
    if (value === '') continue;
    if (name === 'ts') ts = value;
    else if (name === 'v1') v1 = value;
  }
  return { ts, v1 };
}

/**
 * Firma de Mercado Pago. El encabezado x-signature trae ts y v1. El mensaje firmado es
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;", omite lo que no llegó y lleva el texto de ts tal
 * cual. El HMAC SHA-256 en hexadecimal con la clave secreta de la integración debe ser igual a v1
 */
export async function verifyMercadoPagoSignature(input: {
  header: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  nowMs: number;
  toleranceMs?: number;
}): Promise<boolean> {
  if (!input.header || input.secret === '') return false;
  const { ts, v1 } = readSignatureHeader(input.header);
  if (ts === null || v1 === null) return false;
  const stampMs = signatureTimeMs(ts);
  if (stampMs === null) return false;
  if (Math.abs(input.nowMs - stampMs) > (input.toleranceMs ?? MERCADOPAGO_TOLERANCE_MS)) {
    return false;
  }
  const requestId = input.requestId?.trim() ?? '';
  const dataId = input.dataId?.trim() ?? '';
  // La guía en español pide el id en minúsculas y el validador del SDK lo firma tal cual. Con un id de
  // números, como el de un pago, son iguales. Con letras se aceptan las dos formas
  const ids = dataId === '' ? [''] : [...new Set([dataId.toLowerCase(), dataId])];
  for (const id of ids) {
    let manifest = id === '' ? '' : `id:${id};`;
    if (requestId !== '') manifest += `request-id:${requestId};`;
    manifest += `ts:${ts};`;
    if (safeEqual(v1, await hmacSha256Hex(input.secret, manifest))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Referencia, fechas y montos

/** Para qué es un cobro, como lo recibe apply_charge */
export type Purpose = ChargeNotice['purpose'];

/** Quién pagó, qué plan y para qué, según la referencia que puso esta función */
export interface ParsedReference {
  userId: string;
  plan: PaidPlan;
  purpose: Purpose;
}

/**
 * La referencia externa del pago. user_id|plan|sub en la suscripción y user_id|plan en el pase. El pase
 * conserva la forma de antes, que el aviso lee como pase (2.5)
 */
export function externalReferenceFor(userId: string, plan: PassPlan, mode: CheckoutMode): string {
  return mode === 'subscription' ? `${userId}|${plan}|sub` : `${userId}|${plan}`;
}

/** Lee user_id|plan|sub o user_id|plan|pass. La referencia vieja user_id|plan cuenta como pase */
export function parseExternalReference(reference: unknown): ParsedReference | null {
  if (typeof reference !== 'string') return null;
  const [userId, plan, kind, ...rest] = reference.split('|');
  if (rest.length > 0 || !isUuid(userId) || !isPaidPlan(plan)) return null;
  if (kind === undefined || kind === 'pass') return { userId, plan, purpose: 'pass' };
  return kind === 'sub' ? { userId, plan, purpose: 'subscription' } : null;
}

/** La misma información en la metadata del pago, por si la referencia no llegara */
function referenceFromMetadata(metadata: unknown): ParsedReference | null {
  const data = asRecord(metadata);
  const userId = data.user_id;
  const plan = data.plan;
  if (!isUuid(userId) || !isPaidPlan(plan)) return null;
  return { userId, plan, purpose: data.mode === 'subscription' ? 'subscription' : 'pass' };
}

/** La referencia del alumno en un pago, una suscripción o un cobro de Mercado Pago */
export function referenceOf(resource: unknown): ParsedReference | null {
  const root = asRecord(resource);
  return parseExternalReference(root.external_reference) ?? referenceFromMetadata(root.metadata);
}

/** Un id de Mercado Pago, que llega como número o como texto */
function idOf(value: unknown): string | null {
  if (typeof value === 'number')
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return asString(value);
}

/** Una fecha de Mercado Pago (ISO 8601 con su zona) en ISO UTC. null si no llegó o no se lee */
function isoOf(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Suma meses como Postgres, sin pasarse del último día del mes. Del 31 de enero sale el 28 de febrero */
export function addMonths(iso: string, months: number): string {
  const start = new Date(iso);
  const end = new Date(start.getTime());
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return end.toISOString();
}

/** El monto en pesos. null si la moneda no es peso mexicano */
function mxn(amount: unknown, currency: unknown): number | null {
  const value = asNumber(amount);
  return value !== null && typeof currency === 'string' && currency.toUpperCase() === 'MXN'
    ? value
    : null;
}

/** Datos del pagador que no se guardan en payment_webhook_events. La base no los necesita */
const PAYER_FIELDS = new Set([
  'payer',
  'payer_email',
  'payer_first_name',
  'payer_last_name',
  'card',
  'additional_info',
]);

/** El recurso sin los datos del pagador (correo, nombre, identificación, tarjeta y cuenta de banco) */
function withoutPayerData(resource: Json): Json {
  const kept = Object.fromEntries(
    Object.entries(resource).filter(([key]) => !PAYER_FIELDS.has(key)),
  );
  const interaction = asRecord(kept.point_of_interaction);
  const data = asRecord(interaction.transaction_data);
  if ('bank_info' in data) {
    const { bank_info: _bankInfo, ...rest } = data;
    kept.point_of_interaction = { ...interaction, transaction_data: rest };
  }
  return kept;
}

// ---------------------------------------------------------------------------------------------
// Del recurso de Mercado Pago al aviso de la base

/** La suscripción de la que viene un pago, si viene de una */
export function subscriptionIdOfPayment(payment: unknown): string | null {
  const root = asRecord(payment);
  const data = asRecord(asRecord(root.point_of_interaction).transaction_data);
  return asString(data.subscription_id) ?? asString(asRecord(root.metadata).preapproval_id);
}

/** Hasta dónde paga un cobro de suscripción, desde el día en que se cobró */
function periodEndFrom(plan: PaidPlan | null, billedAt: string | null): string | null {
  return plan !== null && billedAt !== null ? addMonths(billedAt, PERIOD_MONTHS[plan]) : null;
}

/**
 * Tema payment, con el pago leído de GET /v1/payments/{id}. Aprobado es un cobro, devuelto o con
 * contracargo es un reembolso, una ficha o transferencia pendiente de un pase queda pendiente, y un pase
 * rechazado o cancelado pasa a vencido su pendiente si existe. fallback es la referencia de la
 * suscripción, para un cobro que no trae la suya. null si el aviso no cambia nada
 */
export function chargeNoticeFromPayment(
  payment: unknown,
  fallback: ParsedReference | null = null,
): ChargeNotice | null {
  const root = asRecord(payment);
  const paymentId = idOf(root.id);
  const status = asString(root.status);
  if (!paymentId || !status) return null;
  const subscriptionId = subscriptionIdOfPayment(root);
  const reference = referenceOf(root) ?? fallback;
  const purpose: Purpose = reference?.purpose ?? (subscriptionId ? 'subscription' : 'pass');
  const amountMxn = mxn(root.transaction_amount, root.currency_id);
  const base = {
    provider: 'mercadopago' as const,
    // Cada cambio de estado de un pago se aplica una vez. Las repeticiones del mismo estado no
    eventId: `${paymentId}:${status}`,
    payload: withoutPayerData(root),
    userId: reference?.userId ?? null,
    purpose,
    method: 'mercadopago' as const,
    providerPaymentId: paymentId,
    paymentIntentId: null,
    providerSubscriptionId: subscriptionId,
    discountMxn: null,
    promotionCode: null,
  };
  switch (status) {
    case 'approved': {
      const plan = reference?.plan ?? null;
      const billedAt =
        purpose === 'subscription'
          ? (isoOf(asRecord(asRecord(root.point_of_interaction).transaction_data).billing_date) ??
            isoOf(root.date_approved) ??
            isoOf(root.date_created))
          : null;
      return {
        ...base,
        kind: 'paid',
        plan,
        amountMxn,
        periodEnd: periodEndFrom(plan, billedAt),
        expiresAt: null,
      };
    }
    case 'refunded':
    case 'charged_back':
      // Mercado Pago pone refunded solo cuando se devolvió todo. Uno parcial deja el pago en approved y
      // repite un aviso ya aplicado
      return { ...base, kind: 'refunded', plan: null, amountMxn, periodEnd: null, expiresAt: null };
    case 'pending':
    case 'in_process':
      if (purpose !== 'pass' || !VOUCHER_TYPES.has(asString(root.payment_type_id) ?? '')) {
        return null;
      }
      return {
        ...base,
        kind: 'pending',
        plan: reference?.plan ?? null,
        amountMxn,
        periodEnd: null,
        expiresAt: isoOf(root.date_of_expiration),
      };
    case 'rejected':
    case 'cancelled':
      // Sin plan ni monto la base solo pasa a vencido un pendiente que ya exista y no crea otro
      if (purpose !== 'pass') return null;
      return {
        ...base,
        kind: 'expired',
        plan: null,
        amountMxn: null,
        periodEnd: null,
        expiresAt: null,
      };
    default:
      return null;
  }
}

/**
 * Tema subscription_preapproval, con la suscripción leída de GET /preapproval/{id}. authorized queda
 * active, paused queda past_due y cancelled queda canceled. pending se ignora. El estado no da acceso
 * por sí solo, así que no manda fin de periodo y el acceso sigue al de los cobros aprobados
 */
export function subscriptionNoticeFromPreapproval(
  preapproval: unknown,
  nowMs: number,
): SubscriptionNotice | null {
  const root = asRecord(preapproval);
  const id = asString(root.id);
  const mercadoPagoStatus = asString(root.status);
  const status = mercadoPagoStatus === null ? undefined : PREAPPROVAL_STATUS.get(mercadoPagoStatus);
  if (!id || !mercadoPagoStatus || !status) return null;
  const reference = referenceOf(root);
  // La hora del último cambio ordena los avisos y distingue una reanudación de la primera autorización
  const modified = isoOf(root.last_modified);
  return {
    provider: 'mercadopago',
    eventId: `preapproval:${id}:${mercadoPagoStatus}${modified === null ? '' : `:${modified}`}`,
    eventAt: modified ?? new Date(nowMs).toISOString(),
    payload: withoutPayerData(root),
    userId: reference?.userId ?? null,
    subscriptionId: id,
    plan: reference?.plan ?? null,
    status,
    periodEnd: null,
    trialEnd: null,
    // Cancelada ya no se cobra otra vez y vale hasta el fin de lo pagado
    cancelAtPeriodEnd: status === 'canceled',
    scheduledChange: false,
    priceId: null,
    promotionCode: null,
  };
}

/**
 * Tema subscription_authorized_payment, con el cobro leído de GET /authorized_payments/{id}. Solo un
 * cobro con su pago aprobado cambia algo. Un intento rechazado no marca la suscripción como vencida,
 * porque Mercado Pago reintenta y un aviso tardío podría llegar después del cobro bueno. Si Mercado Pago
 * se rinde, el cambio llega por subscription_preapproval
 */
export function chargeNoticeFromAuthorizedPayment(
  authorized: unknown,
  fallback: ParsedReference | null = null,
): ChargeNotice | null {
  const root = asRecord(authorized);
  const id = idOf(root.id);
  const payment = asRecord(root.payment);
  const paymentId = idOf(payment.id);
  if (!id || !paymentId || payment.status !== 'approved') return null;
  const reference = referenceOf(root) ?? fallback;
  const plan = reference?.plan ?? null;
  return {
    provider: 'mercadopago',
    eventId: `authorized_payment:${id}:approved`,
    payload: withoutPayerData(root),
    kind: 'paid',
    userId: reference?.userId ?? null,
    purpose: 'subscription',
    plan,
    method: 'mercadopago',
    // El mismo id que trae el tema payment, así el cobro no se cuenta dos veces
    providerPaymentId: paymentId,
    paymentIntentId: null,
    providerSubscriptionId: asString(root.preapproval_id),
    amountMxn: mxn(root.transaction_amount, root.currency_id),
    discountMxn: null,
    promotionCode: null,
    periodEnd: periodEndFrom(plan, isoOf(root.debit_date) ?? isoOf(root.date_created)),
    expiresAt: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Llamadas a Mercado Pago

/** Mercado Pago contestó con un estado de error. Solo guarda el estado, sin llaves ni datos */
class MercadoPagoReplyError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`estado ${String(status)}`);
    this.name = 'MercadoPagoReplyError';
    this.status = status;
  }
}

/** El tipo de un error, que no lleva llaves ni datos del alumno */
const errorKind = (error: unknown): string =>
  error instanceof MercadoPagoReplyError
    ? error.message
    : error instanceof Error
      ? error.name
      : typeof error;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Lee un recurso con el token del servidor. Lanza si Mercado Pago no contesta bien */
async function getFromMercadoPago(
  path: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<Json> {
  const reply = await fetchImpl(`${API}${path}`, { headers: bearer(token) });
  if (!reply.ok) throw new MercadoPagoReplyError(reply.status);
  return asRecord(await reply.json());
}

/** Por qué Mercado Pago rechazó una petición, en una línea, solo con el estado y sus códigos */
async function mercadoPagoFailure(reply: Response): Promise<string> {
  const body = asRecord(await reply.json().catch(() => ({})));
  const parts = [`estado ${String(reply.status)}`];
  const code = asString(body.error);
  if (code) parts.push(`código ${code}`);
  const causes = asArray(body.cause)
    .map((cause) => idOf(asRecord(cause).code))
    .filter((cause) => cause !== null);
  if (causes.length > 0) parts.push(`causa ${causes.join(' ')}`);
  return parts.join(', ');
}

/** Ids que se aceptan en una ruta de la API. Los pagos son números y las suscripciones letras y números */
const PAYMENT_ID = /^[0-9]{1,30}$/;
const RESOURCE_ID = /^[0-9A-Za-z_-]{1,64}$/;

/**
 * Cancela una suscripción en Mercado Pago con PUT /preapproval/{id} y status cancelled. Si Mercado Pago
 * no la cancela porque ya estaba cancelada, por ejemplo desde la app de Mercado Pago, cuenta como hecha
 */
export async function cancelMercadoPagoSubscription(
  id: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!RESOURCE_ID.test(id)) return { ok: false, error: 'La suscripción no tiene un id válido' };
  const url = `${API}/preapproval/${id}`;
  try {
    const reply = await fetchImpl(url, {
      method: 'PUT',
      headers: { ...bearer(token), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (reply.ok) return { ok: true };
    const current = await fetchImpl(url, { headers: bearer(token) });
    if (current.ok && asRecord(await current.json()).status === 'cancelled') return { ok: true };
    return { ok: false, error: `Mercado Pago no la canceló. estado ${String(reply.status)}` };
  } catch (error) {
    return { ok: false, error: `Mercado Pago no respondió al cancelar. ${errorKind(error)}` };
  }
}

// ---------------------------------------------------------------------------------------------
// Crear el pago

function isMercadoPagoCheckoutUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      CHECKOUT_HOST.test(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Pase de un solo pago con Checkout Pro. Dentro de Mercado Pago se paga con tarjeta, saldo, OXXO o SPEI */
function preferenceBody(input: MercadoPagoCheckoutInput, plan: PassPlan, appUrl: string): Json {
  const body: Json = {
    items: [
      {
        id: plan,
        title: PASS_TITLES[plan],
        quantity: 1,
        currency_id: 'MXN',
        unit_price: PASS_PRICES_MXN[plan],
      },
    ],
    external_reference: externalReferenceFor(input.user.id, plan, 'pass'),
    metadata: { user_id: input.user.id, plan, mode: 'pass' },
    back_urls: {
      success: subscriptionUrl(appUrl, { pago: 'ok' }),
      pending: subscriptionUrl(appUrl, { pago: 'pendiente', metodo: 'mercadopago' }),
      failure: subscriptionUrl(appUrl, { pago: 'cancelado' }),
    },
    auto_return: 'approved',
    statement_descriptor: 'STUDIARE',
  };
  const functionsUrl = (input.env.FUNCTIONS_URL ?? '').replace(/\/+$/, '');
  if (functionsUrl !== '') body.notification_url = `${functionsUrl}/payment-webhook-mercadopago`;
  return body;
}

/**
 * Suscripción sin plan, en pending. El alumno la autoriza en init_point con su cuenta de Mercado Pago y
 * desde ahí se cobra sola cada mes o cada año. Sus avisos llegan por los temas configurados en el panel
 */
function preapprovalBody(
  input: MercadoPagoCheckoutInput,
  plan: PassPlan,
  email: string,
  appUrl: string,
): Json {
  return {
    reason: PLAN_TITLES[plan],
    external_reference: externalReferenceFor(input.user.id, plan, 'subscription'),
    payer_email: email,
    auto_recurring: {
      frequency: PERIOD_MONTHS[plan],
      frequency_type: 'months',
      transaction_amount: PLAN_PRICES_MXN[plan],
      currency_id: 'MXN',
    },
    back_url: subscriptionUrl(appUrl, { pago: 'ok' }),
    status: 'pending',
  };
}

/**
 * Crea el pago en Mercado Pago y devuelve la dirección donde se paga. El pase con una preferencia de
 * Checkout Pro y la suscripción con preapproval (2.5). Mercado Pago no lleva precio Fundador ni prueba
 * gratis (8.3)
 */
export async function createMercadoPagoCheckout(
  input: MercadoPagoCheckoutInput,
): Promise<MercadoPagoCheckoutResult> {
  const token = input.env.MERCADOPAGO_ACCESS_TOKEN ?? '';
  const appUrl = input.env.APP_URL ?? '';
  if (token === '' || appUrl === '') return { ok: false, error: 'not_configured' };
  const { plan, mode, context } = input;
  if (!isPassPlan(plan)) return { ok: false, error: 'invalid' };
  // Las reglas 4 y 5 de create-checkout (2.2), por si otra función llama aquí sin revisarlas. Con una
  // suscripción vigente no se abre otro cobro, y con un pase vigente no se empieza una suscripción
  if (context.inForce === 'subscription') return { ok: false, error: 'already_subscribed' };
  if (mode === 'subscription' && context.inForce === 'pass') {
    return { ok: false, error: 'pass_in_force' };
  }
  const what = mode === 'subscription' ? 'la suscripción' : 'el pago';
  let path = '/checkout/preferences';
  let body: Json;
  if (mode === 'subscription') {
    const email = input.user.email ?? '';
    if (email === '') {
      input.log(`No se pudo crear la suscripción del plan ${plan}. La cuenta no tiene correo`);
      return { ok: false, error: 'invalid' };
    }
    path = '/preapproval';
    body = preapprovalBody(input, plan, email, appUrl);
  } else {
    body = preferenceBody(input, plan, appUrl);
  }
  try {
    const reply = await input.fetch(`${API}${path}`, {
      method: 'POST',
      headers: { ...bearer(token), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!reply.ok) {
      input.log(
        `Mercado Pago rechazó ${what} del plan ${plan}. ${await mercadoPagoFailure(reply)}`,
      );
      return { ok: false, error: 'provider' };
    }
    const created = asRecord(await reply.json());
    // En modo prueba Mercado Pago puede devolver solo la dirección de sandbox
    const url = asString(created.init_point) ?? asString(created.sandbox_init_point);
    if (url !== null && isMercadoPagoCheckoutUrl(url)) return { ok: true, url };
    input.log(`Mercado Pago creó ${what} del plan ${plan} sin una dirección de pago válida`);
    return { ok: false, error: 'provider' };
  } catch (error) {
    // Sin red hacia la pasarela, o una respuesta que no se pudo leer. Solo el tipo de error, que no
    // lleva llaves ni datos del alumno
    input.log(`No se pudo crear ${what} del plan ${plan} con mercadopago. ${errorKind(error)}`);
    return { ok: false, error: 'provider' };
  }
}

// ---------------------------------------------------------------------------------------------
// Aviso de Mercado Pago (payment-webhook-mercadopago)

type Topic = 'payment' | 'preapproval' | 'authorized_payment';

/** Los temas que entiende el aviso, con el nombre de Webhooks y el corto de antes */
const TOPICS = new Map<string, Topic>([
  ['payment', 'payment'],
  ['subscription_preapproval', 'preapproval'],
  ['preapproval', 'preapproval'],
  ['subscription_authorized_payment', 'authorized_payment'],
  ['authorized_payment', 'authorized_payment'],
]);

type Notice =
  { kind: 'charge'; notice: ChargeNotice } | { kind: 'state'; notice: SubscriptionNotice };

/**
 * Lo que el aviso necesita para ejecutar las acciones de Mercado Pago que deja la base (billing_actions),
 * como cancelar una suscripción reembolsada o una segunda suscripción (8.6). No está en
 * MercadoPagoWebhookDeps de billingTypes.ts. Mientras runtime.ts no lo pase, el aviso no ejecuta acciones
 */
export interface MercadoPagoActionDeps {
  /** claim_billing_actions con p_provider mercadopago */
  claimBillingActions: (limit: number) => Promise<BillingAction[]>;
  /** finish_billing_action */
  finishBillingAction: (result: { id: string; ok: boolean; error: string | null }) => Promise<void>;
}

/** La referencia de una suscripción, para un cobro que llegó sin la suya. Lanza si Mercado Pago falla */
async function referenceOfSubscription(
  subscriptionId: string | null,
  read: (path: string) => Promise<Json>,
): Promise<ParsedReference | null> {
  if (subscriptionId === null || !RESOURCE_ID.test(subscriptionId)) return null;
  const reference = referenceOf(await read(`/preapproval/${subscriptionId}`));
  return reference ? { ...reference, purpose: 'subscription' } : null;
}

/** Consulta el recurso del aviso y lo convierte en lo que recibe la base. Lanza si Mercado Pago falla */
async function readNotice(
  topic: Topic,
  id: string,
  token: string,
  deps: MercadoPagoWebhookDeps,
): Promise<Notice | null> {
  const read = (path: string) => getFromMercadoPago(path, token, deps.fetch);
  if (topic === 'preapproval') {
    const notice = subscriptionNoticeFromPreapproval(await read(`/preapproval/${id}`), deps.now());
    return notice ? { kind: 'state', notice } : null;
  }
  const resource = await read(
    topic === 'payment' ? `/v1/payments/${id}` : `/authorized_payments/${id}`,
  );
  const build = topic === 'payment' ? chargeNoticeFromPayment : chargeNoticeFromAuthorizedPayment;
  let notice = build(resource);
  // Un cobro de una suscripción puede llegar sin la referencia. Entonces se lee la de su suscripción
  if (notice?.userId === null) {
    const subscriptionId =
      topic === 'payment' ? subscriptionIdOfPayment(resource) : asString(resource.preapproval_id);
    const fallback = await referenceOfSubscription(subscriptionId, read);
    if (fallback) notice = build(resource, fallback);
  }
  return notice ? { kind: 'charge', notice } : null;
}

/**
 * Ejecuta hasta cinco acciones pendientes de Mercado Pago. Un error deja la acción fallida con su motivo
 * y se reintenta con el siguiente aviso. Nunca cambia la respuesta, porque el aviso ya se aplicó
 */
async function runPendingActions(
  deps: MercadoPagoWebhookDeps & Partial<MercadoPagoActionDeps>,
  token: string,
): Promise<void> {
  const { claimBillingActions, finishBillingAction } = deps;
  if (!claimBillingActions || !finishBillingAction) return;
  let actions: BillingAction[];
  try {
    actions = await claimBillingActions(ACTIONS_PER_NOTICE);
  } catch {
    deps.log('No se pudieron tomar las acciones pendientes con Mercado Pago');
    return;
  }
  for (const action of actions) {
    // Las de Stripe las ejecuta su propio aviso
    if (action.provider !== 'mercadopago') continue;
    const outcome = await cancelMercadoPagoSubscription(action.target, token, deps.fetch);
    try {
      await finishBillingAction({
        id: action.id,
        ok: outcome.ok,
        error: outcome.ok ? null : outcome.error,
      });
    } catch {
      deps.log('No se pudo cerrar en la base una acción con Mercado Pago');
    }
  }
}

/**
 * Aviso de Mercado Pago. Verifica la firma, consulta el recurso con el token del servidor y lo aplica en
 * la base una sola vez. payment y subscription_authorized_payment van a apply_charge y
 * subscription_preapproval a apply_subscription_state
 */
export async function handleMercadoPagoWebhook(
  request: Request,
  deps: MercadoPagoWebhookDeps & Partial<MercadoPagoActionDeps>,
): Promise<Response> {
  if (request.method !== 'POST') return text('Método no permitido', 405);
  const secret = deps.env.MERCADOPAGO_WEBHOOK_SECRET ?? '';
  const token = deps.env.MERCADOPAGO_ACCESS_TOKEN ?? '';
  if (secret === '' || token === '') return text('Mercado Pago no está configurado', 503);
  const url = new URL(request.url);
  const body = await readJsonRecord(request);
  const dataId = url.searchParams.get('data.id') ?? idOf(asRecord(body.data).id);
  const valid = await verifyMercadoPagoSignature({
    header: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    dataId,
    secret,
    nowMs: deps.now(),
  });
  if (!valid) return text('Firma inválida', 401);
  const topic = TOPICS.get(url.searchParams.get('type') ?? asString(body.type) ?? '');
  if (!topic || !dataId || !(topic === 'payment' ? PAYMENT_ID : RESOURCE_ID).test(dataId)) {
    return text('Ignorado', 200);
  }
  let notice: Notice | null;
  try {
    notice = await readNotice(topic, dataId, token, deps);
  } catch (error) {
    deps.log(`Mercado Pago no respondió la consulta del aviso ${topic}. ${errorKind(error)}`);
    return text('No se pudo consultar Mercado Pago', 502);
  }
  if (!notice) return text('Ignorado', 200);
  let result: string;
  try {
    result =
      notice.kind === 'charge'
        ? await deps.applyCharge(notice.notice)
        : await deps.applySubscriptionState(notice.notice);
  } catch {
    deps.log(`No se pudo aplicar en la base el aviso ${topic} de Mercado Pago`);
    return text('No se pudo aplicar', 500);
  }
  await runPendingActions(deps, token);
  return text(result, 200);
}

// ---------------------------------------------------------------------------------------------
// Cancelar desde la app (cancel-subscription)

/** Una suscripción que Mercado Pago todavía cobraría */
const CANCELABLE = new Set(['trialing', 'active', 'past_due']);

/**
 * Cancela la suscripción de Mercado Pago del alumno que inició sesión. La suscripción sale de la base y
 * nunca de lo que mande el navegador. Mercado Pago no tiene portal, así que la app llama aquí. El plan
 * vale hasta el fin de lo pagado. El estado se aplica en el acto con el id de evento cancel:{id}, porque
 * la respuesta viene de nuestra propia llamada, y el aviso que llega después ya no cambia nada
 */
export async function handleCancelSubscription(
  request: Request,
  deps: CancelSubscriptionDeps,
): Promise<Response> {
  const cors = corsHeaders(deps.env, request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  const user = await deps.authenticate(request.headers.get('authorization'));
  if (!user) return json({ error: 'unauthorized' }, 401, cors);
  const token = deps.env.MERCADOPAGO_ACCESS_TOKEN ?? '';
  if (token === '') return json({ error: 'not_configured' }, 503, cors);
  let context: CheckoutContext;
  try {
    context = await deps.checkoutContext(user.id);
  } catch {
    deps.log('No se pudo leer el plan del alumno antes de cancelar su suscripción de Mercado Pago');
    return json({ error: 'provider' }, 502, cors);
  }
  const subscription = context.subscription;
  if (
    subscription?.provider !== 'mercadopago' ||
    subscription.subscriptionId === null ||
    !isPaidPlan(subscription.plan)
  ) {
    return json({ error: 'no_subscription' }, 404, cors);
  }
  const done = { status: 'canceled', periodEnd: subscription.periodEnd };
  // Ya cancelada. Pedirlo otra vez no cambia nada
  if (subscription.status === 'canceled') return json(done, 200, cors);
  if (!CANCELABLE.has(subscription.status)) return json({ error: 'no_subscription' }, 404, cors);
  const subscriptionId = subscription.subscriptionId;
  const outcome = await cancelMercadoPagoSubscription(subscriptionId, token, deps.fetch);
  if (!outcome.ok) {
    deps.log(`No se pudo cancelar la suscripción de Mercado Pago. ${outcome.error}`);
    return json({ error: 'provider' }, 502, cors);
  }
  try {
    const result = await deps.applySubscriptionState({
      provider: 'mercadopago',
      eventId: `cancel:${subscriptionId}`,
      eventAt: new Date(deps.now()).toISOString(),
      payload: { id: subscriptionId, status: 'cancelled', source: 'cancel-subscription' },
      userId: user.id,
      subscriptionId,
      plan: subscription.plan,
      status: 'canceled',
      periodEnd: null,
      trialEnd: null,
      cancelAtPeriodEnd: true,
      scheduledChange: false,
      priceId: null,
      promotionCode: null,
    });
    if (result !== 'applied' && result !== 'duplicate') {
      deps.log(`La cancelación de Mercado Pago quedó en la base como ${result}`);
    }
  } catch {
    // Mercado Pago ya la canceló. Su aviso de subscription_preapproval lo aplica en la base
    deps.log(
      'Mercado Pago canceló la suscripción, pero la base no respondió. Lo aplicará su aviso',
    );
  }
  return json(done, 200, cors);
}
