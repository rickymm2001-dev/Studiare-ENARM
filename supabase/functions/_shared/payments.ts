// Pagos en modo prueba con Stripe y Mercado Pago (Fase P bloque 5, D-096).
//
// Este módulo es la lógica de las funciones de Supabase (Edge Functions) y no sabe de Deno. Recibe
// sus dependencias, el entorno con las llaves, fetch, el reloj y la llamada a la base, así se prueba
// con Vitest igual que en producción. Los archivos index.ts de cada función solo arman esas
// dependencias y llaman aquí.
//
// Reglas que se cumplen aquí
//   - Un aviso solo cuenta si su firma es válida. Sin firma, con firma vieja o con firma de otro
//     secreto, la respuesta es 401 y no se toca la base
//   - Quién pagó y qué plan salen de los datos que puso esta misma función al crear el pago, nunca
//     de lo que mande el navegador
//   - Un aviso que no entendemos se contesta con 200 para que el procesador no insista. Si la base
//     falla se contesta con 500 para que lo reintente. Reintentar es seguro, porque la base reconoce
//     el aviso repetido por su id
//   - Ningún secreto vive en el repo. Las llaves se leen del entorno de la función
//
// Los campos de Stripe y de Mercado Pago que se leen están documentados en sus guías de webhooks. No
// se pudo consultar su documentación desde este entorno, así que la lectura es tolerante a las dos
// formas de Stripe (la anterior y la de parent.subscription_details) y falta confirmarla con un pago
// de prueba real. Queda dicho en la guía.

export type Provider = 'stripe' | 'mercadopago';
export type PaidPlan = 'founder' | 'monthly' | 'annual';
export type NoticeKind = 'paid' | 'failed' | 'canceled' | 'refunded';

/** Lo que la base necesita de un aviso, ya traducido y verificado */
export interface PaymentNotice {
  provider: Provider;
  eventId: string;
  kind: NoticeKind;
  userId: string | null;
  plan: PaidPlan | null;
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  amountMxn: number | null;
  periodEnd: string | null;
  payload: Record<string, unknown>;
}

/** Precios en pesos y nombre de cada plan. Una prueba confirma que coinciden con src/config/billing.ts */
export const PLAN_PRICES_MXN: Record<PaidPlan, number> = {
  founder: 79,
  monthly: 150,
  annual: 1200,
};
export const PLAN_TITLES: Record<PaidPlan, string> = {
  founder: 'Studiare. Plan Fundador',
  monthly: 'Studiare. Plan mensual',
  annual: 'Studiare. Plan anual',
};
const PAID_PLANS = Object.keys(PLAN_PRICES_MXN) as PaidPlan[];

export const isPaidPlan = (value: unknown): value is PaidPlan =>
  typeof value === 'string' && (PAID_PLANS as string[]).includes(value);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

// ---------------------------------------------------------------------------------------------
// Firmas

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compara sin que el tiempo delate dónde difieren */
export function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

export const STRIPE_TOLERANCE_SECONDS = 300;

/**
 * Firma de Stripe. El encabezado Stripe-Signature trae t=marca de tiempo y una o más v1=firma. La
 * firma es el HMAC SHA-256 en hexadecimal de "t.cuerpo" con el secreto del endpoint. Se acepta si
 * alguna v1 coincide y la marca de tiempo no es más vieja que la tolerancia
 */
export async function verifyStripeSignature(input: {
  rawBody: string;
  header: string | null;
  secret: string;
  nowMs: number;
  toleranceSeconds?: number;
}): Promise<boolean> {
  if (!input.header || input.secret === '') return false;
  let timestamp = '';
  const signatures: string[] = [];
  for (const piece of input.header.split(',')) {
    const [name, ...rest] = piece.trim().split('=');
    const value = rest.join('=');
    if (name === 't') timestamp = value;
    else if (name === 'v1') signatures.push(value);
  }
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || signatures.length === 0) return false;
  const tolerance = input.toleranceSeconds ?? STRIPE_TOLERANCE_SECONDS;
  if (Math.abs(input.nowMs / 1000 - seconds) > tolerance) return false;
  const expected = await hmacHex(input.secret, `${timestamp}.${input.rawBody}`);
  return signatures.some((signature) => safeEqual(signature, expected));
}

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
  if (Math.abs(input.nowMs - stamp) > (input.toleranceMs ?? STRIPE_TOLERANCE_SECONDS * 1000)) {
    return false;
  }
  let manifest = '';
  if (input.dataId) manifest += `id:${input.dataId.toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;
  return safeEqual(v1, await hmacHex(input.secret, manifest));
}

// ---------------------------------------------------------------------------------------------
// De un evento de Stripe a un aviso

const unixToIso = (seconds: unknown): string | null => {
  const value = asNumber(seconds);
  return value === null ? null : new Date(value * 1000).toISOString();
};

/** Centavos a pesos. null si la moneda no es peso mexicano */
function mxnFromCents(amount: unknown, currency: unknown): number | null {
  const cents = asNumber(amount);
  if (cents === null || String(currency).toLowerCase() !== 'mxn') return null;
  return Math.round(cents) / 100;
}

/** Id del usuario y plan que esta misma función puso en la sesión o en la suscripción */
function ownMetadata(...sources: unknown[]): { userId: string | null; plan: PaidPlan | null } {
  for (const source of sources) {
    const metadata = asRecord(source);
    const userId = metadata.user_id;
    if (isUuid(userId)) {
      const plan = metadata.plan;
      return { userId, plan: isPaidPlan(plan) ? plan : null };
    }
  }
  return { userId: null, plan: null };
}

export function noticeFromStripeEvent(event: unknown): PaymentNotice | null {
  const root = asRecord(event);
  const eventId = asString(root.id);
  const type = asString(root.type);
  const object = asRecord(asRecord(root.data).object);
  if (!eventId || !type) return null;
  const base = { provider: 'stripe' as const, eventId, payload: root };

  if (type === 'checkout.session.completed') {
    if (object.payment_status !== 'paid') return null;
    const { userId, plan } = ownMetadata({
      user_id: object.client_reference_id,
      plan: asRecord(object.metadata).plan,
    });
    return {
      ...base,
      kind: 'paid',
      userId,
      plan,
      // La factura es el mismo id que traerá invoice.paid, así el pago no se cuenta dos veces
      providerPaymentId:
        asString(object.invoice) ?? asString(object.payment_intent) ?? asString(object.id),
      providerSubscriptionId: asString(object.subscription),
      amountMxn: mxnFromCents(object.amount_total, object.currency),
      periodEnd: null,
    };
  }

  if (type === 'invoice.paid' || type === 'invoice.payment_failed') {
    const parent = asRecord(asRecord(object.parent).subscription_details);
    const legacy = asRecord(object.subscription_details);
    const lines = asRecord(object.lines).data;
    const firstLine = asRecord(Array.isArray(lines) ? (lines as unknown[])[0] : null);
    const { userId, plan } = ownMetadata(
      parent.metadata,
      legacy.metadata,
      firstLine.metadata,
      asRecord(firstLine.parent).subscription_item_details,
    );
    const paid = type === 'invoice.paid';
    return {
      ...base,
      kind: paid ? 'paid' : 'failed',
      userId,
      plan,
      providerPaymentId: asString(object.id),
      providerSubscriptionId:
        asString(parent.subscription) ?? asString(object.subscription) ?? null,
      amountMxn: paid ? mxnFromCents(object.amount_paid, object.currency) : null,
      periodEnd: unixToIso(asRecord(firstLine.period).end),
    };
  }

  if (type === 'customer.subscription.deleted') {
    const { userId } = ownMetadata(object.metadata);
    return {
      ...base,
      kind: 'canceled',
      userId,
      plan: null,
      providerPaymentId: null,
      providerSubscriptionId: asString(object.id),
      amountMxn: null,
      periodEnd: null,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// De un pago de Mercado Pago a un aviso

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
  const kind: NoticeKind | null =
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

// ---------------------------------------------------------------------------------------------
// Manejadores

export interface FunctionEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_FOUNDER?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_ANNUAL?: string;
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
  /** Dirección pública de la app, con la que se arman las URL de regreso y el CORS */
  APP_URL?: string;
  /** Dirección pública de las funciones, para la notificación de Mercado Pago */
  FUNCTIONS_URL?: string;
}

export interface PaymentDeps {
  env: FunctionEnv;
  fetch: typeof fetch;
  now: () => number;
  /** Llama a apply_payment_notice con la llave de servicio. Devuelve su resultado */
  applyNotice: (notice: PaymentNotice) => Promise<string>;
}

/** El cuerpo como objeto, o uno vacío si no llegó o no es JSON */
async function readJsonRecord(request: Request): Promise<Json> {
  try {
    return asRecord(JSON.parse(await request.text()));
  } catch {
    return {};
  }
}

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

/** Aviso de Stripe. Verifica la firma sobre el cuerpo tal cual llegó, antes de leerlo como JSON */
export async function handleStripeWebhook(request: Request, deps: PaymentDeps): Promise<Response> {
  if (request.method !== 'POST') return text('Método no permitido', 405);
  const secret = deps.env.STRIPE_WEBHOOK_SECRET ?? '';
  if (secret === '') return text('Stripe no está configurado', 503);
  const rawBody = await request.text();
  const valid = await verifyStripeSignature({
    rawBody,
    header: request.headers.get('stripe-signature'),
    secret,
    nowMs: deps.now(),
  });
  if (!valid) return text('Firma inválida', 401);
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return text('Cuerpo inválido', 400);
  }
  const notice = noticeFromStripeEvent(event);
  if (!notice) return text('Ignorado', 200);
  try {
    const result = await deps.applyNotice(notice);
    return text(result, 200);
  } catch {
    return text('No se pudo aplicar', 500);
  }
}

/**
 * Aviso de Mercado Pago. La notificación solo trae el id del pago, así que después de verificar la
 * firma se consulta el pago a Mercado Pago con el token del servidor y se confía en esa respuesta
 */
export async function handleMercadoPagoWebhook(
  request: Request,
  deps: PaymentDeps,
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

// ---------------------------------------------------------------------------------------------
// Crear el pago

export interface CheckoutDeps extends Omit<PaymentDeps, 'applyNotice'> {
  /** Quién es el usuario del token que llegó. null si no es válido */
  authenticate: (
    authorization: string | null,
  ) => Promise<{ id: string; email: string | null } | null>;
  /** Cuántos lugares de Fundador quedan. null si no se pudo saber */
  founderSeatsLeft: () => Promise<number | null>;
}

const STRIPE_PRICE_ENV: Record<PaidPlan, keyof FunctionEnv> = {
  founder: 'STRIPE_PRICE_FOUNDER',
  monthly: 'STRIPE_PRICE_MONTHLY',
  annual: 'STRIPE_PRICE_ANNUAL',
};

function originOf(value: string | undefined): string {
  try {
    return value ? new URL(value).origin : '';
  } catch {
    return '';
  }
}

/** Solo la página de la app puede llamar a la función desde el navegador */
export function corsHeaders(env: FunctionEnv, origin: string | null): Record<string, string> {
  const allowed = originOf(env.APP_URL);
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
  if (allowed !== '' && origin === allowed) headers['access-control-allow-origin'] = allowed;
  return headers;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Crea la sesión de pago con la llave del servidor y devuelve la dirección donde se paga */
export async function handleCreateCheckout(
  request: Request,
  deps: CheckoutDeps,
): Promise<Response> {
  const cors = corsHeaders(deps.env, request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  const user = await deps.authenticate(request.headers.get('authorization'));
  if (!user) return json({ error: 'unauthorized' }, 401, cors);

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ error: 'invalid' }, 400, cors);
  }
  const body = asRecord(parsed);
  const plan = body.plan;
  const provider = body.provider;
  if (!isPaidPlan(plan) || (provider !== 'stripe' && provider !== 'mercadopago')) {
    return json({ error: 'invalid' }, 400, cors);
  }
  const appUrl = deps.env.APP_URL ?? '';
  if (appUrl === '') return json({ error: 'not_configured' }, 503, cors);

  if (plan === 'founder') {
    const left = await deps.founderSeatsLeft();
    if (left !== null && left <= 0) return json({ error: 'founder_full' }, 409, cors);
  }
  const back = (result: 'ok' | 'cancelado') => {
    const target = new URL(appUrl);
    target.pathname = `${target.pathname.replace(/\/+$/, '')}/suscripcion`;
    target.searchParams.set('pago', result);
    return target.toString();
  };

  try {
    if (provider === 'stripe') {
      const key = deps.env.STRIPE_SECRET_KEY ?? '';
      const price = deps.env[STRIPE_PRICE_ENV[plan]] ?? '';
      if (key === '' || price === '') return json({ error: 'not_configured' }, 503, cors);
      const form = new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': price,
        'line_items[0][quantity]': '1',
        success_url: back('ok'),
        cancel_url: back('cancelado'),
        client_reference_id: user.id,
        'metadata[user_id]': user.id,
        'metadata[plan]': plan,
        // La suscripción y sus facturas llevan el mismo dato, para los cobros siguientes
        'subscription_data[metadata][user_id]': user.id,
        'subscription_data[metadata][plan]': plan,
      });
      if (user.email) form.set('customer_email', user.email);
      const reply = await deps.fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });
      if (!reply.ok) return json({ error: 'provider' }, 502, cors);
      const url = asString(asRecord(await reply.json()).url);
      return url ? json({ url }, 200, cors) : json({ error: 'provider' }, 502, cors);
    }

    const token = deps.env.MERCADOPAGO_ACCESS_TOKEN ?? '';
    if (token === '') return json({ error: 'not_configured' }, 503, cors);
    const preference: Json = {
      items: [
        {
          id: plan,
          title: PLAN_TITLES[plan],
          quantity: 1,
          currency_id: 'MXN',
          unit_price: PLAN_PRICES_MXN[plan],
        },
      ],
      external_reference: `${user.id}|${plan}`,
      back_urls: { success: back('ok'), failure: back('cancelado'), pending: back('ok') },
      auto_return: 'approved',
    };
    if (deps.env.FUNCTIONS_URL) {
      preference.notification_url = `${deps.env.FUNCTIONS_URL.replace(/\/+$/, '')}/payment-webhook-mercadopago`;
    }
    const reply = await deps.fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(preference),
    });
    if (!reply.ok) return json({ error: 'provider' }, 502, cors);
    const created = asRecord(await reply.json());
    // En modo prueba Mercado Pago devuelve también una dirección de sandbox
    const url = asString(created.init_point) ?? asString(created.sandbox_init_point);
    return url ? json({ url }, 200, cors) : json({ error: 'provider' }, 502, cors);
  } catch {
    return json({ error: 'provider' }, 502, cors);
  }
}
