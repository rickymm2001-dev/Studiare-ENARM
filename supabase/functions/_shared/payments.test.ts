import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PLANS } from '../../../src/config/billing.ts';
import {
  PLAN_PRICES_MXN,
  STRIPE_TOLERANCE_SECONDS,
  corsHeaders,
  handleCreateCheckout,
  handleCreatePortal,
  handleMercadoPagoWebhook,
  handleStripeWebhook,
  noticeFromMercadoPagoPayment,
  noticeFromStripeEvent,
  parseExternalReference,
  safeEqual,
  stripeCustomerLink,
  stripeRefundFromEvent,
  verifyMercadoPagoSignature,
  verifyStripeSignature,
  type CheckoutDeps,
  type FunctionEnv,
  type PaymentDeps,
  type PaymentNotice,
  type PortalDeps,
} from './payments.ts';

const USER = '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f';
const NOW = Date.parse('2026-10-08T16:00:00.000Z');
const STRIPE_SECRET = 'secreto-de-prueba-stripe';
const MP_SECRET = 'secreto-de-prueba-mp';

const env: FunctionEnv = {
  STRIPE_SECRET_KEY: 'llave-de-prueba-stripe',
  STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
  STRIPE_PRICE_FOUNDER: 'price_fundador',
  STRIPE_PRICE_MONTHLY: 'price_mensual',
  STRIPE_PRICE_ANNUAL: 'price_anual',
  MERCADOPAGO_ACCESS_TOKEN: 'token-de-prueba-mp',
  MERCADOPAGO_WEBHOOK_SECRET: MP_SECRET,
  APP_URL: 'https://app.ejemplo.mx/Studiare-ENARM/',
  FUNCTIONS_URL: 'https://proyecto.supabase.co/functions/v1/',
};

/** El cuerpo de una petición que mandó el código bajo prueba, siempre un texto */
const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string'
    ? init.body
    : init?.body instanceof URLSearchParams
      ? init.body.toString()
      : '';

const hmac = (secret: string, message: string) =>
  createHmac('sha256', secret).update(message).digest('hex');

function stripeHeader(body: string, options: { secret?: string; t?: number } = {}) {
  const t = options.t ?? Math.floor(NOW / 1000);
  return `t=${t},v1=${hmac(options.secret ?? STRIPE_SECRET, `${t}.${body}`)}`;
}

function mpHeader(options: { dataId?: string; requestId?: string; ts?: number; secret?: string }) {
  const ts = options.ts ?? NOW;
  let manifest = '';
  if (options.dataId) manifest += `id:${options.dataId.toLowerCase()};`;
  if (options.requestId) manifest += `request-id:${options.requestId};`;
  manifest += `ts:${ts};`;
  return `ts=${ts},v1=${hmac(options.secret ?? MP_SECRET, manifest)}`;
}

const sessionEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt_sesion',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_1',
      payment_status: 'paid',
      client_reference_id: USER,
      metadata: { user_id: USER, plan: 'monthly' },
      amount_total: 15000,
      currency: 'mxn',
      subscription: 'sub_1',
      invoice: 'in_1',
      customer: 'cus_1',
      ...overrides,
    },
  },
});

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

describe('firma de Mercado Pago', () => {
  const base = { requestId: 'req-1', dataId: 'ABC123', secret: MP_SECRET, nowMs: NOW };

  it('acepta una firma buena, con el id en minúsculas', async () => {
    const header = mpHeader({ dataId: 'ABC123', requestId: 'req-1' });
    expect(await verifyMercadoPagoSignature({ ...base, header })).toBe(true);
  });

  it('omite lo que no llegó del mensaje firmado', async () => {
    const header = mpHeader({ dataId: '99' });
    expect(
      await verifyMercadoPagoSignature({ ...base, dataId: '99', requestId: null, header }),
    ).toBe(true);
    const bare = mpHeader({});
    expect(
      await verifyMercadoPagoSignature({ ...base, dataId: null, requestId: null, header: bare }),
    ).toBe(true);
  });

  it('rechaza otro secreto, otro id, otro request-id, un encabezado roto o una marca vieja', async () => {
    const header = mpHeader({ dataId: 'ABC123', requestId: 'req-1' });
    expect(await verifyMercadoPagoSignature({ ...base, header, secret: 'otro' })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header, dataId: 'XYZ' })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header, requestId: 'req-2' })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header: null })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header: 'ts=abc' })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header: 'v1=00' })).toBe(false);
    const stale = mpHeader({ dataId: 'ABC123', requestId: 'req-1', ts: NOW - 10 * 60_000 });
    expect(await verifyMercadoPagoSignature({ ...base, header: stale })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header, secret: '' })).toBe(false);
  });
});

describe('eventos de Stripe', () => {
  it('una sesión pagada trae quién, qué plan y cuánto', () => {
    expect(noticeFromStripeEvent(sessionEvent())).toMatchObject({
      provider: 'stripe',
      eventId: 'evt_sesion',
      kind: 'paid',
      userId: USER,
      plan: 'monthly',
      providerPaymentId: 'in_1',
      providerSubscriptionId: 'sub_1',
      amountMxn: 150,
      periodEnd: null,
    });
  });

  it('sin factura usa el pago o la sesión como id de pago', () => {
    expect(
      noticeFromStripeEvent(sessionEvent({ invoice: null, payment_intent: 'pi_1' }))
        ?.providerPaymentId,
    ).toBe('pi_1');
    expect(noticeFromStripeEvent(sessionEvent({ invoice: null }))?.providerPaymentId).toBe(
      'cs_test_1',
    );
  });

  it('una sesión sin pagar, de otra moneda o de otro dueño no activa nada', () => {
    expect(noticeFromStripeEvent(sessionEvent({ payment_status: 'unpaid' }))).toBeNull();
    expect(noticeFromStripeEvent(sessionEvent({ currency: 'usd' }))?.amountMxn).toBeNull();
    // El usuario sale de lo que puso esta función, y un id que no es de usuario no se acepta
    expect(
      noticeFromStripeEvent(sessionEvent({ client_reference_id: 'no-es-uuid' }))?.userId,
    ).toBeNull();
    expect(noticeFromStripeEvent(sessionEvent({ metadata: { plan: 'gratis' } }))?.plan).toBeNull();
  });

  it('una factura pagada con la forma nueva trae el plan, el periodo y su suscripción', () => {
    const notice = noticeFromStripeEvent({
      id: 'evt_factura',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_2',
          amount_paid: 15000,
          currency: 'mxn',
          parent: {
            subscription_details: {
              subscription: 'sub_1',
              metadata: { user_id: USER, plan: 'monthly' },
            },
          },
          lines: { data: [{ period: { start: 1_700_000_000, end: 1_702_592_000 } }] },
        },
      },
    });
    expect(notice).toMatchObject({
      kind: 'paid',
      userId: USER,
      plan: 'monthly',
      providerPaymentId: 'in_2',
      providerSubscriptionId: 'sub_1',
      amountMxn: 150,
      periodEnd: new Date(1_702_592_000 * 1000).toISOString(),
    });
  });

  it('una factura con la forma anterior también se entiende', () => {
    const notice = noticeFromStripeEvent({
      id: 'evt_vieja',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_3',
          subscription: 'sub_9',
          amount_paid: 120000,
          currency: 'mxn',
          subscription_details: { metadata: { user_id: USER, plan: 'annual' } },
          lines: { data: [{ period: { end: 1_800_000_000 } }] },
        },
      },
    });
    expect(notice).toMatchObject({
      userId: USER,
      plan: 'annual',
      providerSubscriptionId: 'sub_9',
      amountMxn: 1200,
    });
  });

  it('una factura sin datos propios no trae usuario', () => {
    const notice = noticeFromStripeEvent({
      id: 'evt_x',
      type: 'invoice.paid',
      data: { object: { id: 'in_4', amount_paid: 100, currency: 'mxn' } },
    });
    expect(notice).toMatchObject({ userId: null, plan: null, periodEnd: null });
  });

  it('un cobro fallido y una suscripción cancelada se traducen', () => {
    const failed = noticeFromStripeEvent({
      id: 'evt_f',
      type: 'invoice.payment_failed',
      data: {
        object: { id: 'in_5', parent: { subscription_details: { metadata: { user_id: USER } } } },
      },
    });
    expect(failed).toMatchObject({ kind: 'failed', userId: USER, amountMxn: null });
    const canceled = noticeFromStripeEvent({
      id: 'evt_c',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', metadata: { user_id: USER, plan: 'monthly' } } },
    });
    expect(canceled).toMatchObject({
      kind: 'canceled',
      userId: USER,
      providerSubscriptionId: 'sub_1',
    });
  });

  it('cancelar al final del periodo se avisa desde que se cancela, y otra actualización no', () => {
    const updated = (object: Record<string, unknown>) => ({
      id: 'evt_u',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', metadata: { user_id: USER, plan: 'monthly' }, ...object } },
    });
    expect(noticeFromStripeEvent(updated({ cancel_at_period_end: true }))).toMatchObject({
      kind: 'canceled',
      userId: USER,
      providerSubscriptionId: 'sub_1',
    });
    // Renovar o cambiar la tarjeta no es una cancelación
    expect(noticeFromStripeEvent(updated({ cancel_at_period_end: false }))).toBeNull();
    expect(noticeFromStripeEvent(updated({}))).toBeNull();
  });

  it('lo que no se entiende se ignora', () => {
    expect(
      noticeFromStripeEvent({ id: 'e', type: 'customer.created', data: { object: {} } }),
    ).toBeNull();
    expect(noticeFromStripeEvent(null)).toBeNull();
    expect(noticeFromStripeEvent({ type: 'invoice.paid' })).toBeNull();
    expect(noticeFromStripeEvent('texto')).toBeNull();
  });
});

const refundEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt_reembolso',
  type: 'charge.refunded',
  data: {
    object: {
      id: 'ch_1',
      amount: 15000,
      amount_refunded: 15000,
      refunded: true,
      currency: 'mxn',
      customer: 'cus_1',
      ...overrides,
    },
  },
});

describe('cliente y reembolsos de Stripe', () => {
  it('un pago verificado con el alumno puesto por nosotros liga al alumno con su cliente', () => {
    expect(stripeCustomerLink(sessionEvent())).toEqual({ userId: USER, customerId: 'cus_1' });
    // También con el cliente expandido como objeto
    expect(stripeCustomerLink(sessionEvent({ customer: { id: 'cus_2' } }))).toEqual({
      userId: USER,
      customerId: 'cus_2',
    });
  });

  it('no liga sin cliente, sin alumno propio, sin pago o con un cobro fallido', () => {
    expect(stripeCustomerLink(sessionEvent({ customer: null }))).toBeNull();
    expect(stripeCustomerLink(sessionEvent({ client_reference_id: 'no-es-uuid' }))).toBeNull();
    expect(stripeCustomerLink(sessionEvent({ payment_status: 'unpaid' }))).toBeNull();
    expect(
      stripeCustomerLink({ id: 'e', type: 'invoice.payment_failed', data: { object: {} } }),
    ).toBeNull();
    expect(stripeCustomerLink(null)).toBeNull();
  });

  it('un cargo devuelto por completo trae el cliente y el monto cobrado', () => {
    expect(stripeRefundFromEvent(refundEvent())).toMatchObject({
      eventId: 'evt_reembolso',
      customerId: 'cus_1',
      amountMxn: 150,
    });
  });

  it('un reembolso parcial, sin cliente o de otra moneda se ignora', () => {
    expect(
      stripeRefundFromEvent(refundEvent({ refunded: false, amount_refunded: 5000 })),
    ).toBeNull();
    expect(stripeRefundFromEvent(refundEvent({ customer: null }))).toBeNull();
    expect(stripeRefundFromEvent(refundEvent({ currency: 'usd' }))).toBeNull();
    expect(stripeRefundFromEvent(refundEvent({ amount: 0 }))).toBeNull();
    expect(stripeRefundFromEvent({ ...refundEvent(), type: 'charge.succeeded' })).toBeNull();
    expect(stripeRefundFromEvent('nada')).toBeNull();
  });
});

describe('pagos de Mercado Pago', () => {
  const payment = (overrides: Record<string, unknown> = {}) => ({
    id: 12345,
    status: 'approved',
    external_reference: `${USER}|founder`,
    transaction_amount: 79,
    currency_id: 'MXN',
    ...overrides,
  });

  it('un pago aprobado trae quién, qué plan y cuánto, y su id de evento incluye el estado', () => {
    expect(noticeFromMercadoPagoPayment(payment())).toMatchObject({
      provider: 'mercadopago',
      eventId: '12345:approved',
      kind: 'paid',
      userId: USER,
      plan: 'founder',
      providerPaymentId: '12345',
      amountMxn: 79,
    });
  });

  it('un reembolso o contracargo se aplica como reembolso', () => {
    expect(noticeFromMercadoPagoPayment(payment({ status: 'refunded' }))).toMatchObject({
      kind: 'refunded',
      eventId: '12345:refunded',
    });
    expect(noticeFromMercadoPagoPayment(payment({ status: 'charged_back' }))?.kind).toBe(
      'refunded',
    );
  });

  it('un pago pendiente, rechazado o sin referencia propia no activa nada', () => {
    expect(noticeFromMercadoPagoPayment(payment({ status: 'pending' }))).toBeNull();
    expect(noticeFromMercadoPagoPayment(payment({ status: 'rejected' }))).toBeNull();
    expect(
      noticeFromMercadoPagoPayment(payment({ external_reference: 'otra-cosa' })),
    ).toMatchObject({ userId: null, plan: null });
    expect(noticeFromMercadoPagoPayment(payment({ currency_id: 'USD' }))?.amountMxn).toBeNull();
    expect(noticeFromMercadoPagoPayment({})).toBeNull();
  });

  it('la referencia externa pide un usuario y un plan de pago', () => {
    expect(parseExternalReference(`${USER}|annual`)).toEqual({ userId: USER, plan: 'annual' });
    expect(parseExternalReference(`${USER}|free`)).toBeNull();
    expect(parseExternalReference('x|monthly')).toBeNull();
    expect(parseExternalReference(42)).toBeNull();
  });
});

function paymentDeps(overrides: Partial<PaymentDeps> = {}) {
  const applied: PaymentNotice[] = [];
  const linked: { userId: string; customerId: string }[] = [];
  const deps: PaymentDeps = {
    env,
    fetch: () => Promise.reject(new Error('no debía llamar a fetch')),
    now: () => NOW,
    applyNotice: (notice) => {
      applied.push(notice);
      return Promise.resolve('applied');
    },
    linkCustomer: (link) => {
      linked.push(link);
      return Promise.resolve();
    },
    userOfCustomer: (customerId) => Promise.resolve(customerId === 'cus_1' ? USER : null),
    ...overrides,
  };
  return { deps, applied, linked };
}

describe('aviso de Stripe', () => {
  const send = (body: string, header: string | null, deps: PaymentDeps, method = 'POST') =>
    handleStripeWebhook(
      new Request('https://f.supabase.co/functions/v1/payment-webhook-stripe', {
        method,
        headers: header ? { 'stripe-signature': header } : {},
        ...(method === 'POST' ? { body } : {}),
      }),
      deps,
    );

  it('con firma buena aplica el aviso y contesta lo que dijo la base', async () => {
    const { deps, applied } = paymentDeps();
    const body = JSON.stringify(sessionEvent());
    const reply = await send(body, stripeHeader(body), deps);
    expect(reply.status).toBe(200);
    expect(await reply.text()).toBe('applied');
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ userId: USER, plan: 'monthly' });
  });

  it('un aviso repetido se contesta 200 con lo que diga la base', async () => {
    const { deps } = paymentDeps({ applyNotice: () => Promise.resolve('duplicate') });
    const body = JSON.stringify(sessionEvent());
    const reply = await send(body, stripeHeader(body), deps);
    expect(reply.status).toBe(200);
    expect(await reply.text()).toBe('duplicate');
  });

  it('sin firma, con otra firma o con el cuerpo cambiado contesta 401 y no toca la base', async () => {
    const { deps, applied } = paymentDeps();
    const body = JSON.stringify(sessionEvent());
    expect((await send(body, null, deps)).status).toBe(401);
    expect((await send(body, stripeHeader(body, { secret: 'otro' }), deps)).status).toBe(401);
    expect((await send(body.replace('150', '1'), stripeHeader(body), deps)).status).toBe(401);
    expect(applied).toHaveLength(0);
  });

  it('un cuerpo que no es JSON, aunque venga firmado, contesta 400', async () => {
    const { deps, applied } = paymentDeps();
    expect((await send('no es json', stripeHeader('no es json'), deps)).status).toBe(400);
    expect(applied).toHaveLength(0);
  });

  it('un evento que no se entiende contesta 200 sin aplicar nada', async () => {
    const { deps, applied } = paymentDeps();
    const body = JSON.stringify({ id: 'e', type: 'customer.created', data: { object: {} } });
    const reply = await send(body, stripeHeader(body), deps);
    expect(reply.status).toBe(200);
    expect(applied).toHaveLength(0);
  });

  it('si la base falla contesta 500 para que Stripe lo reintente', async () => {
    const { deps } = paymentDeps({ applyNotice: () => Promise.reject(new Error('caída')) });
    const body = JSON.stringify(sessionEvent());
    expect((await send(body, stripeHeader(body), deps)).status).toBe(500);
  });

  it('sin secreto configurado contesta 503 y con otro método 405', async () => {
    const { deps } = paymentDeps({ env: { ...env, STRIPE_WEBHOOK_SECRET: undefined } });
    expect((await send('{}', null, deps)).status).toBe(503);
    expect((await send('{}', null, paymentDeps().deps, 'GET')).status).toBe(405);
  });
});

describe('aviso de Stripe con cliente y reembolso', () => {
  const send = (body: string, deps: PaymentDeps) =>
    handleStripeWebhook(
      new Request('https://f.supabase.co/functions/v1/payment-webhook-stripe', {
        method: 'POST',
        headers: { 'stripe-signature': stripeHeader(body) },
        body,
      }),
      deps,
    );

  it('un pago liga al alumno con su cliente antes de aplicarse', async () => {
    const order: string[] = [];
    const { deps } = paymentDeps({
      linkCustomer: () => {
        order.push('liga');
        return Promise.resolve();
      },
      applyNotice: () => {
        order.push('aplica');
        return Promise.resolve('applied');
      },
    });
    const reply = await send(JSON.stringify(sessionEvent()), deps);
    expect(reply.status).toBe(200);
    expect(order).toEqual(['liga', 'aplica']);
  });

  it('manda el alumno y el cliente a la base', async () => {
    const { deps, linked } = paymentDeps();
    await send(JSON.stringify(sessionEvent()), deps);
    expect(linked).toEqual([{ userId: USER, customerId: 'cus_1' }]);
  });

  it('si no se puede ligar contesta 500 para que Stripe reintente y no aplica el aviso', async () => {
    const { deps, applied } = paymentDeps({
      linkCustomer: () => Promise.reject(new Error('caída')),
    });
    expect((await send(JSON.stringify(sessionEvent()), deps)).status).toBe(500);
    expect(applied).toHaveLength(0);
  });

  it('un reembolso completo se aplica al alumno de ese cliente, sin id de pago', async () => {
    const { deps, applied } = paymentDeps();
    const reply = await send(JSON.stringify(refundEvent()), deps);
    expect(reply.status).toBe(200);
    expect(applied).toEqual([
      expect.objectContaining({
        provider: 'stripe',
        eventId: 'evt_reembolso',
        kind: 'refunded',
        userId: USER,
        providerPaymentId: null,
        amountMxn: 150,
      }),
    ]);
  });

  it('un reembolso de un cliente que no conocemos se asienta sin alumno, para que alguien lo vea', async () => {
    const { deps, applied } = paymentDeps();
    await send(JSON.stringify(refundEvent({ customer: 'cus_desconocido' })), deps);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ kind: 'refunded', userId: null });
  });

  it('un reembolso parcial se ignora con 200 y no toca la base', async () => {
    const { deps, applied } = paymentDeps();
    const reply = await send(
      JSON.stringify(refundEvent({ refunded: false, amount_refunded: 5000 })),
      deps,
    );
    expect(reply.status).toBe(200);
    expect(applied).toHaveLength(0);
  });

  it('si la base falla al buscar al alumno contesta 500', async () => {
    const { deps } = paymentDeps({ userOfCustomer: () => Promise.reject(new Error('caída')) });
    expect((await send(JSON.stringify(refundEvent()), deps)).status).toBe(500);
  });
});

describe('aviso de Mercado Pago', () => {
  const send = (
    options: {
      query?: string;
      body?: unknown;
      signature?: string | null;
      requestId?: string | null;
    },
    deps: PaymentDeps,
    method = 'POST',
  ) =>
    handleMercadoPagoWebhook(
      new Request(
        `https://f.supabase.co/functions/v1/payment-webhook-mercadopago${options.query ?? ''}`,
        {
          method,
          headers: {
            ...(options.signature ? { 'x-signature': options.signature } : {}),
            ...(options.requestId ? { 'x-request-id': options.requestId } : {}),
          },
          ...(method === 'POST' ? { body: JSON.stringify(options.body ?? {}) } : {}),
        },
      ),
      deps,
    );

  const approved = {
    id: 777,
    status: 'approved',
    external_reference: `${USER}|monthly`,
    transaction_amount: 150,
    currency_id: 'MXN',
  };
  const calls: { url: string; auth: string | null }[] = [];
  const mpFetch = (payment: unknown, ok = true): typeof fetch =>
    ((url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
      return Promise.resolve(new Response(JSON.stringify(payment), { status: ok ? 200 : 500 }));
    }) as typeof fetch;

  it('con firma buena consulta el pago con el token del servidor y lo aplica', async () => {
    calls.length = 0;
    const { deps, applied } = paymentDeps({ fetch: mpFetch(approved) });
    const reply = await send(
      {
        query: '?data.id=777&type=payment',
        signature: mpHeader({ dataId: '777', requestId: 'r1' }),
        requestId: 'r1',
      },
      deps,
    );
    expect(reply.status).toBe(200);
    expect(calls).toEqual([
      { url: 'https://api.mercadopago.com/v1/payments/777', auth: 'Bearer token-de-prueba-mp' },
    ]);
    expect(applied[0]).toMatchObject({
      eventId: '777:approved',
      userId: USER,
      plan: 'monthly',
      amountMxn: 150,
    });
  });

  it('el id también puede venir en el cuerpo', async () => {
    const { deps, applied } = paymentDeps({ fetch: mpFetch(approved) });
    const reply = await send(
      {
        body: { type: 'payment', data: { id: '777' } },
        signature: mpHeader({ dataId: '777', requestId: 'r1' }),
        requestId: 'r1',
      },
      deps,
    );
    expect(reply.status).toBe(200);
    expect(applied).toHaveLength(1);
  });

  it('sin firma o con una mala contesta 401 y no consulta nada', async () => {
    const { deps, applied } = paymentDeps({
      fetch: () => Promise.reject(new Error('no debía consultar')),
    });
    expect((await send({ query: '?data.id=777&type=payment', requestId: 'r1' }, deps)).status).toBe(
      401,
    );
    expect(
      (
        await send(
          {
            query: '?data.id=777&type=payment',
            signature: mpHeader({ dataId: '777', requestId: 'r1', secret: 'otro' }),
            requestId: 'r1',
          },
          deps,
        )
      ).status,
    ).toBe(401);
    // Firmada para otro id
    expect(
      (
        await send(
          {
            query: '?data.id=888&type=payment',
            signature: mpHeader({ dataId: '777', requestId: 'r1' }),
            requestId: 'r1',
          },
          deps,
        )
      ).status,
    ).toBe(401);
    expect(applied).toHaveLength(0);
  });

  it('otros tipos de notificación y ids raros se ignoran con 200', async () => {
    const { deps, applied } = paymentDeps({
      fetch: () => Promise.reject(new Error('no debía consultar')),
    });
    const sign = (id: string) => mpHeader({ dataId: id, requestId: 'r1' });
    expect(
      (
        await send(
          { query: '?data.id=777&type=merchant_order', signature: sign('777'), requestId: 'r1' },
          deps,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          { query: '?data.id=../x&type=payment', signature: sign('../x'), requestId: 'r1' },
          deps,
        )
      ).status,
    ).toBe(200);
    expect(applied).toHaveLength(0);
  });

  it('si no se puede consultar el pago contesta 502 para que lo reintente', async () => {
    const { deps } = paymentDeps({ fetch: mpFetch({}, false) });
    const reply = await send(
      {
        query: '?data.id=777&type=payment',
        signature: mpHeader({ dataId: '777', requestId: 'r1' }),
        requestId: 'r1',
      },
      deps,
    );
    expect(reply.status).toBe(502);
    const { deps: broken } = paymentDeps({ fetch: () => Promise.reject(new Error('red')) });
    expect(
      (
        await send(
          {
            query: '?data.id=777&type=payment',
            signature: mpHeader({ dataId: '777', requestId: 'r1' }),
            requestId: 'r1',
          },
          broken,
        )
      ).status,
    ).toBe(502);
  });

  it('un pago pendiente se ignora y si la base falla contesta 500', async () => {
    const { deps, applied } = paymentDeps({ fetch: mpFetch({ ...approved, status: 'pending' }) });
    const args = {
      query: '?data.id=777&type=payment',
      signature: mpHeader({ dataId: '777', requestId: 'r1' }),
      requestId: 'r1',
    };
    expect((await send(args, deps)).status).toBe(200);
    expect(applied).toHaveLength(0);
    const { deps: failing } = paymentDeps({
      fetch: mpFetch(approved),
      applyNotice: () => Promise.reject(new Error('caída')),
    });
    expect((await send(args, failing)).status).toBe(500);
  });

  it('sin configurar contesta 503 y con otro método 405', async () => {
    expect(
      (await send({}, paymentDeps({ env: { ...env, MERCADOPAGO_ACCESS_TOKEN: undefined } }).deps))
        .status,
    ).toBe(503);
    expect((await send({}, paymentDeps().deps, 'GET')).status).toBe(405);
  });
});

describe('crear el pago', () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  function checkoutDeps(overrides: Partial<CheckoutDeps> = {}): CheckoutDeps {
    return {
      env,
      now: () => NOW,
      fetch: ((url: string, init?: RequestInit) => {
        sent.push({ url, init });
        return Promise.resolve(
          new Response(
            JSON.stringify(
              url.includes('stripe')
                ? { url: 'https://checkout.stripe.com/c/pay/cs_test_1' }
                : { init_point: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1' },
            ),
          ),
        );
      }) as typeof fetch,
      authenticate: () => Promise.resolve({ id: USER, email: 'alumna@ejemplo.mx' }),
      founderSeatsLeft: () => Promise.resolve(10),
      customerOf: () => Promise.resolve(null),
      ...overrides,
    };
  }
  const ask = (body: unknown, deps: CheckoutDeps, init: RequestInit = {}) =>
    handleCreateCheckout(
      new Request('https://f.supabase.co/functions/v1/create-checkout', {
        method: 'POST',
        headers: { authorization: 'Bearer token', origin: 'https://app.ejemplo.mx' },
        body: JSON.stringify(body),
        ...init,
      }),
      deps,
    );

  it('crea la sesión de Stripe con el usuario, el plan y las direcciones de regreso del servidor', async () => {
    sent.length = 0;
    const reply = await ask({ plan: 'monthly', provider: 'stripe' }, checkoutDeps());
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    expect(sent[0]?.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const headers = new Headers(sent[0]?.init?.headers);
    expect(headers.get('authorization')).toBe('Bearer llave-de-prueba-stripe');
    const form = new URLSearchParams(bodyText(sent[0]?.init));
    expect(Object.fromEntries(form)).toMatchObject({
      mode: 'subscription',
      'line_items[0][price]': 'price_mensual',
      'line_items[0][quantity]': '1',
      client_reference_id: USER,
      'metadata[user_id]': USER,
      'metadata[plan]': 'monthly',
      'subscription_data[metadata][user_id]': USER,
      'subscription_data[metadata][plan]': 'monthly',
      customer_email: 'alumna@ejemplo.mx',
      locale: 'es-419',
      success_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=ok',
      cancel_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=cancelado',
    });
  });

  it('sin activar Stripe Tax no pide impuesto ni dirección', async () => {
    sent.length = 0;
    await ask({ plan: 'monthly', provider: 'stripe' }, checkoutDeps());
    const form = new URLSearchParams(bodyText(sent[0]?.init));
    expect(form.has('automatic_tax[enabled]')).toBe(false);
    expect(form.has('billing_address_collection')).toBe(false);
    expect(form.has('tax_id_collection[enabled]')).toBe(false);
  });

  it('con Stripe Tax activado calcula el impuesto y pide la dirección y el RFC si lo quieren', async () => {
    sent.length = 0;
    await ask(
      { plan: 'monthly', provider: 'stripe' },
      checkoutDeps({ env: { ...env, STRIPE_AUTOMATIC_TAX: 'true' } }),
    );
    const form = new URLSearchParams(bodyText(sent[0]?.init));
    expect(form.get('automatic_tax[enabled]')).toBe('true');
    expect(form.get('billing_address_collection')).toBe('required');
    expect(form.get('tax_id_collection[enabled]')).toBe('true');
    // Cliente nuevo por correo. Sin cliente guardado no hay a quién actualizar
    expect(form.has('customer_update[address]')).toBe(false);
  });

  it('con Stripe Tax y un cliente que ya existe deja que Stripe actualice su dirección y su nombre', async () => {
    sent.length = 0;
    await ask(
      { plan: 'monthly', provider: 'stripe' },
      checkoutDeps({
        env: { ...env, STRIPE_AUTOMATIC_TAX: 'true' },
        customerOf: () => Promise.resolve('cus_1'),
      }),
    );
    const form = new URLSearchParams(bodyText(sent[0]?.init));
    expect(form.get('customer')).toBe('cus_1');
    expect(form.get('customer_update[address]')).toBe('auto');
    expect(form.get('customer_update[name]')).toBe('auto');
  });

  it('Stripe Tax solo se activa con la palabra true y no con cualquier valor', async () => {
    for (const value of ['1', 'si', 'TRUE', 'false', '']) {
      sent.length = 0;
      await ask(
        { plan: 'monthly', provider: 'stripe' },
        checkoutDeps({ env: { ...env, STRIPE_AUTOMATIC_TAX: value } }),
      );
      const form = new URLSearchParams(bodyText(sent[0]?.init));
      expect(form.has('automatic_tax[enabled]'), value).toBe(false);
    }
  });

  it('quien ya pagó vuelve a su mismo cliente de Stripe y no manda el correo', async () => {
    sent.length = 0;
    await ask(
      { plan: 'monthly', provider: 'stripe' },
      checkoutDeps({ customerOf: () => Promise.resolve('cus_1') }),
    );
    const form = new URLSearchParams(bodyText(sent[0]?.init));
    expect(form.get('customer')).toBe('cus_1');
    expect(form.has('customer_email')).toBe(false);
    expect(form.get('client_reference_id')).toBe(USER);
  });

  it('quien no ha pagado entra con su correo para que Stripe cree su cliente', async () => {
    sent.length = 0;
    await ask({ plan: 'monthly', provider: 'stripe' }, checkoutDeps());
    const form = new URLSearchParams(bodyText(sent[0]?.init));
    expect(form.has('customer')).toBe(false);
    expect(form.get('customer_email')).toBe('alumna@ejemplo.mx');
  });

  it('si el cliente guardado ya no existe en Stripe reintenta como alumno nuevo', async () => {
    sent.length = 0;
    let calls = 0;
    const reply = await ask(
      { plan: 'monthly', provider: 'stripe' },
      checkoutDeps({
        customerOf: () => Promise.resolve('cus_borrado'),
        fetch: ((url: string, init?: RequestInit) => {
          sent.push({ url, init });
          calls += 1;
          return Promise.resolve(
            calls === 1
              ? new Response(JSON.stringify({ error: { message: 'No such customer' } }), {
                  status: 400,
                })
              : new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_2' })),
          );
        }) as typeof fetch,
      }),
    );
    expect(reply.status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(new URLSearchParams(bodyText(sent[0]?.init)).get('customer')).toBe('cus_borrado');
    const retry = new URLSearchParams(bodyText(sent[1]?.init));
    expect(retry.has('customer')).toBe(false);
    expect(retry.get('customer_email')).toBe('alumna@ejemplo.mx');
  });

  it('si Stripe rechaza también sin cliente contesta 502, y si la base falla al buscar el cliente sigue sin él', async () => {
    const failing = (() =>
      Promise.resolve(new Response('{}', { status: 400 }))) as unknown as typeof fetch;
    expect(
      (
        await ask(
          { plan: 'monthly', provider: 'stripe' },
          checkoutDeps({ customerOf: () => Promise.resolve('cus_1'), fetch: failing }),
        )
      ).status,
    ).toBe(502);
    sent.length = 0;
    const reply = await ask(
      { plan: 'monthly', provider: 'stripe' },
      checkoutDeps({ customerOf: () => Promise.reject(new Error('caída')) }),
    );
    expect(reply.status).toBe(200);
    expect(new URLSearchParams(bodyText(sent[0]?.init)).has('customer')).toBe(false);
  });

  it('cada plan usa su precio de Stripe', async () => {
    for (const [plan, price] of [
      ['founder', 'price_fundador'],
      ['annual', 'price_anual'],
    ] as const) {
      sent.length = 0;
      await ask({ plan, provider: 'stripe' }, checkoutDeps());
      expect(new URLSearchParams(bodyText(sent[0]?.init)).get('line_items[0][price]')).toBe(price);
    }
  });

  it('crea la preferencia de Mercado Pago con el precio del plan y la referencia del usuario', async () => {
    sent.length = 0;
    const reply = await ask({ plan: 'founder', provider: 'mercadopago' }, checkoutDeps());
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      url: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1',
    });
    expect(sent[0]?.url).toBe('https://api.mercadopago.com/checkout/preferences');
    const preference = JSON.parse(bodyText(sent[0]?.init)) as Record<string, unknown>;
    expect(preference).toMatchObject({
      external_reference: `${USER}|founder`,
      auto_return: 'approved',
      notification_url: 'https://proyecto.supabase.co/functions/v1/payment-webhook-mercadopago',
      items: [{ id: 'founder', quantity: 1, currency_id: 'MXN', unit_price: 79 }],
    });
  });

  it('sin sesión contesta 401 y no llama al procesador', async () => {
    sent.length = 0;
    const reply = await ask(
      { plan: 'monthly', provider: 'stripe' },
      checkoutDeps({ authenticate: () => Promise.resolve(null) }),
    );
    expect(reply.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('un plan o un procesador que no existen se rechazan', async () => {
    for (const body of [
      { plan: 'free', provider: 'stripe' },
      { plan: 'monthly', provider: 'paypal' },
      { plan: 'monthly' },
      {},
    ]) {
      expect((await ask(body, checkoutDeps())).status).toBe(400);
    }
    const bad = await handleCreateCheckout(
      new Request('https://f.supabase.co/functions/v1/create-checkout', {
        method: 'POST',
        body: 'no es json',
      }),
      checkoutDeps(),
    );
    expect(bad.status).toBe(400);
  });

  it('con el cupo de Fundador lleno contesta 409', async () => {
    sent.length = 0;
    const reply = await ask(
      { plan: 'founder', provider: 'stripe' },
      checkoutDeps({ founderSeatsLeft: () => Promise.resolve(0) }),
    );
    expect(reply.status).toBe(409);
    expect(await reply.json()).toEqual({ error: 'founder_full' });
    expect(sent).toHaveLength(0);
    // Si no se pudo saber, decide el servidor al cobrar
    expect(
      (
        await ask(
          { plan: 'founder', provider: 'stripe' },
          checkoutDeps({ founderSeatsLeft: () => Promise.resolve(null) }),
        )
      ).status,
    ).toBe(200);
  });

  it('sin llaves o sin dirección de la app contesta 503', async () => {
    expect(
      (
        await ask(
          { plan: 'monthly', provider: 'stripe' },
          checkoutDeps({ env: { ...env, STRIPE_SECRET_KEY: undefined } }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await ask(
          { plan: 'monthly', provider: 'stripe' },
          checkoutDeps({ env: { ...env, STRIPE_PRICE_MONTHLY: undefined } }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await ask(
          { plan: 'monthly', provider: 'mercadopago' },
          checkoutDeps({ env: { ...env, MERCADOPAGO_ACCESS_TOKEN: undefined } }),
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await ask(
          { plan: 'monthly', provider: 'stripe' },
          checkoutDeps({ env: { ...env, APP_URL: undefined } }),
        )
      ).status,
    ).toBe(503);
  });

  it('si el procesador falla contesta 502', async () => {
    const failing = checkoutDeps({
      fetch: () => Promise.resolve(new Response('{}', { status: 500 })),
    });
    expect((await ask({ plan: 'monthly', provider: 'stripe' }, failing)).status).toBe(502);
    expect((await ask({ plan: 'monthly', provider: 'mercadopago' }, failing)).status).toBe(502);
    const empty = checkoutDeps({
      fetch: () => Promise.resolve(new Response('{}')),
    });
    expect((await ask({ plan: 'monthly', provider: 'stripe' }, empty)).status).toBe(502);
    const broken = checkoutDeps({
      fetch: () => Promise.reject(new Error('red')),
    });
    expect((await ask({ plan: 'monthly', provider: 'stripe' }, broken)).status).toBe(502);
  });

  it('solo la página de la app puede llamar desde el navegador', async () => {
    const ok = await ask({ plan: 'monthly', provider: 'stripe' }, checkoutDeps());
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.ejemplo.mx');
    const foreign = await handleCreateCheckout(
      new Request('https://f.supabase.co/functions/v1/create-checkout', {
        method: 'POST',
        headers: { authorization: 'Bearer token', origin: 'https://malo.example' },
        body: JSON.stringify({ plan: 'monthly', provider: 'stripe' }),
      }),
      checkoutDeps(),
    );
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
    expect(
      corsHeaders({ APP_URL: 'no es una url' }, 'https://app.ejemplo.mx')[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
    expect(corsHeaders({}, null)['access-control-allow-origin']).toBeUndefined();
  });

  it('contesta la consulta previa del navegador y rechaza otros métodos', async () => {
    const preflight = await handleCreateCheckout(
      new Request('https://f.supabase.co/functions/v1/create-checkout', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.ejemplo.mx' },
      }),
      checkoutDeps(),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://app.ejemplo.mx');
    const get = await handleCreateCheckout(
      new Request('https://f.supabase.co/functions/v1/create-checkout'),
      checkoutDeps(),
    );
    expect(get.status).toBe(405);
  });
});

describe('portal de facturación', () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  const logs: string[] = [];
  function portalDeps(overrides: Partial<PortalDeps> = {}): PortalDeps {
    return {
      env,
      now: () => NOW,
      fetch: ((url: string, init?: RequestInit) => {
        sent.push({ url, init });
        return Promise.resolve(
          new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session/test_1' })),
        );
      }) as typeof fetch,
      authenticate: () => Promise.resolve({ id: USER, email: 'alumna@ejemplo.mx' }),
      customerOf: () => Promise.resolve('cus_1'),
      log: (line) => {
        logs.push(line);
      },
      ...overrides,
    };
  }
  const ask = (deps: PortalDeps, init: RequestInit = {}) =>
    handleCreatePortal(
      new Request('https://f.supabase.co/functions/v1/create-portal-session', {
        method: 'POST',
        headers: { authorization: 'Bearer token', origin: 'https://app.ejemplo.mx' },
        body: '{}',
        ...init,
      }),
      deps,
    );

  it('abre el portal del cliente del alumno y vuelve a Suscripción', async () => {
    sent.length = 0;
    const reply = await ask(portalDeps());
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({ url: 'https://billing.stripe.com/p/session/test_1' });
    expect(sent[0]?.url).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(new Headers(sent[0]?.init?.headers).get('authorization')).toBe(
      'Bearer llave-de-prueba-stripe',
    );
    expect(Object.fromEntries(new URLSearchParams(bodyText(sent[0]?.init)))).toEqual({
      customer: 'cus_1',
      return_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion',
    });
  });

  it('el cliente sale del servidor y no de lo que mande el navegador', async () => {
    sent.length = 0;
    await ask(portalDeps(), { body: JSON.stringify({ customer: 'cus_de_otra_persona' }) });
    expect(new URLSearchParams(bodyText(sent[0]?.init)).get('customer')).toBe('cus_1');
  });

  it('sin sesión contesta 401 y no llama a Stripe', async () => {
    sent.length = 0;
    const reply = await ask(portalDeps({ authenticate: () => Promise.resolve(null) }));
    expect(reply.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('quien nunca pagó con Stripe recibe 404 no_customer', async () => {
    sent.length = 0;
    const reply = await ask(portalDeps({ customerOf: () => Promise.resolve(null) }));
    expect(reply.status).toBe(404);
    expect(await reply.json()).toEqual({ error: 'no_customer' });
    expect(sent).toHaveLength(0);
  });

  it('sin llave de Stripe o sin dirección de la app contesta 503', async () => {
    expect((await ask(portalDeps({ env: { ...env, STRIPE_SECRET_KEY: undefined } }))).status).toBe(
      503,
    );
    expect((await ask(portalDeps({ env: { ...env, APP_URL: undefined } }))).status).toBe(503);
  });

  it('si Stripe lo rechaza contesta 502 y deja constancia sin llaves', async () => {
    logs.length = 0;
    const reply = await ask(
      portalDeps({
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  type: 'invalid_request_error',
                  message: 'Falta guardar la configuración del portal',
                },
              }),
              { status: 400 },
            ),
          ),
      }),
    );
    expect(reply.status).toBe(502);
    expect(logs.join(' ')).toContain('invalid_request_error');
    expect(logs.join(' ')).toContain('400');
    expect(logs.join(' ')).not.toContain('llave-de-prueba-stripe');
  });

  it('si la base o la red fallan contesta 502', async () => {
    expect(
      (await ask(portalDeps({ customerOf: () => Promise.reject(new Error('caída')) }))).status,
    ).toBe(502);
    expect((await ask(portalDeps({ fetch: () => Promise.reject(new Error('red')) }))).status).toBe(
      502,
    );
  });

  it('una respuesta sin dirección contesta 502', async () => {
    const reply = await ask(portalDeps({ fetch: () => Promise.resolve(new Response('{}')) }));
    expect(reply.status).toBe(502);
  });

  it('solo la página de la app puede llamar desde el navegador, y contesta la consulta previa', async () => {
    const good = await ask(portalDeps());
    expect(good.headers.get('access-control-allow-origin')).toBe('https://app.ejemplo.mx');
    const other = await ask(portalDeps(), {
      headers: { authorization: 'Bearer t', origin: 'https://malo.mx' },
    });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect((await ask(portalDeps(), { method: 'OPTIONS', body: undefined })).status).toBe(204);
    expect((await ask(portalDeps(), { method: 'GET', body: undefined })).status).toBe(405);
  });
});

describe('precios', () => {
  it('coinciden con los de la app, para que no se desfasen', () => {
    expect(PLAN_PRICES_MXN.founder).toBe(PLANS.founder.priceMxn);
    expect(PLAN_PRICES_MXN.monthly).toBe(PLANS.monthly.priceMxn);
    expect(PLAN_PRICES_MXN.annual).toBe(PLANS.annual.priceMxn);
  });
});
