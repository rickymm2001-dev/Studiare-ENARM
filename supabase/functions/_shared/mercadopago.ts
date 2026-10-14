// Mercado Pago en las funciones de pago (Fase P bloque 5, D-096, y B10 del plan del cambio).
//
// Se mudó de payments.ts en el Paso 0 de B10 sin cambiar su lógica. Desde aquí es del paquete C, que le
// suma la suscripción (preapproval), los temas nuevos del aviso y la cancelación (2.5 del diseño). Lo
// que este módulo le da a payments.ts y a runtime.ts es el contrato de billingTypes.ts
// (createMercadoPagoCheckout con MercadoPagoCheckoutInput, y MercadoPagoWebhookDeps).
//
// Reglas que se cumplen aquí
//   - Un aviso solo cuenta si su firma es válida. Sin firma, con firma vieja o con firma de otro
//     secreto, la respuesta es 401 y no se toca la base
//   - Quién pagó y qué plan salen de la referencia que puso create-checkout al crear el pago, nunca de
//     lo que mande el navegador. La notificación solo trae el id del pago, así que se consulta el pago
//     a Mercado Pago con el token del servidor y se confía en esa respuesta
//   - Un aviso que no entendemos se contesta con 200 para que no insista. Si la base falla se contesta
//     con 500 para que lo reintente, y reintentar es seguro porque la base reconoce el aviso repetido
import {
  PLAN_PRICES_MXN,
  PLAN_TITLES,
  isPaidPlan,
  isUuid,
  type MercadoPagoCheckoutInput,
  type MercadoPagoCheckoutResult,
  type MercadoPagoWebhookDeps,
  type PaidPlan,
  type PaymentNotice,
} from './billingTypes.ts';
import {
  asNumber,
  asRecord,
  asString,
  hmacSha256Hex,
  readJsonRecord,
  safeEqual,
  subscriptionUrl,
  text,
} from './http.ts';

/** Una notificación más vieja que esto se rechaza, para que no sirva repetirla */
export const MERCADOPAGO_TOLERANCE_MS = 300_000;

/**
 * Firma de Mercado Pago. El encabezado x-signature trae ts y v1. El mensaje firmado es
 * "id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;" y omite lo que no llegó. El HMAC
 * SHA-256 en hexadecimal con el secreto de la integración debe ser igual a v1
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
  let ts = '';
  let v1 = '';
  for (const piece of input.header.split(',')) {
    const [name, ...rest] = piece.trim().split('=');
    if (name === 'ts') ts = rest.join('=');
    else if (name === 'v1') v1 = rest.join('=');
  }
  const stamp = Number(ts);
  if (!Number.isFinite(stamp) || v1 === '') return false;
  // ts viene en milisegundos. Una notificación muy vieja se rechaza para que no sirva repetirla
  if (Math.abs(input.nowMs - stamp) > (input.toleranceMs ?? MERCADOPAGO_TOLERANCE_MS)) {
    return false;
  }
  let manifest = '';
  if (input.dataId) manifest += `id:${input.dataId.toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;
  return safeEqual(v1, await hmacSha256Hex(input.secret, manifest));
}

/** La referencia externa que pone create-checkout. user_id|plan */
export function parseExternalReference(
  reference: unknown,
): { userId: string; plan: PaidPlan } | null {
  if (typeof reference !== 'string') return null;
  const [userId, plan] = reference.split('|');
  return isUuid(userId) && isPaidPlan(plan) ? { userId, plan } : null;
}

export function noticeFromMercadoPagoPayment(payment: unknown): PaymentNotice | null {
  const root = asRecord(payment);
  const id = root.id;
  const paymentId = typeof id === 'number' || typeof id === 'string' ? String(id) : null;
  const status = asString(root.status);
  if (!paymentId || !status) return null;
  const reference = parseExternalReference(root.external_reference);
  const amount = asNumber(root.transaction_amount);
  const kind: PaymentNotice['kind'] | null =
    status === 'approved'
      ? 'paid'
      : status === 'refunded' || status === 'charged_back'
        ? 'refunded'
        : null;
  if (!kind) return null;
  return {
    provider: 'mercadopago',
    // Cada cambio de estado de un pago se aplica una vez. Las repeticiones del mismo estado no
    eventId: `${paymentId}:${status}`,
    kind,
    userId: reference?.userId ?? null,
    plan: reference?.plan ?? null,
    providerPaymentId: paymentId,
    providerSubscriptionId: null,
    amountMxn: String(root.currency_id).toUpperCase() === 'MXN' && amount !== null ? amount : null,
    periodEnd: null,
    payload: root,
  };
}

/**
 * Aviso de Mercado Pago. La notificación solo trae el id del pago, así que después de verificar la
 * firma se consulta el pago a Mercado Pago con el token del servidor y se confía en esa respuesta
 */
export async function handleMercadoPagoWebhook(
  request: Request,
  deps: MercadoPagoWebhookDeps,
): Promise<Response> {
  if (request.method !== 'POST') return text('Método no permitido', 405);
  const secret = deps.env.MERCADOPAGO_WEBHOOK_SECRET ?? '';
  const token = deps.env.MERCADOPAGO_ACCESS_TOKEN ?? '';
  if (secret === '' || token === '') return text('Mercado Pago no está configurado', 503);
  const url = new URL(request.url);
  const body = await readJsonRecord(request);
  const dataId = url.searchParams.get('data.id') ?? asString(asRecord(body.data).id);
  const valid = await verifyMercadoPagoSignature({
    header: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    dataId,
    secret,
    nowMs: deps.now(),
  });
  if (!valid) return text('Firma inválida', 401);
  const type = url.searchParams.get('type') ?? asString(body.type);
  if (type !== 'payment' || !dataId || !/^[0-9]+$/.test(dataId)) return text('Ignorado', 200);
  let payment: unknown;
  try {
    const reply = await deps.fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!reply.ok) return text('No se pudo consultar el pago', 502);
    payment = await reply.json();
  } catch {
    return text('No se pudo consultar el pago', 502);
  }
  const notice = noticeFromMercadoPagoPayment(payment);
  if (!notice) return text('Ignorado', 200);
  try {
    return text(await deps.applyNotice(notice), 200);
  } catch {
    return text('No se pudo aplicar', 500);
  }
}

/**
 * Crea el pago en Mercado Pago y devuelve la dirección donde se paga. Hoy es el pago único de Checkout
 * Pro (preferencia) del plan, como antes de B10. El paquete C suma la suscripción con preapproval y la
 * referencia user_id|plan|modo (2.5 del diseño)
 */
export async function createMercadoPagoCheckout(
  input: MercadoPagoCheckoutInput,
): Promise<MercadoPagoCheckoutResult> {
  const token = input.env.MERCADOPAGO_ACCESS_TOKEN ?? '';
  const appUrl = input.env.APP_URL ?? '';
  if (token === '' || appUrl === '') return { ok: false, error: 'not_configured' };
  const back = (result: 'ok' | 'cancelado') => subscriptionUrl(appUrl, { pago: result });
  const plan = input.plan;
  const preference: Record<string, unknown> = {
    items: [
      {
        id: plan,
        title: PLAN_TITLES[plan],
        quantity: 1,
        currency_id: 'MXN',
        unit_price: PLAN_PRICES_MXN[plan],
      },
    ],
    external_reference: `${input.user.id}|${plan}`,
    back_urls: { success: back('ok'), failure: back('cancelado'), pending: back('ok') },
    auto_return: 'approved',
  };
  if (input.env.FUNCTIONS_URL) {
    preference.notification_url = `${input.env.FUNCTIONS_URL.replace(/\/+$/, '')}/payment-webhook-mercadopago`;
  }
  try {
    const reply = await input.fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(preference),
    });
    if (!reply.ok) {
      input.log(`Mercado Pago rechazó el pago del plan ${plan}. estado ${String(reply.status)}`);
      return { ok: false, error: 'provider' };
    }
    const created = asRecord(await reply.json());
    // En modo prueba Mercado Pago devuelve también una dirección de sandbox
    const url = asString(created.init_point) ?? asString(created.sandbox_init_point);
    return url ? { ok: true, url } : { ok: false, error: 'provider' };
  } catch (error) {
    // Sin red hacia la pasarela, o una respuesta que no se pudo leer. Solo el tipo de error, que no
    // lleva llaves ni datos del alumno
    const kind = error instanceof Error ? error.name : typeof error;
    input.log(`No se pudo crear el pago del plan ${plan} con mercadopago. ${kind}`);
    return { ok: false, error: 'provider' };
  }
}
