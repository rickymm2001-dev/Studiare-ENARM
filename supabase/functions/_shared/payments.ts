// Pagos con Stripe en las funciones de Supabase (Fase P bloque 5, D-096, y B10 del plan del cambio).
//
// Este módulo tiene los manejadores de create-checkout, create-portal-session y payment-webhook-stripe, y
// no sabe de Deno. Recibe sus dependencias, el entorno con las llaves, fetch, el reloj y las llamadas a la
// base, así se prueba con Vitest igual que en producción. Los archivos index.ts de cada función solo arman
// esas dependencias y llaman aquí. Lo de Stripe vive en stripe.ts, lo de Mercado Pago en mercadopago.ts y
// los tipos que comparten en billingTypes.ts.
//
// Reglas que se cumplen aquí
//   - Un aviso solo cuenta si su firma es válida. Sin firma, con firma vieja o con firma de otro
//     secreto, la respuesta es 401 y no se toca la base
//   - Quién pagó y qué plan salen de los datos que puso esta misma función al crear el pago, nunca
//     de lo que mande el navegador. El plan de una suscripción sale de su Price ID
//   - Qué plan tiene cada quien lo decide la base (checkout_context y las funciones de aviso). Aquí no
//     se repite esa regla
//   - Un aviso que no entendemos se contesta con 200 para que el procesador no insista. Si la base
//     falla, o la lectura a Stripe falla antes de aplicar, se contesta con 500 para que lo reintente.
//     Reintentar es seguro, porque la base reconoce el aviso repetido por su id
//   - Ningún secreto vive en el repo. Las llaves se leen del entorno de la función y nunca van al
//     registro
import {
  isFounderPlan,
  isPaidPlan,
  isPassPlan,
  type AuthenticatedUser,
  type BillingAction,
  type ChargeNotice,
  type CheckoutContext,
  type CheckoutError,
  type CheckoutFlags,
  type CheckoutMode,
  type CheckoutRequest,
  type FunctionEnv,
  type Provider,
  type SubscriptionNotice,
  type TrialEndingNotice,
} from './billingTypes.ts';
import {
  asRecord,
  asString,
  corsHeaders,
  hmacSha256Hex,
  json,
  safeEqual,
  text,
  type Json,
} from './http.ts';
import { createMercadoPagoCheckout } from './mercadopago.ts';
import {
  PASS_PRICE_SECRETS,
  PLAN_PRICE_SECRETS,
  breakdownPromotionCodeIds,
  checkoutSessionSteps,
  customerParams,
  idOf,
  invoiceChargeNotice,
  invoiceOfPayments,
  invoicePaymentParams,
  lostDispute,
  mxnFromCents,
  isMissingCustomer,
  passSessionParams,
  portalSessionParams,
  priceFromEnv,
  promotionCodeOf,
  refundedCharge,
  runStripeAction,
  sessionNeedsRead,
  sessionReadParams,
  stripeCall,
  stripeFailureLine,
  subscriptionNotice,
  subscriptionSessionParams,
  trialEndingNotice,
  unixToIso,
  type StripeClient,
} from './stripe.ts';

// ---------------------------------------------------------------------------------------------
// Firma de Stripe

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
// Aviso de Stripe

interface CoreDeps {
  env: FunctionEnv;
  fetch: typeof fetch;
  now: () => number;
  /** Deja constancia de por qué algo falló, sin llaves ni datos del alumno */
  log: (line: string) => void;
}

export interface StripeWebhookDeps extends CoreDeps {
  applyCharge: (notice: ChargeNotice) => Promise<string>;
  applySubscriptionState: (notice: SubscriptionNotice) => Promise<string>;
  noteTrialWillEnd: (notice: TrialEndingNotice) => Promise<string>;
  /** Guarda con qué cliente de Stripe paga el alumno. Lanza si la base falla */
  linkCustomer: (link: { userId: string; customerId: string }) => Promise<void>;
  /** De qué alumno es un cliente de Stripe. null si no se ligó a nadie. Lanza si la base falla */
  userOfCustomer: (customerId: string) => Promise<string | null>;
  claimBillingActions: (options: {
    limit: number;
    provider: Provider | null;
  }) => Promise<BillingAction[]>;
  finishBillingAction: (result: { id: string; ok: boolean; error: string | null }) => Promise<void>;
}

/** Un paso que se aplica en la base, en orden */
type WebhookStep =
  | { type: 'link'; userId: string; customerId: string }
  | { type: 'state'; notice: SubscriptionNotice }
  | { type: 'charge'; notice: ChargeNotice }
  | { type: 'trial_will_end'; notice: TrialEndingNotice };

/** El alumno de un aviso que no lo trae en su metadata, por su cliente de Stripe */
async function withUser<T extends { userId: string | null }>(
  notice: T,
  customer: unknown,
  deps: StripeWebhookDeps,
): Promise<T> {
  const customerId = idOf(customer);
  if (notice.userId !== null || customerId === null) return notice;
  return { ...notice, userId: await deps.userOfCustomer(customerId) };
}

/**
 * La sesión leída con el texto de su código de descuento. Si ni la sesión ni su suscripción lo traen,
 * se lee del código que aparece en el desglose. Si esa lectura falla, el aviso se aplica sin código,
 * porque el código solo sirve para contar y no cambia el plan
 */
async function withPromotionCode(
  session: Json,
  client: StripeClient,
  deps: StripeWebhookDeps,
): Promise<Json> {
  if (promotionCodeOf(session.discounts, asRecord(session.subscription).discounts) !== null) {
    return session;
  }
  const promotionId = breakdownPromotionCodeIds(session)[0];
  if (!promotionId) return session;
  try {
    const reply = await stripeCall(
      client,
      'GET',
      `/v1/promotion_codes/${encodeURIComponent(promotionId)}`,
    );
    if (reply.ok && asString(reply.body.code)) {
      return { ...session, discounts: [{ promotion_code: reply.body }] };
    }
    deps.log(`No se pudo leer el código de descuento. ${stripeFailureLine(reply)}`);
  } catch {
    deps.log('Sin red hacia Stripe al leer el código de descuento');
  }
  return session;
}

/**
 * Un reembolso con la factura que pagó su PaymentIntent, para que la base encuentre el cobro de la
 * suscripción por su id exacto (in_) y no por monto y hora. Un pase no tiene factura y se encuentra por su
 * PaymentIntent. Lanza si Stripe no contesta, y entonces se responde 500 para que Stripe lo reintente
 */
async function withInvoice(notice: ChargeNotice, deps: StripeWebhookDeps): Promise<ChargeNotice> {
  const intent = notice.paymentIntentId;
  if (intent === null || notice.providerPaymentId !== null) return notice;
  const key = deps.env.STRIPE_SECRET_KEY ?? '';
  if (key === '') {
    deps.log(
      'Falta STRIPE_SECRET_KEY para buscar la factura del reembolso. Se aplica con su PaymentIntent',
    );
    return notice;
  }
  const reply = await stripeCall(
    { key, fetch: deps.fetch },
    'GET',
    '/v1/invoice_payments',
    invoicePaymentParams(intent),
  );
  if (!reply.ok) {
    deps.log(`No se pudo buscar la factura del reembolso. ${stripeFailureLine(reply)}`);
    throw new Error('lectura de la factura');
  }
  const invoiceId = invoiceOfPayments(reply.body);
  return invoiceId === null ? notice : { ...notice, providerPaymentId: invoiceId };
}

/**
 * Lo que hay que aplicar por un evento (2.4). null si el evento no se usa. Lanza si la base o la
 * lectura a Stripe fallan, y entonces no se aplicó nada
 */
async function webhookSteps(event: Json, deps: StripeWebhookDeps): Promise<WebhookStep[] | null> {
  const eventId = asString(event.id);
  const type = asString(event.type);
  const object = asRecord(asRecord(event.data).object);
  if (!eventId || !type) return null;
  const context = {
    eventId,
    eventAt: unixToIso(event.created) ?? new Date(deps.now()).toISOString(),
    payload: event,
    env: deps.env,
    log: deps.log,
  };

  switch (type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed': {
      let session: unknown = object;
      let readAt = context.eventAt;
      if (sessionNeedsRead(object)) {
        const key = deps.env.STRIPE_SECRET_KEY ?? '';
        const sessionId = asString(object.id);
        if (key === '' || !sessionId) {
          deps.log(
            'Falta STRIPE_SECRET_KEY para leer la sesión de pago. Se aplica con los datos del aviso',
          );
        } else {
          // La suscripción leída es más nueva que cualquier aviso anterior, por eso cuenta la hora de
          // la lectura. Si la lectura falla se contesta 500 antes de aplicar nada
          const reply = await stripeCall(
            { key, fetch: deps.fetch },
            'GET',
            `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
            sessionReadParams(),
          );
          if (!reply.ok) {
            deps.log(`No se pudo leer la sesión de pago. ${stripeFailureLine(reply)}`);
            throw new Error('lectura de la sesión');
          }
          session = await withPromotionCode(reply.body, { key, fetch: deps.fetch }, deps);
          readAt = new Date(deps.now()).toISOString();
        }
      }
      const found = checkoutSessionSteps(type, session, {
        ...context,
        eventAt: readAt,
      });
      if (!found) return null;
      const steps: WebhookStep[] = [];
      if (found.link) steps.push({ type: 'link', ...found.link });
      if (found.state) steps.push({ type: 'state', notice: found.state });
      if (found.charge) steps.push({ type: 'charge', notice: found.charge });
      return steps.some((step) => step.type !== 'link') ? steps : null;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      // Una factura pagada de 0, como la de la prueba, no es un cobro y no llega a la base
      const notice = invoiceChargeNotice(
        object,
        type === 'invoice.paid' ? 'paid' : 'failed',
        context,
      );
      if (!notice) return null;
      return [{ type: 'charge', notice: await withUser(notice, object.customer, deps) }];
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const notice = subscriptionNotice(object, {
        ...context,
        ended: type === 'customer.subscription.deleted',
      });
      if (!notice) return null;
      return [{ type: 'state', notice: await withUser(notice, object.customer, deps) }];
    }
    case 'customer.subscription.trial_will_end': {
      const notice = trialEndingNotice(object, context);
      if (!notice) return null;
      return [{ type: 'trial_will_end', notice: await withUser(notice, object.customer, deps) }];
    }
    case 'charge.refunded': {
      const refund = refundedCharge(object, context);
      if (!refund) return null;
      // El alumno puede no estar ligado todavía. Entonces el aviso se asienta sin alumno, para que una
      // persona lo vea en payment_webhook_events, en lugar de perderse
      const userId = await deps.userOfCustomer(refund.customerId);
      const notice = await withInvoice(refund.notice, deps);
      return [{ type: 'charge', notice: { ...notice, userId } }];
    }
    case 'charge.dispute.created':
      // Abrir un contracargo no cambia el acceso. Solo queda en el registro, sin datos del alumno, para
      // que alguien responda la disputa en Stripe. Si se pierde, llega charge.dispute.closed
      deps.log(
        `Contracargo abierto ${asString(object.id) ?? '?'} por ${asString(object.reason) ?? '?'}. No cambia el acceso hasta que Stripe lo cierre`,
      );
      return null;
    case 'charge.dispute.closed': {
      const lost = lostDispute(object, context);
      if (!lost) return null;
      const key = deps.env.STRIPE_SECRET_KEY ?? '';
      if (key === '') {
        deps.log('Falta STRIPE_SECRET_KEY para leer el cobro del contracargo');
        throw new Error('sin llave');
      }
      const reply = await stripeCall(
        { key, fetch: deps.fetch },
        'GET',
        `/v1/payment_intents/${encodeURIComponent(lost.notice.paymentIntentId)}`,
      );
      if (!reply.ok) {
        deps.log(`No se pudo leer el cobro del contracargo. ${stripeFailureLine(reply)}`);
        throw new Error('lectura del cobro');
      }
      // Uno parcial no quita el plan, igual que un reembolso parcial
      const paid = mxnFromCents(reply.body.amount_received, reply.body.currency);
      if (paid !== null && lost.notice.amountMxn < paid) {
        deps.log(
          `Contracargo parcial perdido ${lost.disputeId} de ${String(lost.notice.amountMxn)} de ${String(paid)} pesos. No cambia el acceso. Revísalo en Stripe`,
        );
        return null;
      }
      const customerId = idOf(reply.body.customer);
      const userId = customerId === null ? null : await deps.userOfCustomer(customerId);
      const notice = await withInvoice(lost.notice, deps);
      return [{ type: 'charge', notice: { ...notice, userId } }];
    }
    default:
      return null;
  }
}

/**
 * Ejecuta hasta cinco acciones pendientes con Stripe que decidió la base, como cancelar una prueba
 * repetida o una suscripción reembolsada. Nunca lanza. Una acción que falla queda failed con su motivo
 * y se reintenta en el siguiente aviso
 */
async function runPendingActions(deps: StripeWebhookDeps): Promise<void> {
  const key = deps.env.STRIPE_SECRET_KEY ?? '';
  if (key === '') return;
  let actions: BillingAction[];
  try {
    actions = await deps.claimBillingActions({ limit: 5, provider: 'stripe' });
  } catch {
    deps.log('No se pudieron leer las acciones pendientes con Stripe');
    return;
  }
  const client: StripeClient = { key, fetch: deps.fetch };
  for (const action of actions) {
    const result = await runStripeAction(client, action);
    if (!result.ok) deps.log(`La acción ${action.reason} con Stripe falló. ${result.error ?? ''}`);
    try {
      await deps.finishBillingAction({ id: action.id, ok: result.ok, error: result.error });
    } catch {
      deps.log('No se pudo cerrar una acción con Stripe. Se reintentará');
    }
  }
}

/** Aviso de Stripe. Verifica la firma sobre el cuerpo tal cual llegó, antes de leerlo como JSON */
export async function handleStripeWebhook(
  request: Request,
  deps: StripeWebhookDeps,
): Promise<Response> {
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
  const results: string[] = [];
  try {
    const steps = await webhookSteps(asRecord(event), deps);
    for (const step of steps ?? []) {
      // Se liga antes de aplicar. Si algo falla se contesta 500 y Stripe reintenta, y las dos cosas
      // son seguras de repetir
      switch (step.type) {
        case 'link':
          await deps.linkCustomer({ userId: step.userId, customerId: step.customerId });
          break;
        case 'state':
          results.push(await deps.applySubscriptionState(step.notice));
          break;
        case 'charge':
          results.push(await deps.applyCharge(step.notice));
          break;
        case 'trial_will_end':
          results.push(await deps.noteTrialWillEnd(step.notice));
          break;
      }
    }
  } catch {
    return text('No se pudo aplicar', 500);
  }
  // El aviso ya se aplicó. Lo que pase con las acciones no cambia la respuesta a Stripe
  await runPendingActions(deps);
  return text(results.length > 0 ? results.join(', ') : 'Ignorado', 200);
}

// ---------------------------------------------------------------------------------------------
// Crear el pago

export interface CheckoutDeps extends CoreDeps {
  /** Quién es el usuario del token que llegó. null si no es válido */
  authenticate: (authorization: string | null) => Promise<AuthenticatedUser | null>;
  /** Lo que la base sabe del alumno (checkout_context). Lanza si la base falla */
  checkoutContext: (userId: string) => Promise<CheckoutContext>;
  /** Liga al alumno con el cliente de Stripe que se le acaba de crear. Lanza si la base falla */
  linkCustomer: (link: { userId: string; customerId: string }) => Promise<void>;
}

/** Revisa el cuerpo de create-checkout (regla 1 de 2.2). null si la combinación no vale */
export function parseCheckoutRequest(value: unknown): CheckoutRequest | null {
  const body = asRecord(value);
  const { plan, provider, method, expectTrial } = body;
  const mode = body.mode ?? 'subscription';
  if (!isPaidPlan(plan) || (provider !== 'stripe' && provider !== 'mercadopago')) return null;
  if (mode !== 'subscription' && mode !== 'pass') return null;
  if (expectTrial !== undefined && typeof expectTrial !== 'boolean') return null;
  if (mode === 'subscription') {
    // Mercado Pago no lleva precio Fundador (8.3). La suscripción no lleva método
    if (method !== undefined) return null;
    if (provider === 'mercadopago' && !isPassPlan(plan)) return null;
  } else {
    if (!isPassPlan(plan)) return null;
    if (provider === 'stripe' && method !== 'oxxo' && method !== 'spei') return null;
    if (provider === 'mercadopago' && method !== undefined) return null;
  }
  return {
    plan,
    provider,
    mode,
    ...(method === 'oxxo' || method === 'spei' ? { method } : {}),
    ...(typeof expectTrial === 'boolean' ? { expectTrial } : {}),
  };
}

/**
 * La bandera de feature_flags que cierra lo que se pidió, o null si está abierto. Los pases con OXXO o
 * SPEI piden cashPasses y todo Mercado Pago pide mercadoPago. La tarjeta con renovación no depende de
 * ninguna. Sin banderas cuentan como apagadas. La app ya esconde esas opciones con las mismas banderas, y
 * esto evita que se abran pidiéndolas directo
 */
export function closedFlagFor(
  ask: CheckoutRequest,
  flags: CheckoutFlags | undefined,
): keyof CheckoutFlags | null {
  if (ask.provider === 'mercadopago') return flags?.mercadoPago === true ? null : 'mercadoPago';
  if ((ask.mode ?? 'subscription') === 'pass') {
    return flags?.cashPasses === true ? null : 'cashPasses';
  }
  return null;
}

const ERROR_STATUS: Record<CheckoutError, number> = {
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

/**
 * El cliente de Stripe del alumno. Crea uno y lo liga en el acto, así toda sesión lleva cliente, que
 * SPEI exige. La clave de idempotencia evita un segundo cliente si la base falla al ligarlo y el alumno
 * lo intenta otra vez. Devuelve null y deja el motivo en el registro si no se pudo
 */
async function createCustomer(
  client: StripeClient,
  user: AuthenticatedUser,
  deps: CheckoutDeps,
  replacing: string | null,
): Promise<string | null> {
  const reply = await stripeCall(client, 'POST', '/v1/customers', customerParams(user), {
    idempotencyKey: `studiare-customer-${user.id}${replacing ? `-sin-${replacing}` : ''}`,
  });
  const customerId = asString(reply.body.id);
  if (!reply.ok || !customerId) {
    deps.log(`Stripe no creó el cliente del alumno. ${stripeFailureLine(reply)}`);
    return null;
  }
  try {
    await deps.linkCustomer({ userId: user.id, customerId });
  } catch {
    deps.log('No se pudo ligar el cliente nuevo de Stripe en la base');
    return null;
  }
  return customerId;
}

/** Crea la sesión de pago con la llave del servidor y devuelve la dirección donde se paga (2.2) */
export async function handleCreateCheckout(
  request: Request,
  deps: CheckoutDeps,
): Promise<Response> {
  const cors = corsHeaders(deps.env, request.headers.get('origin'));
  const fail = (error: CheckoutError, extra: Json = {}) =>
    json({ error, ...extra }, ERROR_STATUS[error], cors);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  const user = await deps.authenticate(request.headers.get('authorization'));
  if (!user) return fail('unauthorized');

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return fail('invalid');
  }
  const ask = parseCheckoutRequest(parsed);
  if (!ask) return fail('invalid');
  const mode: CheckoutMode = ask.mode ?? 'subscription';
  const appUrl = deps.env.APP_URL ?? '';
  if (appUrl === '') return fail('not_configured');

  // Qué plan tiene el alumno lo decide la base. Si no se puede saber no se abre el pago, porque un
  // doble cobro es peor que pedir que lo intente de nuevo (D-118)
  let context: CheckoutContext;
  try {
    context = await deps.checkoutContext(user.id);
  } catch {
    deps.log(`No se pudo leer checkout_context antes de abrir el pago del plan ${ask.plan}`);
    return fail('provider');
  }
  const closed = closedFlagFor(ask, context.flags);
  if (closed) {
    deps.log(
      `La bandera ${closed} está apagada en el servidor. No se abre el pago del plan ${ask.plan}`,
    );
    return fail('not_configured');
  }
  // Un solo plan pagado a la vez (D-118). Un pase suma a otro pase, pero no a una suscripción (8.10)
  if (context.inForce === 'subscription') return fail('already_subscribed');
  if (mode === 'subscription' && context.inForce === 'pass') {
    return fail('pass_in_force', { passEnd: context.passEnd });
  }
  if (isFounderPlan(ask.plan)) {
    if (context.founderLost) return fail('founder_lost');
    if (!context.founderOpen) return fail('founder_full');
  }
  // La prueba la decide el servidor. Si la app avisó otra cosa, se le pide revisar (4.18)
  const trial =
    mode === 'subscription' &&
    ask.provider === 'stripe' &&
    context.trialAvailable &&
    context.trialDays > 0;
  if (ask.expectTrial !== undefined && ask.expectTrial !== trial) {
    return fail('trial_mismatch', { trialAvailable: trial });
  }

  if (ask.provider === 'mercadopago') {
    if (!isPassPlan(ask.plan)) return fail('invalid');
    const created = await createMercadoPagoCheckout({
      user,
      plan: ask.plan,
      mode,
      context,
      env: deps.env,
      fetch: deps.fetch,
      log: deps.log,
    });
    return created.ok
      ? json({ url: created.url, mode, trial: false }, 200, cors)
      : fail(created.error);
  }

  const key = deps.env.STRIPE_SECRET_KEY ?? '';
  if (key === '') return fail('not_configured');
  const passPlan = isPassPlan(ask.plan) ? ask.plan : null;
  const secretName =
    mode === 'subscription'
      ? PLAN_PRICE_SECRETS[ask.plan]
      : passPlan
        ? PASS_PRICE_SECRETS[passPlan]
        : null;
  if (!secretName) return fail('invalid');
  const price = priceFromEnv(deps.env, secretName);
  if (!price.ok) {
    deps.log(price.line);
    return fail('not_configured');
  }
  const client: StripeClient = { key, fetch: deps.fetch };
  const paramsFor = (customerId: string) =>
    mode === 'subscription' || !passPlan
      ? subscriptionSessionParams({
          appUrl,
          userId: user.id,
          customerId,
          plan: ask.plan,
          priceId: price.price,
          trialDays: trial ? context.trialDays : null,
          automaticTax: deps.env.STRIPE_AUTOMATIC_TAX === 'true',
          nowMs: deps.now(),
        })
      : passSessionParams({
          appUrl,
          userId: user.id,
          customerId,
          plan: passPlan,
          priceId: price.price,
          method: ask.method ?? 'oxxo',
          oxxoExpiresDays: context.oxxoExpiresDays,
        });

  try {
    const known = context.customerId;
    let customerId = known ?? (await createCustomer(client, user, deps, null));
    if (!customerId) return fail('provider');
    let reply = await stripeCall(client, 'POST', '/v1/checkout/sessions', paramsFor(customerId));
    // El cliente guardado puede ya no existir, por ejemplo si se borró en Stripe o si se cambió de
    // llaves de prueba a las reales. Entonces se crea otro, se liga y se reintenta una vez
    if (!reply.ok && known && isMissingCustomer(reply)) {
      customerId = await createCustomer(client, user, deps, known);
      if (!customerId) return fail('provider');
      reply = await stripeCall(client, 'POST', '/v1/checkout/sessions', paramsFor(customerId));
    }
    if (!reply.ok) {
      deps.log(`Stripe rechazó el pago del plan ${ask.plan}. ${stripeFailureLine(reply)}`);
      return fail('provider');
    }
    const url = asString(reply.body.url);
    if (url) return json({ url, mode, trial }, 200, cors);
    deps.log(`Stripe creó el pago del plan ${ask.plan} pero no mandó la dirección`);
    return fail('provider');
  } catch (error) {
    // Sin red hacia la pasarela, o una respuesta que no se pudo leer. Solo el tipo de error, que no
    // lleva llaves ni datos del alumno
    const kind = error instanceof Error ? error.name : typeof error;
    deps.log(`No se pudo crear el pago del plan ${ask.plan} con stripe. ${kind}`);
    return fail('provider');
  }
}

// ---------------------------------------------------------------------------------------------
// Portal de facturación

export interface PortalDeps extends CoreDeps {
  authenticate: CheckoutDeps['authenticate'];
  /** Lo que la base sabe del alumno (checkout_context). Lanza si la base falla */
  checkoutContext: (userId: string) => Promise<CheckoutContext>;
}

/**
 * Abre el portal de Stripe donde el alumno cambia de plan, cancela, cambia su tarjeta o ve sus facturas
 * (2.3). El cliente sale de la cuenta con sesión y nunca de lo que mande el navegador, así que nadie
 * puede abrir el portal de otra persona. La configuración es la de Fundadores con un plan Fundador y la
 * regular en lo demás. Lo que haga ahí llega después como un aviso normal
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

  let flow: 'update' | 'cancel' | null = null;
  const raw = await request.text();
  if (raw.trim() !== '') {
    let body: Json;
    try {
      body = asRecord(JSON.parse(raw));
    } catch {
      return json({ error: 'invalid' }, 400, cors);
    }
    if (body.flow !== undefined && body.flow !== 'update' && body.flow !== 'cancel') {
      return json({ error: 'invalid' }, 400, cors);
    }
    flow = body.flow ?? null;
  }

  let context: CheckoutContext;
  try {
    context = await deps.checkoutContext(user.id);
  } catch {
    deps.log('No se pudo leer checkout_context antes de abrir el portal');
    return json({ error: 'provider' }, 502, cors);
  }
  const subscription = context.subscription;
  const live = context.inForce === 'subscription' && subscription !== null;
  // Mercado Pago no tiene portal. La app usa cancel-subscription
  if (live && subscription.provider === 'mercadopago') {
    return json({ error: 'mercadopago' }, 409, cors);
  }
  const customer = context.customerId;
  if (customer === null) return json({ error: 'no_customer' }, 404, cors);

  // Sin su configuración el portal no se abre. La de Stripe por omisión deja elegir cualquier precio del
  // catálogo, también el Fundador sin pasar por el cupo
  const configName = isFounderPlan(subscription?.plan)
    ? 'STRIPE_PORTAL_CONFIG_FOUNDER'
    : 'STRIPE_PORTAL_CONFIG_REGULAR';
  const configuration = (deps.env[configName] ?? '').trim();
  if (configuration === '') {
    deps.log(
      `Falta ${configName}. El portal no se abre sin su configuración, porque la de Stripe por omisión deja elegir cualquier precio`,
    );
    return json({ error: 'not_configured' }, 503, cors);
  }
  const stripeSubscription =
    live && subscription.provider === 'stripe' ? subscription.subscriptionId : null;
  if (flow && !stripeSubscription) {
    deps.log(
      `No hay suscripción de Stripe vigente para abrir el portal en ${flow}. Se abre normal`,
    );
  }
  try {
    const reply = await stripeCall(
      { key, fetch: deps.fetch },
      'POST',
      '/v1/billing_portal/sessions',
      portalSessionParams({
        customerId: customer,
        appUrl,
        configuration,
        flow: stripeSubscription ? flow : null,
        subscriptionId: stripeSubscription,
      }),
    );
    if (!reply.ok) {
      deps.log(`Stripe rechazó el portal. ${stripeFailureLine(reply)}`);
      return json({ error: 'provider' }, 502, cors);
    }
    const url = asString(reply.body.url);
    return url ? json({ url }, 200, cors) : json({ error: 'provider' }, 502, cors);
  } catch {
    deps.log('Sin red hacia Stripe al abrir el portal');
    return json({ error: 'provider' }, 502, cors);
  }
}
