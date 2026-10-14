// Pagos en modo prueba con Stripe (Fase P bloque 5, D-096). Lo de Mercado Pago vive en mercadopago.ts
// desde el Paso 0 de B10, y los tipos compartidos en billingTypes.ts.
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

import {
  isFounderPlan,
  isPaidPlan,
  isPassPlan,
  isUuid,
  type CheckoutContext,
  type FunctionEnv,
  type PaidPlan,
  type PaymentNotice,
} from './billingTypes.ts';
import { createMercadoPagoCheckout } from './mercadopago.ts';
import {
  asNumber,
  asRecord,
  asString,
  corsHeaders,
  hmacSha256Hex,
  json,
  safeEqual,
  subscriptionUrl,
  text,
  type Json,
} from './http.ts';

// ---------------------------------------------------------------------------------------------
// Firmas

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
  const expected = await hmacSha256Hex(input.secret, `${timestamp}.${input.rawBody}`);
  return signatures.some((signature) => safeEqual(signature, expected));
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
    // Una prueba gratis llega con payment_status no_payment_required y no es un pago. Su factura de 0
    // pesos llega como invoice.paid con monto 0, que la base no cuenta como cobro, así que tampoco
    // concreta un referido (B7, 20261019000001_referral_first_charge.sql)
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

  // Cancelar desde el portal casi siempre es al final del periodo ya pagado. Stripe lo avisa aquí
  // desde el momento de cancelar, y la suscripción como tal se borra hasta que acaba el periodo.
  // Sin esto la plataforma seguiría viéndola activa, y eso estorba, por ejemplo, para eliminar la cuenta
  if (
    type === 'customer.subscription.deleted' ||
    (type === 'customer.subscription.updated' && object.cancel_at_period_end === true)
  ) {
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

/** El id del cliente de Stripe, que llega como texto o como objeto expandido */
function customerIdOf(value: unknown): string | null {
  return asString(value) ?? asString(asRecord(value).id);
}

/**
 * Con qué cliente de Stripe pagó el alumno. Solo sale de un pago verificado que trae el id del alumno
 * puesto por create-checkout. Con él se abre después el portal donde cancela o cambia su tarjeta
 */
export function stripeCustomerLink(event: unknown): { userId: string; customerId: string } | null {
  const notice = noticeFromStripeEvent(event);
  if (notice?.kind !== 'paid' || notice.userId === null) return null;
  const object = asRecord(asRecord(asRecord(event).data).object);
  const customerId = customerIdOf(object.customer);
  return customerId === null ? null : { userId: notice.userId, customerId };
}

/**
 * Un cargo devuelto por completo. Stripe no dice a qué alumno ni a qué factura corresponde, solo el
 * cliente y el monto cobrado, y de ahí se resuelve el alumno con lo que se ligó al pagar. Los
 * reembolsos parciales se ignoran, porque quitar el plan por una devolución chica sería injusto. Esos
 * los atiende una persona
 */
export function stripeRefundFromEvent(
  event: unknown,
): { eventId: string; customerId: string; amountMxn: number; payload: Json } | null {
  const root = asRecord(event);
  const eventId = asString(root.id);
  const object = asRecord(asRecord(root.data).object);
  if (!eventId || root.type !== 'charge.refunded' || object.refunded !== true) return null;
  const customerId = customerIdOf(object.customer);
  const amountMxn = mxnFromCents(object.amount, object.currency);
  return customerId === null || amountMxn === null || amountMxn <= 0
    ? null
    : { eventId, customerId, amountMxn, payload: root };
}

// ---------------------------------------------------------------------------------------------
// Manejadores

interface CoreDeps {
  env: FunctionEnv;
  fetch: typeof fetch;
  now: () => number;
}

export interface PaymentDeps extends CoreDeps {
  /** Llama a apply_payment_notice con la llave de servicio. Devuelve su resultado */
  applyNotice: (notice: PaymentNotice) => Promise<string>;
  /** Guarda con qué cliente de Stripe pagó el alumno. Lanza si la base falla */
  linkCustomer: (link: { userId: string; customerId: string }) => Promise<void>;
  /** De qué alumno es un cliente de Stripe. null si no se ligó a nadie */
  userOfCustomer: (customerId: string) => Promise<string | null>;
}

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
  try {
    const refund = stripeRefundFromEvent(event);
    if (refund) {
      // El alumno puede no estar ligado todavía. Entonces el aviso se asienta sin alumno, para que
      // una persona lo vea en payment_webhook_events, en lugar de perderse
      const userId = await deps.userOfCustomer(refund.customerId);
      return text(
        await deps.applyNotice({
          provider: 'stripe',
          eventId: refund.eventId,
          kind: 'refunded',
          userId,
          plan: null,
          providerPaymentId: null,
          providerSubscriptionId: null,
          amountMxn: refund.amountMxn,
          periodEnd: null,
          payload: refund.payload,
        }),
        200,
      );
    }
    const notice = noticeFromStripeEvent(event);
    if (!notice) return text('Ignorado', 200);
    // Se liga antes de aplicar. Si algo falla se contesta 500 y Stripe reintenta, y las dos cosas
    // son seguras de repetir
    const link = stripeCustomerLink(event);
    if (link) await deps.linkCustomer(link);
    return text(await deps.applyNotice(notice), 200);
  } catch {
    return text('No se pudo aplicar', 500);
  }
}

// ---------------------------------------------------------------------------------------------
// Crear el pago

export interface CheckoutDeps extends CoreDeps {
  /** Quién es el usuario del token que llegó. null si no es válido */
  authenticate: (
    authorization: string | null,
  ) => Promise<{ id: string; email: string | null } | null>;
  /** Cuántos lugares de Fundador quedan. null si no se pudo saber */
  founderSeatsLeft: () => Promise<number | null>;
  /** El cliente de Stripe del alumno, si ya pagó antes. null si no se sabe o si falla */
  customerOf: (userId: string) => Promise<string | null>;
  /** La suscripción del alumno tal como está en la base. null si no tiene. Lanza si la base falla */
  subscriptionOf: (userId: string) => Promise<SubscriptionRow | null>;
  /** Deja constancia de por qué la pasarela no abrió el pago, sin llaves, para poder diagnosticarlo */
  log?: (line: string) => void;
}

/** Lo que se lee de public.subscriptions para saber si ya hay un plan pagado vigente */
export interface SubscriptionRow {
  plan: string;
  status: string;
  current_period_end: string | null;
}

const IN_FORCE_STATUSES = new Set(['active', 'past_due', 'canceled']);

/**
 * El plan pagado que el alumno todavía tiene, con la misma regla que public.user_plan en la base. La
 * cancelada y la de cobro fallido siguen valiendo hasta el fin del periodo ya pagado. Un mes regalado
 * por referido no vive en subscriptions y no cuenta, porque no es un cobro. Una fecha que no se pueda
 * leer cuenta como vigente, para que en la duda no se abra un segundo cobro
 */
export function planInForce(row: SubscriptionRow | null, nowMs: number): PaidPlan | null {
  if (!row || !isPaidPlan(row.plan) || !IN_FORCE_STATUSES.has(row.status)) return null;
  if (row.current_period_end === null) return row.status === 'active' ? row.plan : null;
  const end = Date.parse(row.current_period_end);
  return Number.isNaN(end) || end > nowMs ? row.plan : null;
}

/**
 * Por qué Stripe rechazó una petición, en una línea y sin llaves. Stripe responde con un objeto error
 * que trae el tipo, el código, el parámetro que no le gustó y un mensaje en inglés
 */
async function stripeFailure(reply: Response): Promise<string> {
  const failure = asRecord(asRecord(await reply.json().catch(() => ({}))).error);
  return [
    `estado ${String(reply.status)}`,
    `tipo ${asString(failure.type) ?? '?'}`,
    `código ${asString(failure.code) ?? '?'}`,
    `parámetro ${asString(failure.param) ?? '?'}`,
    `mensaje ${asString(failure.message) ?? '?'}`,
  ].join(', ');
}

const STRIPE_PRICE_ENV: Record<PaidPlan, keyof FunctionEnv> = {
  founder: 'STRIPE_PRICE_FOUNDER',
  founder_annual: 'STRIPE_PRICE_FOUNDER_ANNUAL',
  monthly: 'STRIPE_PRICE_MONTHLY',
  annual: 'STRIPE_PRICE_ANNUAL',
};

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
  // Mercado Pago no lleva precio Fundador (8.3)
  if (provider === 'mercadopago' && !isPassPlan(plan)) return json({ error: 'invalid' }, 400, cors);
  const appUrl = deps.env.APP_URL ?? '';
  if (appUrl === '') return json({ error: 'not_configured' }, 503, cors);

  // Con un plan pagado vigente, otro pago abriría una segunda suscripción que cobra aparte, y la base
  // solo guarda una. Cambiar de plan se hace al terminar el periodo (D-118). Si no se puede revisar,
  // no se abre el pago, porque un doble cobro es peor que pedir que lo intente de nuevo
  let inForce: PaidPlan | null;
  try {
    inForce = planInForce(await deps.subscriptionOf(user.id), deps.now());
  } catch {
    deps.log?.(
      `No se pudo revisar si ya hay un plan pagado antes de abrir el pago del plan ${plan}`,
    );
    return json({ error: 'provider' }, 502, cors);
  }
  if (inForce !== null) return json({ error: 'already_subscribed' }, 409, cors);

  let seatsLeft: number | null = null;
  if (isFounderPlan(plan)) {
    seatsLeft = await deps.founderSeatsLeft();
    if (seatsLeft !== null && seatsLeft <= 0) return json({ error: 'founder_full' }, 409, cors);
  }
  const back = (result: 'ok' | 'cancelado') => subscriptionUrl(appUrl, { pago: result });

  try {
    if (provider === 'stripe') {
      const key = deps.env.STRIPE_SECRET_KEY ?? '';
      const price = (deps.env[STRIPE_PRICE_ENV[plan]] ?? '').trim();
      if (key === '' || price === '') return json({ error: 'not_configured' }, 503, cors);
      // En el panel de Stripe el ID del producto (prod_) se ve antes que el del precio (price_), y
      // Stripe rechaza el producto. Se avisa sin llamar a Stripe y diciendo qué secreto cambiar
      if (!price.startsWith('price_')) {
        deps.log?.(
          `${STRIPE_PRICE_ENV[plan]} no es un Price ID. Debe empezar con price_ y empieza con ${price.split('_')[0] ?? '?'}_. Cópialo de la sección Pricing del producto en Stripe`,
        );
        return json({ error: 'not_configured' }, 503, cors);
      }
      const form = new URLSearchParams({
        mode: 'subscription',
        'line_items[0][price]': price,
        'line_items[0][quantity]': '1',
        success_url: back('ok'),
        cancel_url: back('cancelado'),
        // La página de pago en el español de América Latina, como la app
        locale: 'es-419',
        client_reference_id: user.id,
        'metadata[user_id]': user.id,
        'metadata[plan]': plan,
        // La suscripción y sus facturas llevan el mismo dato, para los cobros siguientes
        'subscription_data[metadata][user_id]': user.id,
        'subscription_data[metadata][plan]': plan,
      });
      // Quien ya pagó antes vuelve a su mismo cliente de Stripe, para que sus facturas, su portal y
      // un reembolso no queden repartidos en dos clientes. Si no tiene, Stripe crea uno con su correo
      const known = await deps.customerOf(user.id).catch(() => null);
      const withTax = deps.env.STRIPE_AUTOMATIC_TAX === 'true';
      if (withTax) {
        form.set('automatic_tax[enabled]', 'true');
        form.set('billing_address_collection', 'required');
        form.set('tax_id_collection[enabled]', 'true');
      }
      const open = async (customer: string | null) => {
        const body = new URLSearchParams(form);
        if (customer) {
          body.set('customer', customer);
          // Con un cliente que ya existe, Stripe pide permiso para guardar en él la dirección y el
          // nombre que se capturen para calcular el impuesto
          if (withTax) {
            body.set('customer_update[address]', 'auto');
            body.set('customer_update[name]', 'auto');
          }
        } else if (user.email) body.set('customer_email', user.email);
        return deps.fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body,
        });
      };
      let reply = await open(known);
      // El cliente guardado puede ya no existir, por ejemplo si se borró en Stripe o si se cambió de
      // llaves de prueba a las reales. Entonces se reintenta una vez como alumno nuevo
      if (!reply.ok && known) reply = await open(null);
      if (!reply.ok) {
        deps.log?.(`Stripe rechazó el pago del plan ${plan}. ${await stripeFailure(reply)}`);
        return json({ error: 'provider' }, 502, cors);
      }
      const url = asString(asRecord(await reply.json()).url);
      if (url) return json({ url }, 200, cors);
      deps.log?.(`Stripe creó el pago del plan ${plan} pero no mandó la dirección`);
      return json({ error: 'provider' }, 502, cors);
    }

    if (!isPassPlan(plan)) return json({ error: 'invalid' }, 400, cors);
    // Lo que se sabe del alumno antes de B10. Al cambiar a checkout_context se pasa completo
    const context: CheckoutContext = {
      inForce: null,
      subscription: null,
      passEnd: null,
      trialAvailable: false,
      trialDays: 0,
      founderOpen: seatsLeft === null || seatsLeft > 0,
      founderSeatsLeft: seatsLeft ?? 0,
      founderLost: false,
      oxxoExpiresDays: 3,
      customerId: null,
    };
    const created = await createMercadoPagoCheckout({
      user,
      plan,
      mode: 'pass',
      context,
      env: deps.env,
      fetch: deps.fetch,
      log: (line) => deps.log?.(line),
    });
    if (created.ok) return json({ url: created.url }, 200, cors);
    return json(
      { error: created.error },
      created.error === 'not_configured' ? 503 : created.error === 'invalid' ? 400 : 502,
      cors,
    );
  } catch (error) {
    // Sin red hacia la pasarela, o una respuesta que no se pudo leer. Solo el tipo de error, que no
    // lleva llaves ni datos del alumno
    const kind = error instanceof Error ? error.name : typeof error;
    deps.log?.(`No se pudo crear el pago del plan ${plan} con ${provider}. ${kind}`);
    return json({ error: 'provider' }, 502, cors);
  }
}

// ---------------------------------------------------------------------------------------------
// Portal de facturación

export interface PortalDeps extends CoreDeps {
  authenticate: CheckoutDeps['authenticate'];
  /** El cliente de Stripe del alumno. null si nunca pagó con Stripe */
  customerOf: (userId: string) => Promise<string | null>;
  /** Deja constancia de por qué falló Stripe, sin llaves, para que se pueda diagnosticar */
  log: (line: string) => void;
}

/**
 * Abre el portal de Stripe donde el alumno cancela su suscripción, cambia su tarjeta o ve sus
 * facturas. El cliente sale de lo que se ligó al pagar y nunca de lo que mande el navegador, así que
 * nadie puede abrir el portal de otra persona. La cancelación llega después como un aviso normal
 */
export async function handleCreatePortal(request: Request, deps: PortalDeps): Promise<Response> {
  const cors = corsHeaders(deps.env, request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  const user = await deps.authenticate(request.headers.get('authorization'));
  if (!user) return json({ error: 'unauthorized' }, 401, cors);
  const key = deps.env.STRIPE_SECRET_KEY ?? '';
  const appUrl = deps.env.APP_URL ?? '';
  if (key === '' || appUrl === '') return json({ error: 'not_configured' }, 503, cors);
  try {
    const customer = await deps.customerOf(user.id);
    if (customer === null) return json({ error: 'no_customer' }, 404, cors);
    const reply = await deps.fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ customer, return_url: subscriptionUrl(appUrl) }),
    });
    if (!reply.ok) {
      const failure = asRecord(asRecord(await reply.json().catch(() => ({}))).error);
      deps.log(
        `Stripe rechazó el portal. estado ${reply.status}, tipo ${asString(failure.type) ?? '?'}, mensaje ${asString(failure.message) ?? '?'}`,
      );
      return json({ error: 'provider' }, 502, cors);
    }
    const url = asString(asRecord(await reply.json()).url);
    return url ? json({ url }, 200, cors) : json({ error: 'provider' }, 502, cors);
  } catch {
    return json({ error: 'provider' }, 502, cors);
  }
}
