import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PLANS } from '../../../src/config/billing.ts';
import {
  PASS_PRICES_MXN,
  PLAN_PRICES_MXN,
  STRIPE_API_VERSION,
  type BillingAction,
  type ChargeNotice,
  type CheckoutContext,
  type FunctionEnv,
  type Provider,
  type SubscriptionNotice,
  type TrialEndingNotice,
} from './billingTypes.ts';
import { corsHeaders, safeEqual } from './http.ts';
import {
  STRIPE_TOLERANCE_SECONDS,
  handleCreateCheckout,
  handleCreatePortal,
  handleStripeWebhook,
  parseCheckoutRequest,
  verifyStripeSignature,
  type CheckoutDeps,
  type PortalDeps,
  type StripeWebhookDeps,
} from './payments.ts';

const USER = '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f';
const NOW = Date.parse('2026-10-14T16:00:00.000Z');
const STRIPE_SECRET = 'secreto-de-prueba-stripe';
const KEY = 'llave-de-prueba-stripe';
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_1';
const PORTAL_URL = 'https://billing.stripe.com/p/session/test_1';
const MP_URL = 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1';
const APP_ORIGIN = 'https://app.ejemplo.mx';

const seconds = (iso: string) => Date.parse(iso) / 1000;
const CREATED = seconds('2026-10-14T15:00:00.000Z');
const PERIOD_END = seconds('2026-11-14T16:00:00.000Z');
const TRIAL_END = seconds('2026-10-21T16:00:00.000Z');

const env: FunctionEnv = {
  STRIPE_SECRET_KEY: KEY,
  STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
  STRIPE_PRICE_FOUNDER: 'price_fundador',
  STRIPE_PRICE_FOUNDER_ANNUAL: 'price_fundador_anual',
  STRIPE_PRICE_MONTHLY: 'price_mensual',
  STRIPE_PRICE_ANNUAL: 'price_anual',
  STRIPE_PRICE_PASS_MONTHLY: 'price_pase_mes',
  STRIPE_PRICE_PASS_ANNUAL: 'price_pase_anio',
  STRIPE_PORTAL_CONFIG_FOUNDER: 'bpc_fundador',
  STRIPE_PORTAL_CONFIG_REGULAR: 'bpc_regular',
  MERCADOPAGO_ACCESS_TOKEN: 'token-de-prueba-mp',
  MERCADOPAGO_WEBHOOK_SECRET: 'secreto-de-prueba-mp',
  APP_URL: `${APP_ORIGIN}/Studiare-ENARM/`,
  FUNCTIONS_URL: 'https://proyecto.supabase.co/functions/v1/',
};

const { STRIPE_SECRET_KEY: _withoutKey, ...envWithoutKey } = env;

const hmac = (secret: string, message: string) =>
  createHmac('sha256', secret).update(message).digest('hex');

function stripeHeader(body: string, options: { secret?: string; t?: number } = {}) {
  const t = options.t ?? Math.floor(NOW / 1000);
  return `t=${t},v1=${hmac(options.secret ?? STRIPE_SECRET, `${t}.${body}`)}`;
}

// ---------------------------------------------------------------------------------------------
// Un fetch falso por rutas, que deja constancia de cada llamada. Nunca sale a la red

type Route = (url: URL, init: RequestInit | undefined) => Promise<Response>;

interface Call {
  url: URL;
  method: string;
  init: RequestInit | undefined;
}

const reply =
  (body: unknown, status = 200): Route =>
  () =>
    Promise.resolve(Response.json(body, { status }));

const stripeError = (status: number, error: Record<string, string>): Route =>
  reply({ error: { type: 'invalid_request_error', ...error } }, status);

const offline: Route = () => Promise.reject(new TypeError('fetch failed'));

/**
 * Las rutas van como "MÉTODO /ruta". Una que termina en * vale para todo lo que empiece igual. Lo que no
 * tiene ruta contesta 404 como Stripe
 */
function fakeFetch(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    calls.push({ url, method, init });
    const key = `${method} ${url.pathname}`;
    const route =
      routes[key] ??
      Object.entries(routes).find(
        ([pattern]) => pattern.endsWith('*') && key.startsWith(pattern.slice(0, -1)),
      )?.[1];
    return route
      ? route(url, init)
      : stripeError(404, { code: 'resource_missing', message: `sin ruta ${key}` })(url, init);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/** Los parámetros de una llamada POST a Stripe */
const form = (call: Call | undefined): Record<string, string> =>
  call?.init?.body instanceof URLSearchParams ? Object.fromEntries(call.init.body) : {};

const stripeCalls = (calls: Call[]) =>
  calls.filter((call) => call.url.origin === 'https://api.stripe.com');

// ---------------------------------------------------------------------------------------------
// Objetos de Stripe como llegan en la versión 2026-09-30.endive

function subscriptionObject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    object: 'subscription',
    status: 'active',
    customer: 'cus_1',
    metadata: { user_id: USER, plan: 'monthly', trial: 'false' },
    items: { data: [{ price: { id: 'price_mensual' }, current_period_end: PERIOD_END }] },
    trial_end: null,
    cancel_at_period_end: false,
    cancel_at: null,
    schedule: null,
    discounts: [],
    ...overrides,
  };
}

function subscriptionSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_1',
    object: 'checkout.session',
    mode: 'subscription',
    customer: 'cus_1',
    client_reference_id: USER,
    metadata: { user_id: USER, plan: 'monthly', mode: 'subscription', trial: 'true' },
    payment_status: 'no_payment_required',
    amount_total: 0,
    currency: 'mxn',
    subscription: 'sub_1',
    invoice: null,
    total_details: { amount_discount: 0 },
    discounts: [],
    ...overrides,
  };
}

function passSession(method: 'oxxo' | 'spei', overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_pase',
    object: 'checkout.session',
    mode: 'payment',
    customer: 'cus_1',
    client_reference_id: USER,
    metadata: {
      user_id: USER,
      plan: 'monthly',
      mode: 'pass',
      method,
      ...(method === 'oxxo' ? { oxxo_days: '3' } : {}),
    },
    payment_status: 'unpaid',
    amount_total: 14_900,
    currency: 'mxn',
    payment_intent: 'pi_1',
    created: CREATED,
    total_details: { amount_discount: 0 },
    discounts: [],
    ...overrides,
  };
}

function invoiceObject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'in_1',
    object: 'invoice',
    customer: 'cus_1',
    amount_paid: 14_900,
    currency: 'mxn',
    billing_reason: 'subscription_cycle',
    parent: {
      type: 'subscription_details',
      subscription_details: { subscription: 'sub_1', metadata: { user_id: USER, plan: 'monthly' } },
    },
    lines: {
      data: [
        {
          pricing: { price_details: { price: 'price_mensual' } },
          period: { start: CREATED, end: PERIOD_END },
        },
      ],
    },
    total_discount_amounts: [],
    ...overrides,
  };
}

function refundObject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch_1',
    object: 'charge',
    refunded: true,
    amount: 14_900,
    amount_refunded: 14_900,
    currency: 'mxn',
    customer: 'cus_1',
    payment_intent: 'pi_1',
    created: CREATED,
    ...overrides,
  };
}

const event = (type: string, object: Record<string, unknown>, id = 'evt_1') => ({
  id,
  object: 'event',
  type,
  api_version: STRIPE_API_VERSION,
  created: CREATED,
  data: { object },
});

/** La lectura de la sesión con su suscripción expandida, como la pide el aviso */
const sessionRead = (session: Record<string, unknown>, subscription: Record<string, unknown>) => ({
  [`GET /v1/checkout/sessions/${String(session.id)}`]: reply({ ...session, subscription }),
});

// ---------------------------------------------------------------------------------------------
// Dependencias del aviso

interface WebhookOptions {
  overrides?: Partial<StripeWebhookDeps>;
  routes?: Record<string, Route>;
  actions?: BillingAction[];
  env?: FunctionEnv;
}

function webhookDeps(options: WebhookOptions = {}) {
  const { calls, fetchImpl } = fakeFetch(options.routes ?? {});
  const pending = [...(options.actions ?? [])];
  const record = {
    calls,
    states: [] as SubscriptionNotice[],
    charges: [] as ChargeNotice[],
    trials: [] as TrialEndingNotice[],
    linked: [] as { userId: string; customerId: string }[],
    customers: [] as string[],
    claims: [] as { limit: number; provider: Provider | null }[],
    finished: [] as { id: string; ok: boolean; error: string | null }[],
    order: [] as string[],
    lines: [] as string[],
  };
  const deps: StripeWebhookDeps = {
    env: options.env ?? env,
    fetch: fetchImpl,
    now: () => NOW,
    log: (line) => {
      record.lines.push(line);
    },
    applyCharge: (notice) => {
      record.charges.push(notice);
      record.order.push(`charge:${notice.kind}`);
      return Promise.resolve('applied');
    },
    applySubscriptionState: (notice) => {
      record.states.push(notice);
      record.order.push(`state:${notice.status}`);
      return Promise.resolve('applied');
    },
    noteTrialWillEnd: (notice) => {
      record.trials.push(notice);
      record.order.push('trial_will_end');
      return Promise.resolve('queued');
    },
    linkCustomer: (link) => {
      record.linked.push(link);
      record.order.push(`link:${link.customerId}`);
      return Promise.resolve();
    },
    userOfCustomer: (customerId) => {
      record.customers.push(customerId);
      return Promise.resolve(customerId === 'cus_1' ? USER : null);
    },
    claimBillingActions: (claim) => {
      record.claims.push(claim);
      return Promise.resolve(pending.splice(0, claim.limit));
    },
    finishBillingAction: (result) => {
      record.finished.push(result);
      return Promise.resolve();
    },
    ...options.overrides,
  };
  return { deps, record };
}

function send(
  body: unknown,
  deps: StripeWebhookDeps,
  options: { header?: string | null; method?: string; raw?: string } = {},
) {
  const raw = options.raw ?? JSON.stringify(body);
  const header = options.header === undefined ? stripeHeader(raw) : options.header;
  const method = options.method ?? 'POST';
  const headers = new Headers();
  if (header !== null) headers.set('stripe-signature', header);
  return handleStripeWebhook(
    new Request('https://f.supabase.co/functions/v1/payment-webhook-stripe', {
      method,
      headers,
      ...(method === 'GET' ? {} : { body: raw }),
    }),
    deps,
  );
}

const action = (overrides: Partial<BillingAction> = {}): BillingAction => ({
  id: 'act_1',
  provider: 'stripe',
  kind: 'cancel_subscription',
  target: 'sub_repetida',
  reason: 'trial_duplicate',
  attempts: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------------------------

describe('comparación sin atajos', () => {
  it('compara textos', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('firma de Stripe', () => {
  const body = '{"id":"evt_1"}';
  const check = (
    header: string | null,
    overrides: Partial<Parameters<typeof verifyStripeSignature>[0]> = {},
  ) =>
    verifyStripeSignature({
      rawBody: body,
      header,
      secret: STRIPE_SECRET,
      nowMs: NOW,
      ...overrides,
    });

  it('acepta una firma buena', async () => {
    expect(await check(stripeHeader(body))).toBe(true);
  });

  it('rechaza otro secreto, un cuerpo cambiado o un encabezado roto', async () => {
    expect(await check(stripeHeader(body, { secret: 'otro' }))).toBe(false);
    expect(await check(stripeHeader('{"id":"evt_2"}'))).toBe(false);
    expect(await check(null)).toBe(false);
    expect(await check('')).toBe(false);
    expect(await check('t=abc,v1=00')).toBe(false);
    expect(await check(`t=${Math.floor(NOW / 1000)}`)).toBe(false);
    expect(await check(stripeHeader(body), { secret: '' })).toBe(false);
  });

  it('rechaza una marca de tiempo fuera de la tolerancia, vieja o del futuro', async () => {
    const t = Math.floor(NOW / 1000);
    expect(await check(stripeHeader(body, { t: t - STRIPE_TOLERANCE_SECONDS - 1 }))).toBe(false);
    expect(await check(stripeHeader(body, { t: t + STRIPE_TOLERANCE_SECONDS + 1 }))).toBe(false);
    expect(await check(stripeHeader(body, { t: t - STRIPE_TOLERANCE_SECONDS }))).toBe(true);
  });

  it('acepta si alguna de varias firmas v1 coincide, como al cambiar de secreto', async () => {
    const t = Math.floor(NOW / 1000);
    const good = hmac(STRIPE_SECRET, `${t}.${body}`);
    expect(await check(`t=${t},v1=${'0'.repeat(64)},v1=${good}`)).toBe(true);
  });
});

describe('aviso de Stripe', () => {
  const paid = event('invoice.paid', invoiceObject());

  it('con firma buena aplica el aviso y contesta lo que dijo la base', async () => {
    const { deps, record } = webhookDeps();
    const answer = await send(paid, deps);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe('applied');
    expect(record.charges).toHaveLength(1);
  });

  it('un aviso repetido se contesta 200 con lo que diga la base', async () => {
    const { deps } = webhookDeps({
      overrides: { applyCharge: () => Promise.resolve('duplicate') },
    });
    const answer = await send(paid, deps);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe('duplicate');
  });

  it('sin firma, con otra firma o con el cuerpo cambiado contesta 401 y no toca la base', async () => {
    const { deps, record } = webhookDeps();
    const raw = JSON.stringify(paid);
    expect((await send(paid, deps, { header: null })).status).toBe(401);
    expect((await send(paid, deps, { header: stripeHeader(raw, { secret: 'otro' }) })).status).toBe(
      401,
    );
    expect(
      (await send(paid, deps, { header: stripeHeader(raw), raw: raw.replace('14900', '1') }))
        .status,
    ).toBe(401);
    expect(record.charges).toEqual([]);
    expect(record.claims).toEqual([]);
  });

  it('un cuerpo que no es JSON, aunque venga firmado, contesta 400', async () => {
    const { deps } = webhookDeps();
    expect((await send(null, deps, { raw: 'no es json' })).status).toBe(400);
  });

  it('un evento que no se usa, o sin id o sin tipo, contesta 200 sin aplicar nada', async () => {
    const { deps, record } = webhookDeps();
    const unknown = await send(event('customer.created', { id: 'cus_1' }), deps);
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toBe('Ignorado');
    expect(await (await send({ type: 'invoice.paid', data: {} }, deps)).text()).toBe('Ignorado');
    expect(await (await send({ id: 'evt_9', data: {} }, deps)).text()).toBe('Ignorado');
    expect(record.charges).toEqual([]);
    expect(record.states).toEqual([]);
  });

  it('si la base falla contesta 500 para que Stripe lo reintente', async () => {
    const { deps } = webhookDeps({
      overrides: { applyCharge: () => Promise.reject(new Error('sin base')) },
    });
    expect((await send(paid, deps)).status).toBe(500);
  });

  it('sin secreto configurado contesta 503 y con otro método 405', async () => {
    const { deps } = webhookDeps({ env: { ...env, STRIPE_WEBHOOK_SECRET: '' } });
    expect((await send(paid, deps)).status).toBe(503);
    expect((await send(paid, webhookDeps().deps, { method: 'GET' })).status).toBe(405);
  });
});

describe('aviso de Stripe por evento', () => {
  it('la sesión de una prueba se lee de Stripe, liga al cliente y aplica la suscripción en prueba', async () => {
    const session = subscriptionSession();
    const { deps, record } = webhookDeps({
      routes: sessionRead(
        session,
        subscriptionObject({ status: 'trialing', trial_end: TRIAL_END }),
      ),
    });
    const answer = await send(event('checkout.session.completed', session), deps);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe('applied');

    // La lectura pide la suscripción y los códigos, con la llave y la versión fija
    const read = stripeCalls(record.calls)[0];
    expect(read?.method).toBe('GET');
    expect(read?.url.pathname).toBe('/v1/checkout/sessions/cs_1');
    expect(read?.url.searchParams.getAll('expand[]')).toEqual([
      'subscription',
      'discounts.promotion_code',
    ]);
    const headers = new Headers(read?.init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(headers.get('stripe-version')).toBe(STRIPE_API_VERSION);

    // Primero se liga el cliente y luego el estado. La prueba no es un cobro
    expect(record.order).toEqual(['link:cus_1', 'state:trialing']);
    expect(record.linked).toEqual([{ userId: USER, customerId: 'cus_1' }]);
    expect(record.charges).toEqual([]);
    expect(record.states[0]).toMatchObject({
      provider: 'stripe',
      eventId: 'evt_1',
      // La suscripción leída es más nueva que el evento, así que cuenta la hora de la lectura
      eventAt: new Date(NOW).toISOString(),
      userId: USER,
      subscriptionId: 'sub_1',
      plan: 'monthly',
      status: 'trialing',
      periodEnd: '2026-11-14T16:00:00.000Z',
      trialEnd: '2026-10-21T16:00:00.000Z',
      cancelAtPeriodEnd: false,
      scheduledChange: false,
      priceId: 'price_mensual',
    });
  });

  it('una sesión pagada sin prueba aplica el estado y el cobro con la factura', async () => {
    const session = subscriptionSession({
      payment_status: 'paid',
      amount_total: 14_900,
      invoice: 'in_1',
      metadata: { user_id: USER, plan: 'monthly', mode: 'subscription', trial: 'false' },
    });
    const { deps, record } = webhookDeps({
      routes: sessionRead(session, subscriptionObject()),
    });
    const answer = await send(event('checkout.session.completed', session), deps);
    expect(await answer.text()).toBe('applied, applied');
    expect(record.order).toEqual(['link:cus_1', 'state:active', 'charge:paid']);
    expect(record.charges[0]).toMatchObject({
      eventId: 'evt_1:charge',
      kind: 'paid',
      purpose: 'subscription',
      userId: USER,
      plan: 'monthly',
      method: 'card',
      providerPaymentId: 'in_1',
      providerSubscriptionId: 'sub_1',
      amountMxn: 149,
      periodEnd: '2026-11-14T16:00:00.000Z',
    });
  });

  it('si la lectura de la sesión falla contesta 500 sin aplicar nada', async () => {
    const session = subscriptionSession();
    for (const route of [stripeError(500, { message: 'api caída' }), offline]) {
      const { deps, record } = webhookDeps({
        routes: { 'GET /v1/checkout/sessions/cs_1': route },
      });
      expect((await send(event('checkout.session.completed', session), deps)).status).toBe(500);
      expect(record.order).toEqual([]);
      expect(record.claims).toEqual([]);
    }
    const { deps, record } = webhookDeps({
      routes: { 'GET /v1/checkout/sessions/cs_1': stripeError(500, { message: 'api caída' }) },
    });
    await send(event('checkout.session.completed', session), deps);
    expect(record.lines[0]).toMatch(/^No se pudo leer la sesión de pago\. estado 500/);
    expect(record.lines.join(' ')).not.toContain(KEY);
  });

  it('sin la llave de Stripe aplica lo que trae el aviso y lo deja en el registro', async () => {
    const session = subscriptionSession({
      payment_status: 'paid',
      amount_total: 14_900,
      invoice: 'in_1',
    });
    const { deps, record } = webhookDeps({ env: envWithoutKey });
    const answer = await send(event('checkout.session.completed', session), deps);
    expect(await answer.text()).toBe('applied');
    expect(record.lines).toEqual([
      'Falta STRIPE_SECRET_KEY para leer la sesión de pago. Se aplica con los datos del aviso',
    ]);
    expect(record.calls).toEqual([]);
    expect(record.charges[0]).toMatchObject({ plan: 'monthly', providerPaymentId: 'in_1' });
  });

  it('una ficha OXXO queda pendiente con su vencimiento y sin leer de Stripe', async () => {
    const { deps, record } = webhookDeps();
    const answer = await send(event('checkout.session.completed', passSession('oxxo')), deps);
    expect(await answer.text()).toBe('applied');
    expect(stripeCalls(record.calls)).toEqual([]);
    expect(record.order).toEqual(['link:cus_1', 'charge:pending']);
    expect(record.charges[0]).toMatchObject({
      kind: 'pending',
      purpose: 'pass',
      plan: 'monthly',
      method: 'oxxo',
      providerPaymentId: 'pi_1',
      paymentIntentId: 'pi_1',
      amountMxn: 149,
      // Creada a las 9 de Ciudad de México del 14, vence el 17 a las 23:59:59 de allá
      expiresAt: '2026-10-18T05:59:59.000Z',
    });
  });

  it('el pago y el vencimiento de la ficha llegan como pagado y vencido', async () => {
    const { deps, record } = webhookDeps();
    await send(
      event('checkout.session.async_payment_succeeded', passSession('oxxo'), 'evt_pagada'),
      deps,
    );
    await send(
      event('checkout.session.async_payment_failed', passSession('spei'), 'evt_vencida'),
      deps,
    );
    expect(record.charges.map((charge) => [charge.eventId, charge.kind, charge.method])).toEqual([
      ['evt_pagada', 'paid', 'oxxo'],
      ['evt_vencida', 'expired', 'spei'],
    ]);
  });

  it('un pase con descuento se lee de Stripe para saber el código', async () => {
    const session = passSession('spei', { total_details: { amount_discount: 1_490 } });
    const { deps, record } = webhookDeps({
      routes: {
        'GET /v1/checkout/sessions/cs_pase': reply({
          ...session,
          discounts: [{ promotion_code: { id: 'promo_1', code: 'prueba10' } }],
        }),
      },
    });
    await send(event('checkout.session.completed', session), deps);
    expect(stripeCalls(record.calls)).toHaveLength(1);
    expect(record.charges[0]).toMatchObject({
      kind: 'pending',
      method: 'spei',
      expiresAt: null,
      discountMxn: 14.9,
      promotionCode: 'PRUEBA10',
    });
  });

  it('una factura pagada es un cobro y la de 0 pesos de la prueba ni llega a la base', async () => {
    const { deps, record } = webhookDeps();
    expect(await (await send(event('invoice.paid', invoiceObject()), deps)).text()).toBe('applied');
    expect(record.charges[0]).toMatchObject({
      kind: 'paid',
      purpose: 'subscription',
      userId: USER,
      plan: 'monthly',
      method: 'card',
      providerPaymentId: 'in_1',
      providerSubscriptionId: 'sub_1',
      amountMxn: 149,
      periodEnd: '2026-11-14T16:00:00.000Z',
    });
    const trial = await send(
      event('invoice.paid', invoiceObject({ id: 'in_0', amount_paid: 0 }), 'evt_0'),
      deps,
    );
    expect(await trial.text()).toBe('Ignorado');
    expect(record.charges).toHaveLength(1);
  });

  it('una factura sin metadata propia busca al alumno por su cliente', async () => {
    const { deps, record } = webhookDeps();
    await send(
      event(
        'invoice.paid',
        invoiceObject({ parent: { subscription_details: { subscription: 'sub_1' } } }),
      ),
      deps,
    );
    expect(record.customers).toEqual(['cus_1']);
    expect(record.charges[0]?.userId).toBe(USER);
  });

  it('un cobro fallido llega sin monto', async () => {
    const { deps, record } = webhookDeps();
    await send(event('invoice.payment_failed', invoiceObject({ amount_paid: 0 })), deps);
    expect(record.charges[0]).toMatchObject({ kind: 'failed', amountMxn: null, userId: USER });
  });

  it('crear, cambiar y borrar una suscripción aplican su estado con la hora del evento', async () => {
    const { deps, record } = webhookDeps();
    await send(
      event(
        'customer.subscription.created',
        subscriptionObject({ status: 'trialing', trial_end: TRIAL_END }),
        'evt_a',
      ),
      deps,
    );
    await send(
      event(
        'customer.subscription.updated',
        subscriptionObject({ cancel_at_period_end: true, schedule: 'sub_sched_1' }),
        'evt_b',
      ),
      deps,
    );
    await send(
      event('customer.subscription.updated', subscriptionObject({ status: 'unpaid' }), 'evt_c'),
      deps,
    );
    await send(
      event(
        'customer.subscription.deleted',
        subscriptionObject({ status: 'canceled', ended_at: CREATED }),
        'evt_d',
      ),
      deps,
    );
    expect(
      record.states.map((state) => [
        state.eventId,
        state.status,
        state.cancelAtPeriodEnd,
        state.scheduledChange,
      ]),
    ).toEqual([
      ['evt_a', 'trialing', false, false],
      ['evt_b', 'active', true, true],
      ['evt_c', 'past_due', false, false],
      ['evt_d', 'ended', false, false],
    ]);
    expect(record.states.every((state) => state.eventAt === '2026-10-14T15:00:00.000Z')).toBe(true);
    // La borrada termina en la hora en que terminó
    expect(record.states[3]?.periodEnd).toBe('2026-10-14T15:00:00.000Z');
  });

  it('una suscripción incompleta se ignora y un Price ID desconocido llega sin plan', async () => {
    const { deps, record } = webhookDeps();
    const incomplete = await send(
      event('customer.subscription.created', subscriptionObject({ status: 'incomplete' })),
      deps,
    );
    expect(await incomplete.text()).toBe('Ignorado');
    await send(
      event(
        'customer.subscription.updated',
        subscriptionObject({
          items: { data: [{ price: { id: 'price_otro' }, current_period_end: PERIOD_END }] },
        }),
      ),
      deps,
    );
    expect(record.states).toHaveLength(1);
    expect(record.states[0]?.plan).toBeNull();
    expect(record.lines).toEqual([
      'Price ID desconocido price_otro en la suscripción sub_1. Revisa los secretos STRIPE_PRICE_. No cambia el plan',
    ]);
  });

  it('el fin próximo de la prueba se avisa a la base y contesta lo que dijo', async () => {
    const { deps, record } = webhookDeps();
    const answer = await send(
      event(
        'customer.subscription.trial_will_end',
        subscriptionObject({ status: 'trialing', trial_end: TRIAL_END }),
      ),
      deps,
    );
    expect(await answer.text()).toBe('queued');
    expect(record.trials).toEqual([
      expect.objectContaining({
        provider: 'stripe',
        eventId: 'evt_1',
        userId: USER,
        subscriptionId: 'sub_1',
        trialEnd: '2026-10-21T16:00:00.000Z',
      }),
    ]);
  });

  it('un reembolso completo va al alumno de su cliente con su PaymentIntent y sin id de pago', async () => {
    const { deps, record } = webhookDeps();
    expect(await (await send(event('charge.refunded', refundObject()), deps)).text()).toBe(
      'applied',
    );
    expect(record.customers).toEqual(['cus_1']);
    expect(record.charges[0]).toMatchObject({
      kind: 'refunded',
      userId: USER,
      providerPaymentId: null,
      paymentIntentId: 'pi_1',
      amountMxn: 149,
    });
  });

  it('un reembolso de un cliente que no conocemos se asienta sin alumno, para que alguien lo vea', async () => {
    const { deps, record } = webhookDeps();
    await send(event('charge.refunded', refundObject({ customer: 'cus_ajeno' })), deps);
    expect(record.charges[0]).toMatchObject({ kind: 'refunded', userId: null });
  });

  it('un reembolso parcial se ignora con 200 y no toca la base', async () => {
    const { deps, record } = webhookDeps();
    const answer = await send(
      event('charge.refunded', refundObject({ refunded: false, amount_refunded: 5_000 })),
      deps,
    );
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe('Ignorado');
    expect(record.customers).toEqual([]);
    expect(record.charges).toEqual([]);
  });

  it('si la base falla al buscar al alumno o al ligar al cliente contesta 500 y no aplica', async () => {
    const lost = webhookDeps({
      overrides: { userOfCustomer: () => Promise.reject(new Error('sin base')) },
    });
    expect((await send(event('charge.refunded', refundObject()), lost.deps)).status).toBe(500);
    expect(lost.record.charges).toEqual([]);

    const session = subscriptionSession();
    const unlinked = webhookDeps({
      routes: sessionRead(session, subscriptionObject({ status: 'trialing' })),
      overrides: { linkCustomer: () => Promise.reject(new Error('sin base')) },
    });
    expect((await send(event('checkout.session.completed', session), unlinked.deps)).status).toBe(
      500,
    );
    expect(unlinked.record.states).toEqual([]);
  });
});

describe('acciones pendientes con Stripe', () => {
  it('después de aplicar el aviso cancela lo que pidió la base, sin prorrateo ni factura', async () => {
    const { deps, record } = webhookDeps({
      actions: [action()],
      routes: {
        'DELETE /v1/subscriptions/sub_repetida': reply({ id: 'sub_repetida', status: 'canceled' }),
      },
    });
    const answer = await send(event('invoice.paid', invoiceObject()), deps);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe('applied');
    expect(record.claims).toEqual([{ limit: 5, provider: 'stripe' }]);
    const cancel = stripeCalls(record.calls)[0];
    expect(cancel?.method).toBe('DELETE');
    expect(Object.fromEntries(cancel?.url.searchParams ?? [])).toEqual({
      prorate: 'false',
      invoice_now: 'false',
    });
    expect(new Headers(cancel?.init?.headers).get('stripe-version')).toBe(STRIPE_API_VERSION);
    expect(record.finished).toEqual([{ id: 'act_1', ok: true, error: null }]);
  });

  it('una acción que falla queda con su motivo y el aviso igual contesta 200', async () => {
    const { deps, record } = webhookDeps({
      actions: [action({ reason: 'founder_full' })],
      routes: {
        'DELETE /v1/subscriptions/sub_repetida': stripeError(400, {
          code: 'resource_missing',
          message: 'No such subscription',
        }),
        'GET /v1/subscriptions/sub_repetida': reply({ id: 'sub_repetida', status: 'active' }),
      },
    });
    const answer = await send(event('invoice.paid', invoiceObject()), deps);
    expect(answer.status).toBe(200);
    expect(record.finished).toEqual([
      {
        id: 'act_1',
        ok: false,
        error: expect.stringMatching(/^Stripe no canceló la suscripción\. estado 400/) as unknown,
      },
    ]);
    expect(record.lines[0]).toMatch(/^La acción founder_full con Stripe falló\. Stripe no canceló/);
    expect(record.lines.join(' ')).not.toContain(KEY);
  });

  it('también corren con un aviso que se ignora', async () => {
    const { deps, record } = webhookDeps({
      actions: [action()],
      routes: { 'DELETE /v1/subscriptions/*': reply({ status: 'canceled' }) },
    });
    expect(await (await send(event('customer.created', { id: 'cus_1' }), deps)).text()).toBe(
      'Ignorado',
    );
    expect(record.finished).toEqual([{ id: 'act_1', ok: true, error: null }]);
  });

  it('no corren sin la llave de Stripe ni si el aviso falló', async () => {
    const withoutKey = webhookDeps({ env: envWithoutKey, actions: [action()] });
    await send(event('invoice.paid', invoiceObject()), withoutKey.deps);
    expect(withoutKey.record.claims).toEqual([]);

    const failed = webhookDeps({
      actions: [action()],
      overrides: { applyCharge: () => Promise.reject(new Error('sin base')) },
    });
    expect((await send(event('invoice.paid', invoiceObject()), failed.deps)).status).toBe(500);
    expect(failed.record.claims).toEqual([]);
  });

  it('si la base falla al leerlas o al cerrarlas el aviso contesta 200 y queda en el registro', async () => {
    const unread = webhookDeps({
      overrides: { claimBillingActions: () => Promise.reject(new Error('sin base')) },
    });
    expect((await send(event('invoice.paid', invoiceObject()), unread.deps)).status).toBe(200);
    expect(unread.record.lines).toEqual(['No se pudieron leer las acciones pendientes con Stripe']);

    const unclosed = webhookDeps({
      actions: [action()],
      routes: { 'DELETE /v1/subscriptions/*': reply({ status: 'canceled' }) },
      overrides: { finishBillingAction: () => Promise.reject(new Error('sin base')) },
    });
    expect((await send(event('invoice.paid', invoiceObject()), unclosed.deps)).status).toBe(200);
    expect(unclosed.record.lines).toEqual([
      'No se pudo cerrar una acción con Stripe. Se reintentará',
    ]);
  });
});

// Referidos con la prueba gratis (bloque B7 del plan del cambio, respuesta 77 y 4.3). El mes gratis
// llega con el primer cobro del referido, la primera factura pagada de más de 0 pesos, nunca con la
// sesión ni con la factura de 0 de una prueba, y una sola vez aunque Stripe repita el aviso
describe('referidos con la prueba gratis y el primer cobro', () => {
  /**
   * Lo que hace la base con cada cobro, reducido a lo que importa para el referido. Sigue las reglas de
   * apply_charge, complete_referral y revert_referral (migraciones 20261019000001 y 20261022000002). Un
   * aviso repetido se reconoce por su id, un pago de 0 pesos o sin plan se ignora, el mismo cobro no se
   * cuenta dos veces y el referido se concreta con el primer cobro, una sola vez. Un reembolso completo
   * de ese cobro, que de Stripe llega sin id de pago y se reconoce por su PaymentIntent o por el monto,
   * lo revierte y quita el mes. La regla de verdad la prueban referral_first_charge_test.sql y
   * billing_plans_test.sql contra Postgres
   */
  function ledger() {
    const events = new Set<string>();
    const charges = new Map<string, number>();
    const state = { referral: 'pending' as 'pending' | 'completed' | 'reverted', months: 0 };
    // El cobro que concretó el referido, como completed_payment_id en la base
    let concretedBy: string | null = null;
    const applyCharge = (notice: ChargeNotice): Promise<string> => {
      const key = `${notice.provider}:${notice.eventId}`;
      if (events.has(key)) return Promise.resolve('duplicate');
      events.add(key);
      if (notice.kind === 'refunded') {
        const refunded =
          notice.providerPaymentId ??
          [...charges].find(([, amount]) => amount === notice.amountMxn)?.[0] ??
          null;
        if (refunded !== null && refunded === concretedBy && state.referral === 'completed') {
          state.referral = 'reverted';
          state.months -= 1;
        }
        return Promise.resolve('applied');
      }
      if (notice.kind !== 'paid') return Promise.resolve('applied');
      if (
        notice.userId === null ||
        notice.plan === null ||
        notice.providerPaymentId === null ||
        notice.amountMxn === null ||
        notice.amountMxn <= 0
      ) {
        return Promise.resolve('ignored');
      }
      charges.set(notice.providerPaymentId, notice.amountMxn);
      if (state.referral === 'pending') {
        state.referral = 'completed';
        state.months += 1;
        concretedBy = notice.providerPaymentId;
      }
      return Promise.resolve('applied');
    };
    return {
      applyCharge,
      state,
      get charges() {
        return [...charges.keys()];
      },
    };
  }

  /** La factura de la suscripción del referido, con los datos que puso create-checkout */
  const invoice = (id: string, eventId: string, cents: number, reason: string) =>
    event(
      'invoice.paid',
      invoiceObject({ id, amount_paid: cents, billing_reason: reason }),
      eventId,
    );

  it('la prueba no da el mes, el primer cobro sí y un aviso repetido no da otro', async () => {
    const db = ledger();
    const session = subscriptionSession();
    const { deps, record } = webhookDeps({
      overrides: { applyCharge: db.applyCharge },
      routes: sessionRead(
        session,
        subscriptionObject({ status: 'trialing', trial_end: TRIAL_END }),
      ),
    });

    // Empieza la prueba. La sesión solo aplica el estado y la factura de 0 pesos se ignora
    const start = await send(event('checkout.session.completed', session, 'evt_sesion'), deps);
    expect(await start.text()).toBe('applied');
    expect(record.states.map((state) => state.status)).toEqual(['trialing']);
    const trial = await send(invoice('in_prueba', 'evt_prueba', 0, 'subscription_create'), deps);
    expect(await trial.text()).toBe('Ignorado');
    expect(db.state).toEqual({ referral: 'pending', months: 0 });

    // Termina la prueba y llega el primer cobro
    const first = await send(
      invoice('in_cobro1', 'evt_cobro1', 14_900, 'subscription_cycle'),
      deps,
    );
    expect(await first.text()).toBe('applied');
    expect(db.state).toEqual({ referral: 'completed', months: 1 });

    // Stripe reenvía el mismo aviso
    const again = await send(
      invoice('in_cobro1', 'evt_cobro1', 14_900, 'subscription_cycle'),
      deps,
    );
    expect(again.status).toBe(200);
    expect(await again.text()).toBe('duplicate');
    expect(db.state.months).toBe(1);

    // La renovación del mes siguiente tampoco da otro mes
    await send(invoice('in_cobro2', 'evt_cobro2', 14_900, 'subscription_cycle'), deps);
    expect(db.state.months).toBe(1);
    expect(db.charges).toEqual(['in_cobro1', 'in_cobro2']);
  });

  it('un reembolso completo del primer cobro revierte el referido y uno parcial ni llega a la base', async () => {
    const db = ledger();
    const { deps } = webhookDeps({ overrides: { applyCharge: db.applyCharge } });
    await send(invoice('in_cobro1', 'evt_cobro1', 15_000, 'subscription_create'), deps);
    expect(db.state).toEqual({ referral: 'completed', months: 1 });

    // Un reembolso parcial lo ignora el aviso, así que el referido sigue concretado
    const partial = await send(
      event(
        'charge.refunded',
        refundObject({ refunded: false, amount: 15_000, amount_refunded: 5_000 }),
        'evt_parcial',
      ),
      deps,
    );
    expect(await partial.text()).toBe('Ignorado');
    expect(db.state).toEqual({ referral: 'completed', months: 1 });

    // La garantía de 7 días devuelve todo el primer cobro. El mes de quien invitó se cae
    const refund = event('charge.refunded', refundObject({ amount: 15_000 }), 'evt_reembolso');
    expect(await (await send(refund, deps)).text()).toBe('applied');
    expect(db.state).toEqual({ referral: 'reverted', months: 0 });

    // Stripe reenvía el mismo reembolso. No pasa nada más
    expect(await (await send(refund, deps)).text()).toBe('duplicate');
    expect(db.state).toEqual({ referral: 'reverted', months: 0 });
  });

  it('sin prueba, el primer pago confirmado da el mes y su factura no se cuenta dos veces', async () => {
    const db = ledger();
    const session = subscriptionSession({
      payment_status: 'paid',
      amount_total: 15_000,
      invoice: 'in_1',
    });
    const { deps } = webhookDeps({
      overrides: { applyCharge: db.applyCharge },
      routes: sessionRead(session, subscriptionObject()),
    });
    // checkout.session.completed e invoice.paid traen la misma factura
    await send(event('checkout.session.completed', session, 'evt_sesion'), deps);
    await send(invoice('in_1', 'evt_factura_1', 15_000, 'subscription_create'), deps);
    expect(db.state).toEqual({ referral: 'completed', months: 1 });
    expect(db.charges).toEqual(['in_1']);
  });
});

// ---------------------------------------------------------------------------------------------
// Crear el pago

const baseContext: CheckoutContext = {
  inForce: null,
  subscription: null,
  passEnd: null,
  trialAvailable: true,
  trialDays: 7,
  founderOpen: true,
  founderSeatsLeft: 63,
  founderLost: false,
  oxxoExpiresDays: 3,
  customerId: 'cus_1',
};

const liveSubscription = (
  overrides: Partial<NonNullable<CheckoutContext['subscription']>> = {},
): NonNullable<CheckoutContext['subscription']> => ({
  plan: 'monthly',
  status: 'active',
  provider: 'stripe',
  subscriptionId: 'sub_1',
  periodEnd: '2026-11-14T16:00:00.000Z',
  cancelAtPeriodEnd: false,
  ...overrides,
});

interface HandlerOptions<T> {
  overrides?: Partial<T>;
  context?: Partial<CheckoutContext>;
  routes?: Record<string, Route>;
  env?: FunctionEnv;
}

function checkoutDeps(options: HandlerOptions<CheckoutDeps> = {}) {
  const { calls, fetchImpl } = fakeFetch({
    'POST /v1/checkout/sessions': reply({ id: 'cs_test_1', url: CHECKOUT_URL }),
    'POST /v1/customers': reply({ id: 'cus_nuevo' }),
    // Pase con preferencia y suscripción con preapproval (paquete C)
    'POST /checkout/preferences': reply({ init_point: MP_URL }),
    'POST /preapproval': reply({ init_point: MP_URL }),
    ...options.routes,
  });
  const lines: string[] = [];
  const linked: { userId: string; customerId: string }[] = [];
  const contexts: string[] = [];
  const deps: CheckoutDeps = {
    env: options.env ?? env,
    fetch: fetchImpl,
    now: () => NOW,
    log: (line) => {
      lines.push(line);
    },
    authenticate: (authorization) =>
      Promise.resolve(
        authorization === 'Bearer token' ? { id: USER, email: 'alumna@ejemplo.mx' } : null,
      ),
    checkoutContext: (userId) => {
      contexts.push(userId);
      return Promise.resolve({ ...baseContext, ...options.context });
    },
    linkCustomer: (link) => {
      linked.push(link);
      return Promise.resolve();
    },
    ...options.overrides,
  };
  return { deps, calls, lines, linked, contexts };
}

const askCheckout = (body: unknown, deps: CheckoutDeps, init: RequestInit = {}) =>
  handleCreateCheckout(
    new Request('https://f.supabase.co/functions/v1/create-checkout', {
      method: 'POST',
      headers: { authorization: 'Bearer token', origin: APP_ORIGIN },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...init,
    }),
    deps,
  );

describe('lo que pide la app para pagar', () => {
  it('sin modo es una suscripción, como manda la app de antes', () => {
    expect(parseCheckoutRequest({ plan: 'monthly', provider: 'stripe' })).toEqual({
      plan: 'monthly',
      provider: 'stripe',
      mode: 'subscription',
    });
    expect(
      parseCheckoutRequest({ plan: 'founder_annual', provider: 'stripe', expectTrial: true }),
    ).toEqual({
      plan: 'founder_annual',
      provider: 'stripe',
      mode: 'subscription',
      expectTrial: true,
    });
    expect(
      parseCheckoutRequest({ plan: 'annual', provider: 'stripe', mode: 'pass', method: 'spei' }),
    ).toEqual({ plan: 'annual', provider: 'stripe', mode: 'pass', method: 'spei' });
    expect(
      parseCheckoutRequest({ plan: 'monthly', provider: 'mercadopago', mode: 'pass' }),
    ).toEqual({ plan: 'monthly', provider: 'mercadopago', mode: 'pass' });
  });

  it('rechaza lo que no se puede pagar', () => {
    for (const body of [
      null,
      'monthly',
      [],
      { plan: 'free', provider: 'stripe' },
      { plan: 'monthly', provider: 'paypal' },
      { plan: 'monthly', provider: 'stripe', mode: 'regalo' },
      // La suscripción no lleva método
      { plan: 'monthly', provider: 'stripe', method: 'oxxo' },
      // Mercado Pago no lleva precio Fundador (8.3)
      { plan: 'founder', provider: 'mercadopago' },
      { plan: 'founder_annual', provider: 'mercadopago' },
      // El pase es de 1 mes o de 1 año, y con Stripe es OXXO o SPEI
      { plan: 'founder', provider: 'stripe', mode: 'pass', method: 'oxxo' },
      { plan: 'monthly', provider: 'stripe', mode: 'pass' },
      { plan: 'monthly', provider: 'stripe', mode: 'pass', method: 'tarjeta' },
      { plan: 'monthly', provider: 'mercadopago', mode: 'pass', method: 'oxxo' },
      { plan: 'monthly', provider: 'stripe', expectTrial: 'si' },
    ]) {
      expect(parseCheckoutRequest(body)).toBeNull();
    }
  });
});

describe('crear el pago', () => {
  it('abre la suscripción con 7 días de prueba, con quién paga y los regresos del servidor', async () => {
    const { deps, calls, contexts } = checkoutDeps();
    const answer = await askCheckout(
      // Lo que mande el navegador sobre quién paga no cuenta
      { plan: 'monthly', provider: 'stripe', expectTrial: true, user_id: 'otra-persona' },
      deps,
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ url: CHECKOUT_URL, mode: 'subscription', trial: true });
    expect(contexts).toEqual([USER]);
    expect(calls).toHaveLength(1);
    const session = calls[0];
    expect(session?.url.toString()).toBe('https://api.stripe.com/v1/checkout/sessions');
    const headers = new Headers(session?.init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(headers.get('stripe-version')).toBe(STRIPE_API_VERSION);
    expect(form(session)).toMatchObject({
      mode: 'subscription',
      customer: 'cus_1',
      'line_items[0][price]': 'price_mensual',
      client_reference_id: USER,
      'metadata[user_id]': USER,
      'metadata[plan]': 'monthly',
      'metadata[trial]': 'true',
      'subscription_data[trial_period_days]': '7',
      allow_promotion_codes: 'true',
      success_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=ok',
      cancel_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=cancelado',
    });
  });

  it('sin prueba disponible cobra hoy y no pide días', async () => {
    for (const context of [{ trialAvailable: false }, { trialDays: 0 }]) {
      const { deps, calls } = checkoutDeps({ context });
      const answer = await askCheckout({ plan: 'annual', provider: 'stripe' }, deps);
      expect(await answer.json()).toEqual({
        url: CHECKOUT_URL,
        mode: 'subscription',
        trial: false,
      });
      expect(form(calls[0])['subscription_data[trial_period_days]']).toBeUndefined();
      expect(form(calls[0])['metadata[trial]']).toBe('false');
    }
  });

  it('si la app esperaba otra cosa de la prueba contesta 409 con lo que sí hay', async () => {
    const used = checkoutDeps({ context: { trialAvailable: false } });
    const answer = await askCheckout(
      { plan: 'monthly', provider: 'stripe', expectTrial: true },
      used.deps,
    );
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ error: 'trial_mismatch', trialAvailable: false });
    expect(used.calls).toEqual([]);

    // Un pase nunca lleva prueba
    const pass = checkoutDeps();
    const passAnswer = await askCheckout(
      { plan: 'monthly', provider: 'stripe', mode: 'pass', method: 'oxxo', expectTrial: true },
      pass.deps,
    );
    expect(await passAnswer.json()).toEqual({ error: 'trial_mismatch', trialAvailable: false });
  });

  it('cada plan usa su precio de Stripe', async () => {
    const prices: Record<string, string> = {};
    for (const plan of ['founder', 'founder_annual', 'monthly', 'annual']) {
      const { deps, calls } = checkoutDeps();
      await askCheckout({ plan, provider: 'stripe' }, deps);
      prices[plan] = form(calls[0])['line_items[0][price]'] ?? '';
    }
    expect(prices).toEqual({
      founder: 'price_fundador',
      founder_annual: 'price_fundador_anual',
      monthly: 'price_mensual',
      annual: 'price_anual',
    });
  });

  it('un plan Fundador sin lugares o de quien ya lo perdió contesta 409 sin llamar a Stripe', async () => {
    const full = checkoutDeps({ context: { founderOpen: false, founderSeatsLeft: 0 } });
    const fullAnswer = await askCheckout({ plan: 'founder_annual', provider: 'stripe' }, full.deps);
    expect(fullAnswer.status).toBe(409);
    expect(await fullAnswer.json()).toEqual({ error: 'founder_full' });

    const lost = checkoutDeps({ context: { founderLost: true } });
    const lostAnswer = await askCheckout({ plan: 'founder', provider: 'stripe' }, lost.deps);
    expect(await lostAnswer.json()).toEqual({ error: 'founder_lost' });
    expect([...full.calls, ...lost.calls]).toEqual([]);

    // Sin lugares de Fundador se puede tomar el plan regular
    const regular = checkoutDeps({ context: { founderOpen: false } });
    expect((await askCheckout({ plan: 'monthly', provider: 'stripe' }, regular.deps)).status).toBe(
      200,
    );
  });

  it('con una suscripción vigente contesta 409 a todo y con un pase solo deja sumar otro pase', async () => {
    const subscribed = checkoutDeps({
      context: { inForce: 'subscription', subscription: liveSubscription() },
    });
    for (const body of [
      { plan: 'annual', provider: 'stripe' },
      { plan: 'monthly', provider: 'stripe', mode: 'pass', method: 'oxxo' },
    ]) {
      const answer = await askCheckout(body, subscribed.deps);
      expect(answer.status).toBe(409);
      expect(await answer.json()).toEqual({ error: 'already_subscribed' });
    }
    expect(subscribed.calls).toEqual([]);

    const withPass = checkoutDeps({
      context: { inForce: 'pass', passEnd: '2026-11-10T06:00:00.000Z' },
    });
    const blocked = await askCheckout({ plan: 'monthly', provider: 'stripe' }, withPass.deps);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({
      error: 'pass_in_force',
      passEnd: '2026-11-10T06:00:00.000Z',
    });
    const another = await askCheckout(
      { plan: 'annual', provider: 'stripe', mode: 'pass', method: 'spei' },
      withPass.deps,
    );
    expect(another.status).toBe(200);
  });

  it('el pase con OXXO solo deja OXXO, con su vencimiento y el regreso de pago pendiente', async () => {
    const { deps, calls } = checkoutDeps({ context: { oxxoExpiresDays: 2 } });
    const answer = await askCheckout(
      { plan: 'monthly', provider: 'stripe', mode: 'pass', method: 'oxxo' },
      deps,
    );
    expect(await answer.json()).toEqual({ url: CHECKOUT_URL, mode: 'pass', trial: false });
    expect(form(calls[0])).toMatchObject({
      mode: 'payment',
      customer: 'cus_1',
      'line_items[0][price]': 'price_pase_mes',
      'allowed_payment_method_types[0]': 'oxxo',
      'payment_method_options[oxxo][expires_after_days]': '2',
      'metadata[mode]': 'pass',
      'metadata[method]': 'oxxo',
      success_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=pendiente&metodo=oxxo',
    });
  });

  it('el pase con SPEI es transferencia de México con el precio del pase anual', async () => {
    const { deps, calls } = checkoutDeps();
    await askCheckout({ plan: 'annual', provider: 'stripe', mode: 'pass', method: 'spei' }, deps);
    expect(form(calls[0])).toMatchObject({
      'line_items[0][price]': 'price_pase_anio',
      'allowed_payment_method_types[0]': 'customer_balance',
      'payment_method_options[customer_balance][bank_transfer][type]': 'mx_bank_transfer',
    });
  });

  it('quien no tiene cliente de Stripe recibe uno ligado antes de abrir el pago', async () => {
    const { deps, calls, linked } = checkoutDeps({ context: { customerId: null } });
    const answer = await askCheckout({ plan: 'monthly', provider: 'stripe' }, deps);
    expect(answer.status).toBe(200);
    expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      'POST /v1/customers',
      'POST /v1/checkout/sessions',
    ]);
    expect(new Headers(calls[0]?.init?.headers).get('idempotency-key')).toBe(
      `studiare-customer-${USER}`,
    );
    expect(form(calls[0])).toEqual({
      email: 'alumna@ejemplo.mx',
      'metadata[user_id]': USER,
      'preferred_locales[0]': 'es-419',
    });
    expect(linked).toEqual([{ userId: USER, customerId: 'cus_nuevo' }]);
    expect(form(calls[1]).customer).toBe('cus_nuevo');
  });

  it('si no se pudo crear o ligar el cliente contesta 502 sin abrir el pago', async () => {
    const rejected = checkoutDeps({
      context: { customerId: null },
      routes: { 'POST /v1/customers': stripeError(400, { code: 'email_invalid' }) },
    });
    expect((await askCheckout({ plan: 'monthly', provider: 'stripe' }, rejected.deps)).status).toBe(
      502,
    );
    expect(rejected.lines[0]).toMatch(/^Stripe no creó el cliente del alumno\. estado 400/);
    expect(rejected.calls).toHaveLength(1);

    const unlinked = checkoutDeps({
      context: { customerId: null },
      overrides: { linkCustomer: () => Promise.reject(new Error('sin base')) },
    });
    expect((await askCheckout({ plan: 'monthly', provider: 'stripe' }, unlinked.deps)).status).toBe(
      502,
    );
    expect(unlinked.lines).toEqual(['No se pudo ligar el cliente nuevo de Stripe en la base']);
    expect(unlinked.calls).toHaveLength(1);
  });

  it('si el cliente guardado ya no existe en Stripe crea otro, lo liga y reintenta una vez', async () => {
    let tries = 0;
    const missing = stripeError(400, {
      code: 'resource_missing',
      param: 'customer',
      message: "No such customer: 'cus_1'",
    });
    const { deps, calls, linked } = checkoutDeps({
      routes: {
        'POST /v1/checkout/sessions': (url, init) => {
          tries += 1;
          return tries === 1 ? missing(url, init) : reply({ url: CHECKOUT_URL })(url, init);
        },
      },
    });
    const answer = await askCheckout({ plan: 'monthly', provider: 'stripe' }, deps);
    expect(answer.status).toBe(200);
    expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      'POST /v1/checkout/sessions',
      'POST /v1/customers',
      'POST /v1/checkout/sessions',
    ]);
    expect(new Headers(calls[1]?.init?.headers).get('idempotency-key')).toBe(
      `studiare-customer-${USER}-sin-cus_1`,
    );
    expect(linked).toEqual([{ userId: USER, customerId: 'cus_nuevo' }]);
    expect(form(calls[2]).customer).toBe('cus_nuevo');
  });

  it('si Stripe rechaza el pago deja el motivo en el registro, sin la llave', async () => {
    const { deps, lines } = checkoutDeps({
      routes: {
        'POST /v1/checkout/sessions': stripeError(400, {
          code: 'parameter_invalid_empty',
          param: 'line_items[0][price]',
          message: 'You passed an empty string',
        }),
      },
    });
    expect((await askCheckout({ plan: 'monthly', provider: 'stripe' }, deps)).status).toBe(502);
    expect(lines).toEqual([
      'Stripe rechazó el pago del plan monthly. estado 400, tipo invalid_request_error, código parameter_invalid_empty, parámetro line_items[0][price], mensaje You passed an empty string',
    ]);
    expect(lines.join(' ')).not.toContain(KEY);
  });

  it('sin dirección en la respuesta o sin red contesta 502 y lo deja en el registro', async () => {
    const noUrl = checkoutDeps({ routes: { 'POST /v1/checkout/sessions': reply({ id: 'cs_1' }) } });
    expect((await askCheckout({ plan: 'monthly', provider: 'stripe' }, noUrl.deps)).status).toBe(
      502,
    );
    expect(noUrl.lines).toEqual([
      'Stripe creó el pago del plan monthly pero no mandó la dirección',
    ]);

    const down = checkoutDeps({ routes: { 'POST /v1/checkout/sessions': offline } });
    expect((await askCheckout({ plan: 'annual', provider: 'stripe' }, down.deps)).status).toBe(502);
    expect(down.lines).toEqual(['No se pudo crear el pago del plan annual con stripe. TypeError']);
  });

  it('un Price ID que falta o que es del producto se dice sin llamar a Stripe', async () => {
    const missing = checkoutDeps({ env: { ...env, STRIPE_PRICE_MONTHLY: '' } });
    expect((await askCheckout({ plan: 'monthly', provider: 'stripe' }, missing.deps)).status).toBe(
      503,
    );
    expect(missing.lines).toEqual([
      'Falta el secreto STRIPE_PRICE_MONTHLY en Supabase, Edge Functions, Secrets',
    ]);

    const product = checkoutDeps({ env: { ...env, STRIPE_PRICE_PASS_ANNUAL: 'prod_123' } });
    const answer = await askCheckout(
      { plan: 'annual', provider: 'stripe', mode: 'pass', method: 'oxxo' },
      product.deps,
    );
    expect(answer.status).toBe(503);
    expect(await answer.json()).toEqual({ error: 'not_configured' });
    expect(product.lines).toEqual([
      'STRIPE_PRICE_PASS_ANNUAL no es un Price ID. Debe empezar con price_ y empieza con prod_. Cópialo de la sección Pricing del producto en Stripe',
    ]);
    expect([...missing.calls, ...product.calls]).toEqual([]);
  });

  it('sin llave de Stripe o sin dirección de la app contesta 503', async () => {
    const withoutKey = checkoutDeps({ env: envWithoutKey });
    expect(
      (await askCheckout({ plan: 'monthly', provider: 'stripe' }, withoutKey.deps)).status,
    ).toBe(503);
    const withoutApp = checkoutDeps({ env: { ...env, APP_URL: '' } });
    expect(
      (await askCheckout({ plan: 'monthly', provider: 'stripe' }, withoutApp.deps)).status,
    ).toBe(503);
    expect(withoutApp.contexts).toEqual([]);
  });

  it('si no puede leer el plan en la base no abre el pago y lo deja en el registro', async () => {
    const { deps, calls, lines } = checkoutDeps({
      overrides: { checkoutContext: () => Promise.reject(new Error('sin base')) },
    });
    const answer = await askCheckout({ plan: 'monthly', provider: 'stripe' }, deps);
    expect(answer.status).toBe(502);
    expect(await answer.json()).toEqual({ error: 'provider' });
    expect(lines).toEqual([
      'No se pudo leer checkout_context antes de abrir el pago del plan monthly',
    ]);
    expect(calls).toEqual([]);
  });

  it('sin sesión contesta 401 y con un cuerpo que no se entiende 400, sin tocar nada', async () => {
    const { deps, calls, contexts } = checkoutDeps();
    const anonymous = await askCheckout({ plan: 'monthly', provider: 'stripe' }, deps, {
      headers: { origin: APP_ORIGIN },
    });
    expect(anonymous.status).toBe(401);
    expect((await askCheckout('no es json', deps)).status).toBe(400);
    expect((await askCheckout({ plan: 'free', provider: 'stripe' }, deps)).status).toBe(400);
    expect(calls).toEqual([]);
    expect(contexts).toEqual([]);
  });

  it('con Stripe Tax activado calcula el impuesto y deja actualizar el cliente, solo con true', async () => {
    const taxed = checkoutDeps({ env: { ...env, STRIPE_AUTOMATIC_TAX: 'true' } });
    await askCheckout({ plan: 'monthly', provider: 'stripe' }, taxed.deps);
    expect(form(taxed.calls[0])).toMatchObject({
      'automatic_tax[enabled]': 'true',
      billing_address_collection: 'required',
      'tax_id_collection[enabled]': 'true',
      'customer_update[address]': 'auto',
      'customer_update[name]': 'auto',
    });
    for (const value of ['TRUE', '1', 'si', '']) {
      const plain = checkoutDeps({ env: { ...env, STRIPE_AUTOMATIC_TAX: value } });
      await askCheckout({ plan: 'monthly', provider: 'stripe' }, plain.deps);
      expect(form(plain.calls[0])['automatic_tax[enabled]']).toBeUndefined();
    }
  });

  it('Mercado Pago abre su propio pago y nunca lleva prueba', async () => {
    // Cómo arma Mercado Pago el pago lo prueba mercadopago.test.ts. Aquí solo la dirección que vuelve
    const { deps } = checkoutDeps();
    for (const mode of ['subscription', 'pass'] as const) {
      const answer = await askCheckout({ plan: 'monthly', provider: 'mercadopago', mode }, deps);
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ url: MP_URL, mode, trial: false });
    }
    const withTrial = await askCheckout(
      { plan: 'monthly', provider: 'mercadopago', expectTrial: true },
      deps,
    );
    expect(await withTrial.json()).toEqual({ error: 'trial_mismatch', trialAvailable: false });
    expect((await askCheckout({ plan: 'founder', provider: 'mercadopago' }, deps)).status).toBe(
      400,
    );
  });

  it('solo la página de la app puede llamar desde el navegador', async () => {
    const { deps } = checkoutDeps();
    const ok = await askCheckout({ plan: 'monthly', provider: 'stripe' }, deps);
    expect(ok.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    const foreign = await askCheckout({ plan: 'monthly', provider: 'stripe' }, deps, {
      headers: { authorization: 'Bearer token', origin: 'https://malo.example' },
    });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
    expect(
      corsHeaders({ APP_URL: 'no es una url' }, APP_ORIGIN)['access-control-allow-origin'],
    ).toBeUndefined();
    expect(corsHeaders({}, null)['access-control-allow-origin']).toBeUndefined();
  });

  it('contesta la consulta previa del navegador y rechaza otros métodos', async () => {
    const { deps } = checkoutDeps();
    const preflight = await handleCreateCheckout(
      new Request('https://f.supabase.co/functions/v1/create-checkout', {
        method: 'OPTIONS',
        headers: { origin: APP_ORIGIN },
      }),
      deps,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    const get = await handleCreateCheckout(
      new Request('https://f.supabase.co/functions/v1/create-checkout'),
      deps,
    );
    expect(get.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------------------------
// Portal

function portalDeps(options: HandlerOptions<PortalDeps> = {}) {
  const { calls, fetchImpl } = fakeFetch({
    'POST /v1/billing_portal/sessions': reply({ id: 'bps_1', url: PORTAL_URL }),
    ...options.routes,
  });
  const lines: string[] = [];
  const deps: PortalDeps = {
    env: options.env ?? env,
    fetch: fetchImpl,
    now: () => NOW,
    log: (line) => {
      lines.push(line);
    },
    authenticate: (authorization) =>
      Promise.resolve(
        authorization === 'Bearer token' ? { id: USER, email: 'alumna@ejemplo.mx' } : null,
      ),
    checkoutContext: () =>
      Promise.resolve({
        ...baseContext,
        inForce: 'subscription',
        subscription: liveSubscription(),
        ...options.context,
      }),
    ...options.overrides,
  };
  return { deps, calls, lines };
}

const askPortal = (deps: PortalDeps, body = '', init: RequestInit = {}) =>
  handleCreatePortal(
    new Request('https://f.supabase.co/functions/v1/create-portal-session', {
      method: 'POST',
      headers: { authorization: 'Bearer token', origin: APP_ORIGIN },
      body,
      ...init,
    }),
    deps,
  );

describe('portal de facturación', () => {
  it('abre el portal regular del cliente del alumno y vuelve a Suscripción', async () => {
    const { deps, calls, lines } = portalDeps();
    const answer = await askPortal(deps, '{}');
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ url: PORTAL_URL });
    expect(calls[0]?.url.toString()).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(new Headers(calls[0]?.init?.headers).get('stripe-version')).toBe(STRIPE_API_VERSION);
    expect(form(calls[0])).toEqual({
      customer: 'cus_1',
      return_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion',
      locale: 'es-419',
      configuration: 'bpc_regular',
    });
    expect(lines).toEqual([]);
  });

  it('un plan Fundador abre la configuración de Fundadores', async () => {
    for (const plan of ['founder', 'founder_annual']) {
      const { deps, calls } = portalDeps({ context: { subscription: liveSubscription({ plan }) } });
      await askPortal(deps);
      expect(form(calls[0]).configuration).toBe('bpc_fundador');
    }
  });

  it('con flow abre directo cambiar de plan o cancelar la suscripción de Stripe', async () => {
    const update = portalDeps();
    await askPortal(update.deps, JSON.stringify({ flow: 'update' }));
    expect(form(update.calls[0])).toMatchObject({
      'flow_data[type]': 'subscription_update',
      'flow_data[subscription_update][subscription]': 'sub_1',
      'flow_data[after_completion][type]': 'redirect',
    });
    const cancel = portalDeps();
    await askPortal(cancel.deps, JSON.stringify({ flow: 'cancel' }));
    expect(form(cancel.calls[0])).toMatchObject({
      'flow_data[type]': 'subscription_cancel',
      'flow_data[subscription_cancel][subscription]': 'sub_1',
    });
  });

  it('sin suscripción vigente el flow se ignora y el portal se abre normal', async () => {
    const { deps, calls, lines } = portalDeps({
      context: { inForce: null, subscription: liveSubscription({ status: 'canceled' }) },
    });
    expect((await askPortal(deps, JSON.stringify({ flow: 'cancel' }))).status).toBe(200);
    expect(form(calls[0])['flow_data[type]']).toBeUndefined();
    expect(lines).toEqual([
      'No hay suscripción de Stripe vigente para abrir el portal en cancel. Se abre normal',
    ]);
  });

  it('el cliente sale de la base y no de lo que mande el navegador', async () => {
    const { deps, calls } = portalDeps();
    await askPortal(deps, JSON.stringify({ customer: 'cus_de_otra_persona' }));
    expect(form(calls[0]).customer).toBe('cus_1');
  });

  it('un flow que no existe o un cuerpo que no es JSON contesta 400', async () => {
    const { deps, calls } = portalDeps();
    expect((await askPortal(deps, JSON.stringify({ flow: 'pausar' }))).status).toBe(400);
    expect((await askPortal(deps, 'no es json')).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('una suscripción de Mercado Pago no tiene portal y contesta 409', async () => {
    const { deps, calls } = portalDeps({
      context: {
        subscription: liveSubscription({ provider: 'mercadopago', subscriptionId: 'preapp_1' }),
      },
    });
    const answer = await askPortal(deps);
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ error: 'mercadopago' });
    expect(calls).toEqual([]);
  });

  it('quien nunca tuvo cliente de Stripe recibe 404 no_customer', async () => {
    const { deps, calls } = portalDeps({
      context: { inForce: null, subscription: null, customerId: null },
    });
    const answer = await askPortal(deps);
    expect(answer.status).toBe(404);
    expect(await answer.json()).toEqual({ error: 'no_customer' });
    expect(calls).toEqual([]);
  });

  it('sin la configuración del portal se abre la de Stripe y queda en el registro', async () => {
    const { deps, calls, lines } = portalDeps({
      env: { ...env, STRIPE_PORTAL_CONFIG_REGULAR: ' ' },
    });
    expect((await askPortal(deps)).status).toBe(200);
    expect(form(calls[0]).configuration).toBeUndefined();
    expect(lines).toEqual([
      'Falta STRIPE_PORTAL_CONFIG_REGULAR. El portal se abre con la configuración por omisión de Stripe',
    ]);
  });

  it('sin sesión contesta 401 y sin llave o sin dirección de la app 503', async () => {
    const { deps, calls } = portalDeps();
    expect((await askPortal(deps, '', { headers: { origin: APP_ORIGIN } })).status).toBe(401);
    expect((await askPortal(portalDeps({ env: envWithoutKey }).deps)).status).toBe(503);
    expect((await askPortal(portalDeps({ env: { ...env, APP_URL: '' } }).deps)).status).toBe(503);
    expect(calls).toEqual([]);
  });

  it('si Stripe lo rechaza, la base falla, no hay red o no manda dirección contesta 502', async () => {
    const rejected = portalDeps({
      routes: {
        'POST /v1/billing_portal/sessions': stripeError(400, {
          code: 'resource_missing',
          param: 'configuration',
          message: 'No such configuration',
        }),
      },
    });
    expect((await askPortal(rejected.deps)).status).toBe(502);
    expect(rejected.lines[0]).toMatch(/^Stripe rechazó el portal\. estado 400/);
    expect(rejected.lines.join(' ')).not.toContain(KEY);

    const noBase = portalDeps({
      overrides: { checkoutContext: () => Promise.reject(new Error('sin base')) },
    });
    expect((await askPortal(noBase.deps)).status).toBe(502);
    expect(noBase.lines).toEqual(['No se pudo leer checkout_context antes de abrir el portal']);

    const down = portalDeps({ routes: { 'POST /v1/billing_portal/sessions': offline } });
    expect((await askPortal(down.deps)).status).toBe(502);
    expect(down.lines).toEqual(['Sin red hacia Stripe al abrir el portal']);

    const noUrl = portalDeps({ routes: { 'POST /v1/billing_portal/sessions': reply({}) } });
    expect((await askPortal(noUrl.deps)).status).toBe(502);
  });

  it('solo la página de la app puede llamar desde el navegador, y contesta la consulta previa', async () => {
    const { deps } = portalDeps();
    const ok = await askPortal(deps);
    expect(ok.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    const preflight = await handleCreatePortal(
      new Request('https://f.supabase.co/functions/v1/create-portal-session', {
        method: 'OPTIONS',
        headers: { origin: APP_ORIGIN },
      }),
      deps,
    );
    expect(preflight.status).toBe(204);
    const get = await handleCreatePortal(
      new Request('https://f.supabase.co/functions/v1/create-portal-session'),
      deps,
    );
    expect(get.status).toBe(405);
  });
});

describe('precios', () => {
  it('coinciden con los de la app, para que no se desfasen', () => {
    expect(PLAN_PRICES_MXN.founder).toBe(PLANS.founder.priceMxn);
    expect(PLAN_PRICES_MXN.monthly).toBe(PLANS.monthly.priceMxn);
    expect(PLAN_PRICES_MXN.annual).toBe(PLANS.annual.priceMxn);
    // El anual Fundador todavía no está en la app de este bloque (paquete B). Es el de 1.2
    expect(PLAN_PRICES_MXN.founder_annual).toBe(749);
  });

  it('los pases cuestan lo mismo que el mensual y el anual', () => {
    expect(PASS_PRICES_MXN).toEqual({
      monthly: PLANS.monthly.priceMxn,
      annual: PLANS.annual.priceMxn,
    });
  });
});
