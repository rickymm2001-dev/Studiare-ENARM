import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  CheckoutContext,
  FunctionEnv,
  MercadoPagoWebhookDeps,
  PaymentNotice,
} from './billingTypes.ts';
import {
  createMercadoPagoCheckout,
  handleMercadoPagoWebhook,
  noticeFromMercadoPagoPayment,
  parseExternalReference,
  verifyMercadoPagoSignature,
} from './mercadopago.ts';

const USER = '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f';
const NOW = Date.parse('2026-10-08T16:00:00.000Z');
const MP_SECRET = 'secreto-de-prueba-mp';

const env: FunctionEnv = {
  MERCADOPAGO_ACCESS_TOKEN: 'token-de-prueba-mp',
  MERCADOPAGO_WEBHOOK_SECRET: MP_SECRET,
  APP_URL: 'https://app.ejemplo.mx/Studiare-ENARM/',
  FUNCTIONS_URL: 'https://proyecto.supabase.co/functions/v1/',
};

/** El cuerpo de una petición que mandó el código bajo prueba, siempre un texto */
const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

const hmac = (secret: string, message: string) =>
  createHmac('sha256', secret).update(message).digest('hex');

function mpHeader(options: { dataId?: string; requestId?: string; ts?: number; secret?: string }) {
  const ts = options.ts ?? NOW;
  let manifest = '';
  if (options.dataId) manifest += `id:${options.dataId.toLowerCase()};`;
  if (options.requestId) manifest += `request-id:${options.requestId};`;
  manifest += `ts:${ts};`;
  return `ts=${ts},v1=${hmac(options.secret ?? MP_SECRET, manifest)}`;
}

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

function paymentDeps(overrides: Partial<MercadoPagoWebhookDeps> = {}) {
  const applied: PaymentNotice[] = [];
  const deps: MercadoPagoWebhookDeps = {
    env,
    fetch: () => Promise.reject(new Error('no debía llamar a fetch')),
    now: () => NOW,
    log: () => undefined,
    applyNotice: (notice) => {
      applied.push(notice);
      return Promise.resolve('applied');
    },
    applyCharge: () => Promise.reject(new Error('todavía no se usa')),
    applySubscriptionState: () => Promise.reject(new Error('todavía no se usa')),
    ...overrides,
  };
  return { deps, applied };
}

describe('aviso de Mercado Pago', () => {
  const send = (
    options: {
      query?: string;
      body?: unknown;
      signature?: string | null;
      requestId?: string | null;
    },
    deps: MercadoPagoWebhookDeps,
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

const context: CheckoutContext = {
  inForce: null,
  subscription: null,
  passEnd: null,
  trialAvailable: false,
  trialDays: 7,
  founderOpen: true,
  founderSeatsLeft: 10,
  founderLost: false,
  oxxoExpiresDays: 3,
  customerId: null,
};

describe('crear el pago de Mercado Pago', () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  const lines: string[] = [];
  const create = (overrides: Partial<Parameters<typeof createMercadoPagoCheckout>[0]> = {}) =>
    createMercadoPagoCheckout({
      user: { id: USER, email: 'alumna@ejemplo.mx' },
      plan: 'annual',
      mode: 'pass',
      context,
      env,
      fetch: ((url: string, init?: RequestInit) => {
        sent.push({ url, init });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              init_point: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1',
            }),
          ),
        );
      }) as typeof fetch,
      log: (line) => lines.push(line),
      ...overrides,
    });

  it('crea la preferencia con el precio, la referencia del alumno y las direcciones de regreso', async () => {
    sent.length = 0;
    expect(await create()).toEqual({
      ok: true,
      url: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1',
    });
    expect(sent[0]?.url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(new Headers(sent[0]?.init?.headers).get('authorization')).toBe(
      'Bearer token-de-prueba-mp',
    );
    expect(JSON.parse(bodyText(sent[0]?.init))).toMatchObject({
      external_reference: `${USER}|annual`,
      items: [{ id: 'annual', quantity: 1, currency_id: 'MXN', unit_price: 1499 }],
      back_urls: {
        success: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=ok',
        failure: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=cancelado',
      },
      notification_url: 'https://proyecto.supabase.co/functions/v1/payment-webhook-mercadopago',
    });
  });

  it('en modo prueba usa la dirección de sandbox si no hay otra', async () => {
    const reply = await create({
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ sandbox_init_point: 'https://sandbox.mercadopago.com.mx/x' }),
          ),
        ),
    });
    expect(reply).toEqual({ ok: true, url: 'https://sandbox.mercadopago.com.mx/x' });
  });

  it('sin token o sin dirección de la app no está configurado', async () => {
    expect(await create({ env: { ...env, MERCADOPAGO_ACCESS_TOKEN: undefined } })).toEqual({
      ok: false,
      error: 'not_configured',
    });
    expect(await create({ env: { ...env, APP_URL: undefined } })).toEqual({
      ok: false,
      error: 'not_configured',
    });
  });

  it('si Mercado Pago rechaza, no responde la dirección o no hay red, falla con provider y lo deja en el registro', async () => {
    lines.length = 0;
    expect(
      await create({ fetch: () => Promise.resolve(new Response('{}', { status: 500 })) }),
    ).toEqual({ ok: false, error: 'provider' });
    expect(await create({ fetch: () => Promise.resolve(new Response('{}')) })).toEqual({
      ok: false,
      error: 'provider',
    });
    expect(await create({ fetch: () => Promise.reject(new TypeError('red')) })).toEqual({
      ok: false,
      error: 'provider',
    });
    expect(lines).toEqual([
      'Mercado Pago rechazó el pago del plan annual. estado 500',
      'No se pudo crear el pago del plan annual con mercadopago. TypeError',
    ]);
    expect(lines.join(' ')).not.toContain('token-de-prueba-mp');
  });
});
