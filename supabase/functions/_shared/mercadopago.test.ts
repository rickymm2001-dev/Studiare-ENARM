import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  BillingAction,
  CancelSubscriptionDeps,
  ChargeNotice,
  CheckoutContext,
  CheckoutSubscription,
  FunctionEnv,
  MercadoPagoWebhookDeps,
  SubscriptionNotice,
} from './billingTypes.ts';
import {
  addMonths,
  cancelMercadoPagoSubscription,
  chargeNoticeFromAuthorizedPayment,
  chargeNoticeFromPayment,
  createMercadoPagoCheckout,
  externalReferenceFor,
  handleCancelSubscription,
  handleMercadoPagoWebhook,
  parseExternalReference,
  signatureTimeMs,
  subscriptionNoticeFromPreapproval,
  verifyMercadoPagoSignature,
  type MercadoPagoActionDeps,
} from './mercadopago.ts';

const USER = '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f';
const NOW = Date.parse('2026-10-08T16:00:00.000Z');
const MP_SECRET = 'secreto-de-prueba-mp';
const TOKEN = 'token-de-prueba-mp';
const PREAPPROVAL_ID = '2c938084726fca480172750000000000';
const API = 'https://api.mercadopago.com';

const env: FunctionEnv = {
  MERCADOPAGO_ACCESS_TOKEN: TOKEN,
  MERCADOPAGO_WEBHOOK_SECRET: MP_SECRET,
  APP_URL: 'https://app.ejemplo.mx/Studiare-ENARM/',
  FUNCTIONS_URL: 'https://proyecto.supabase.co/functions/v1/',
};

/** El cuerpo de una petición que mandó el código bajo prueba, siempre un texto */
const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

const hmac = (secret: string, message: string) =>
  createHmac('sha256', secret).update(message).digest('hex');

/** Un encabezado x-signature como lo arma Mercado Pago. ts va tal cual en el mensaje firmado */
function mpHeader(options: {
  dataId?: string;
  requestId?: string;
  ts?: number | string;
  secret?: string;
}) {
  const ts = String(options.ts ?? NOW);
  let manifest = '';
  if (options.dataId) manifest += `id:${options.dataId};`;
  if (options.requestId) manifest += `request-id:${options.requestId};`;
  manifest += `ts:${ts};`;
  return `ts=${ts},v1=${hmac(options.secret ?? MP_SECRET, manifest)}`;
}

// ---------------------------------------------------------------------------------------------
// Una API de Mercado Pago de mentira. Cada ruta responde un objeto, un estado de error o un fallo de red

type Route = Record<string, unknown> | number | Error;

interface MpCall {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

function fakeMercadoPago(routes: Record<string, Route>) {
  const calls: MpCall[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const path = url.replace(API, '');
    const text = bodyText(init);
    calls.push({
      method,
      path,
      auth: new Headers(init?.headers).get('authorization'),
      body: text === '' ? null : (JSON.parse(text) as unknown),
    });
    const route = routes[`${method} ${path}`];
    if (route === undefined) return Promise.resolve(new Response('{}', { status: 404 }));
    if (route instanceof Error) return Promise.reject(route);
    if (typeof route === 'number') return Promise.resolve(new Response('{}', { status: route }));
    return Promise.resolve(new Response(JSON.stringify(route)));
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

// Recursos como los describen los tipos del SDK oficial (mercadopago 3.6.1)

const passPayment = (overrides: Record<string, unknown> = {}) => ({
  id: 12345,
  status: 'approved',
  status_detail: 'accredited',
  external_reference: `${USER}|monthly`,
  metadata: { user_id: USER, plan: 'monthly', mode: 'pass' },
  transaction_amount: 149,
  currency_id: 'MXN',
  payment_type_id: 'credit_card',
  date_created: '2026-10-08T11:59:00.000-04:00',
  date_approved: '2026-10-08T12:00:00.000-04:00',
  payer: { email: 'alumna@ejemplo.mx', identification: { type: 'RFC', number: 'XAXX010101000' } },
  card: { last_four_digits: '0366', cardholder: { name: 'APRO' } },
  additional_info: { payer: { first_name: 'Alumna' } },
  ...overrides,
});

const subscriptionPayment = (overrides: Record<string, unknown> = {}) => ({
  id: 1325961474,
  status: 'approved',
  status_detail: 'accredited',
  operation_type: 'recurring_payment',
  external_reference: `${USER}|monthly|sub`,
  transaction_amount: 149,
  currency_id: 'MXN',
  payment_type_id: 'credit_card',
  date_created: '2026-10-08T12:00:01.000-04:00',
  date_approved: '2026-10-08T12:00:05.000-04:00',
  point_of_interaction: {
    type: 'SUBSCRIPTIONS',
    transaction_data: {
      subscription_id: PREAPPROVAL_ID,
      billing_date: '2026-10-08T12:00:00.000-04:00',
      subscription_sequence: { number: 1, total: null },
    },
  },
  ...overrides,
});

const preapproval = (overrides: Record<string, unknown> = {}) => ({
  id: PREAPPROVAL_ID,
  status: 'authorized',
  reason: 'Studiare. Plan mensual',
  external_reference: `${USER}|monthly|sub`,
  payer_id: 98765,
  payer_email: 'alumna@ejemplo.mx',
  date_created: '2026-10-08T11:58:00.000-04:00',
  last_modified: '2026-10-08T11:59:00.000-04:00',
  next_payment_date: '2026-11-08T11:58:00.000-04:00',
  auto_recurring: {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: 149,
    currency_id: 'MXN',
  },
  ...overrides,
});

const authorizedPayment = (overrides: Record<string, unknown> = {}) => ({
  id: 6114264375,
  preapproval_id: PREAPPROVAL_ID,
  external_reference: `${USER}|monthly|sub`,
  type: 'scheduled',
  status: 'processed',
  transaction_amount: 149,
  currency_id: 'MXN',
  debit_date: '2026-10-08T12:00:00.000-04:00',
  date_created: '2026-10-08T11:59:30.000-04:00',
  retry_attempt: 0,
  payment: { id: 1325961474, status: 'approved', status_detail: 'accredited' },
  ...overrides,
});

// ---------------------------------------------------------------------------------------------
// Paso 1. Firma

describe('firma de Mercado Pago', () => {
  const base = { requestId: 'req-1', dataId: '777', secret: MP_SECRET, nowMs: NOW };

  it('acepta ts en milisegundos, como en los ejemplos reales de 13 dígitos', async () => {
    const header = mpHeader({ dataId: '777', requestId: 'req-1', ts: NOW });
    expect(await verifyMercadoPagoSignature({ ...base, header })).toBe(true);
  });

  it('acepta ts en segundos, como lo trata el validador del SDK, firmado con el texto tal cual', async () => {
    const seconds = String(Math.floor(NOW / 1000));
    const header = mpHeader({ dataId: '777', requestId: 'req-1', ts: seconds });
    expect(await verifyMercadoPagoSignature({ ...base, header })).toBe(true);
    // El mismo instante en milisegundos es otro texto y otra firma
    const otherText = `ts=${seconds}000,v1=${hmac(MP_SECRET, `id:777;request-id:req-1;ts:${seconds};`)}`;
    expect(await verifyMercadoPagoSignature({ ...base, header: otherText })).toBe(false);
  });

  it('tolera 5 minutos en las dos formas de ts, hacia atrás y hacia adelante', async () => {
    const at = (ms: number, unit: 'ms' | 's') =>
      mpHeader({
        dataId: '777',
        requestId: 'req-1',
        ts: unit === 'ms' ? ms : Math.floor(ms / 1000),
      });
    for (const unit of ['ms', 's'] as const) {
      expect(
        await verifyMercadoPagoSignature({ ...base, header: at(NOW - 4 * 60_000, unit) }),
      ).toBe(true);
      expect(
        await verifyMercadoPagoSignature({ ...base, header: at(NOW - 6 * 60_000, unit) }),
      ).toBe(false);
      expect(
        await verifyMercadoPagoSignature({ ...base, header: at(NOW + 6 * 60_000, unit) }),
      ).toBe(false);
    }
  });

  it('acepta el id con letras en minúsculas, como pide la guía, y tal cual, como firma el SDK', async () => {
    const lower = mpHeader({ dataId: 'abc123', requestId: 'req-1' });
    const asIs = mpHeader({ dataId: 'ABC123', requestId: 'req-1' });
    for (const header of [lower, asIs]) {
      expect(await verifyMercadoPagoSignature({ ...base, dataId: 'ABC123', header })).toBe(true);
    }
    expect(await verifyMercadoPagoSignature({ ...base, dataId: 'ABC124', header: asIs })).toBe(
      false,
    );
  });

  it('lee el encabezado como el SDK, con espacios y nombres en mayúsculas', async () => {
    const [ts, v1] = mpHeader({ dataId: '777', requestId: 'req-1' }).split(',');
    const header = ` TS = ${ts?.slice(3) ?? ''} , V1 = ${v1?.slice(3) ?? ''} `;
    expect(await verifyMercadoPagoSignature({ ...base, header })).toBe(true);
  });

  it('omite del mensaje firmado lo que no llegó', async () => {
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
    const header = mpHeader({ dataId: '777', requestId: 'req-1' });
    expect(await verifyMercadoPagoSignature({ ...base, header, secret: 'otro' })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header, dataId: '778' })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header, requestId: 'req-2' })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header: null })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header: 'ts=abc' })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header: 'v1=00' })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header: 'ts=1.7e12,v1=00' })).toBe(false);
    const stale = mpHeader({ dataId: '777', requestId: 'req-1', ts: NOW - 10 * 60_000 });
    expect(await verifyMercadoPagoSignature({ ...base, header: stale })).toBe(false);
    expect(await verifyMercadoPagoSignature({ ...base, header, secret: '' })).toBe(false);
  });

  it('ts de hasta 10 dígitos son segundos y de más son milisegundos', () => {
    expect(signatureTimeMs('1759939200')).toBe(1_759_939_200_000);
    expect(signatureTimeMs('1759939200000')).toBe(1_759_939_200_000);
    expect(signatureTimeMs('abc')).toBeNull();
    expect(signatureTimeMs('')).toBeNull();
    expect(signatureTimeMs('-1759939200')).toBeNull();
    expect(signatureTimeMs('12345678901234567')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Referencia y periodo

describe('referencia externa y periodo', () => {
  it('la suscripción lleva |sub y el pase conserva la forma de antes', () => {
    expect(externalReferenceFor(USER, 'monthly', 'subscription')).toBe(`${USER}|monthly|sub`);
    expect(externalReferenceFor(USER, 'annual', 'pass')).toBe(`${USER}|annual`);
  });

  it('lee sub y pass, y una referencia vieja de dos campos cuenta como pase', () => {
    expect(parseExternalReference(`${USER}|annual|sub`)).toEqual({
      userId: USER,
      plan: 'annual',
      purpose: 'subscription',
    });
    expect(parseExternalReference(`${USER}|monthly|pass`)).toEqual({
      userId: USER,
      plan: 'monthly',
      purpose: 'pass',
    });
    expect(parseExternalReference(`${USER}|annual`)).toEqual({
      userId: USER,
      plan: 'annual',
      purpose: 'pass',
    });
  });

  it('rechaza otra forma, un plan gratis, un usuario que no es uuid o algo que no es texto', () => {
    expect(parseExternalReference(`${USER}|monthly|otra`)).toBeNull();
    expect(parseExternalReference(`${USER}|monthly|sub|x`)).toBeNull();
    expect(parseExternalReference(`${USER}|free`)).toBeNull();
    expect(parseExternalReference('x|monthly')).toBeNull();
    expect(parseExternalReference(42)).toBeNull();
  });

  it('suma meses como Postgres, sin pasarse del último día del mes', () => {
    expect(addMonths('2026-10-08T16:00:00.000Z', 1)).toBe('2026-11-08T16:00:00.000Z');
    expect(addMonths('2026-10-08T16:00:00.000Z', 12)).toBe('2027-10-08T16:00:00.000Z');
    expect(addMonths('2026-12-15T06:00:00.000Z', 1)).toBe('2027-01-15T06:00:00.000Z');
    expect(addMonths('2027-01-31T10:00:00.000Z', 1)).toBe('2027-02-28T10:00:00.000Z');
    expect(addMonths('2028-01-31T10:00:00.000Z', 1)).toBe('2028-02-29T10:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------------------------
// Paso 3. Del recurso de Mercado Pago al aviso de la base

describe('tema payment', () => {
  it('un pase aprobado es un cobro de pase, con el id del pago y el estado en su id de evento', () => {
    expect(chargeNoticeFromPayment(passPayment())).toEqual({
      provider: 'mercadopago',
      eventId: '12345:approved',
      payload: expect.any(Object) as unknown,
      kind: 'paid',
      userId: USER,
      purpose: 'pass',
      plan: 'monthly',
      method: 'mercadopago',
      providerPaymentId: '12345',
      paymentIntentId: null,
      providerSubscriptionId: null,
      amountMxn: 149,
      discountMxn: null,
      promotionCode: null,
      periodEnd: null,
      expiresAt: null,
    });
    expect(
      chargeNoticeFromPayment(passPayment({ external_reference: `${USER}|annual|pass` }))?.plan,
    ).toBe('annual');
  });

  it('lo guardado no lleva los datos del pagador ni su cuenta de banco', () => {
    const payload = chargeNoticeFromPayment(
      passPayment({
        point_of_interaction: {
          type: 'CHECKOUT',
          transaction_data: { bank_info: { payer: { long_name: 'Banco' } }, ticket_url: 'x' },
        },
      }),
    )?.payload;
    expect(payload).toMatchObject({ id: 12345, status: 'approved', transaction_amount: 149 });
    expect(payload).not.toHaveProperty('payer');
    expect(payload).not.toHaveProperty('card');
    expect(payload).not.toHaveProperty('additional_info');
    expect(payload?.point_of_interaction).toEqual({
      type: 'CHECKOUT',
      transaction_data: { ticket_url: 'x' },
    });
    expect(JSON.stringify(payload)).not.toContain('alumna@ejemplo.mx');
  });

  it('un cobro de suscripción lleva su suscripción y alarga el periodo desde el día del cobro', () => {
    expect(chargeNoticeFromPayment(subscriptionPayment())).toMatchObject({
      eventId: '1325961474:approved',
      kind: 'paid',
      userId: USER,
      purpose: 'subscription',
      plan: 'monthly',
      providerPaymentId: '1325961474',
      providerSubscriptionId: PREAPPROVAL_ID,
      amountMxn: 149,
      periodEnd: '2026-11-08T16:00:00.000Z',
    });
    // Sin la fecha de cobro usa la de aprobación, y el anual suma un año
    expect(
      chargeNoticeFromPayment(
        subscriptionPayment({
          external_reference: `${USER}|annual|sub`,
          point_of_interaction: { transaction_data: { subscription_id: PREAPPROVAL_ID } },
        }),
      )?.periodEnd,
    ).toBe('2027-10-08T16:00:05.000Z');
  });

  it('devuelto o con contracargo es un reembolso del mismo pago, sin plan', () => {
    for (const status of ['refunded', 'charged_back']) {
      expect(chargeNoticeFromPayment(passPayment({ status }))).toMatchObject({
        eventId: `12345:${status}`,
        kind: 'refunded',
        plan: null,
        providerPaymentId: '12345',
        amountMxn: 149,
      });
    }
    expect(chargeNoticeFromPayment(subscriptionPayment({ status: 'refunded' }))).toMatchObject({
      kind: 'refunded',
      purpose: 'subscription',
      providerSubscriptionId: PREAPPROVAL_ID,
    });
  });

  it('una ficha OXXO o una transferencia pendiente de un pase queda pendiente con su vencimiento', () => {
    expect(
      chargeNoticeFromPayment(
        passPayment({
          status: 'pending',
          status_detail: 'pending_waiting_payment',
          payment_type_id: 'ticket',
          payment_method_id: 'oxxo',
          date_of_expiration: '2026-10-11T23:59:59.000-06:00',
        }),
      ),
    ).toMatchObject({
      eventId: '12345:pending',
      kind: 'pending',
      plan: 'monthly',
      amountMxn: 149,
      expiresAt: '2026-10-12T05:59:59.000Z',
    });
    expect(
      chargeNoticeFromPayment(
        passPayment({ status: 'in_process', payment_type_id: 'bank_transfer' }),
      )?.kind,
    ).toBe('pending');
  });

  it('un pago con tarjeta en revisión o un cobro de suscripción pendiente no cambian nada', () => {
    expect(chargeNoticeFromPayment(passPayment({ status: 'in_process' }))).toBeNull();
    expect(chargeNoticeFromPayment(passPayment({ status: 'pending' }))).toBeNull();
    expect(
      chargeNoticeFromPayment(
        subscriptionPayment({ status: 'pending', payment_type_id: 'ticket' }),
      ),
    ).toBeNull();
  });

  it('un pase rechazado o cancelado pasa a vencido su pendiente, sin plan ni monto para no crear otro', () => {
    for (const status of ['rejected', 'cancelled']) {
      expect(chargeNoticeFromPayment(passPayment({ status }))).toMatchObject({
        eventId: `12345:${status}`,
        kind: 'expired',
        purpose: 'pass',
        plan: null,
        amountMxn: null,
        providerPaymentId: '12345',
      });
    }
    // Un cobro rechazado de la suscripción no la marca vencida. Mercado Pago reintenta
    expect(chargeNoticeFromPayment(subscriptionPayment({ status: 'rejected' }))).toBeNull();
  });

  it('sin referencia usa la metadata, y sin ninguna de las dos el alumno queda sin resolver', () => {
    expect(chargeNoticeFromPayment(passPayment({ external_reference: null }))?.userId).toBe(USER);
    const unknown = chargeNoticeFromPayment(
      passPayment({ external_reference: 'otra-cosa', metadata: {} }),
    );
    expect(unknown).toMatchObject({ userId: null, plan: null, purpose: 'pass' });
    // El de una suscripción sin referencia usa la de su suscripción
    const orphan = subscriptionPayment({ external_reference: undefined });
    expect(chargeNoticeFromPayment(orphan)).toMatchObject({
      userId: null,
      purpose: 'subscription',
    });
    expect(
      chargeNoticeFromPayment(orphan, { userId: USER, plan: 'annual', purpose: 'subscription' }),
    ).toMatchObject({ userId: USER, plan: 'annual', periodEnd: '2027-10-08T16:00:00.000Z' });
  });

  it('otra moneda no lleva monto, y un estado que no conocemos o un pago sin id se ignoran', () => {
    expect(chargeNoticeFromPayment(passPayment({ currency_id: 'USD' }))?.amountMxn).toBeNull();
    expect(chargeNoticeFromPayment(passPayment({ status: 'in_mediation' }))).toBeNull();
    expect(chargeNoticeFromPayment({})).toBeNull();
  });
});

describe('tema subscription_preapproval', () => {
  it('authorized queda active, sin fin de periodo, con la hora del último cambio', () => {
    expect(subscriptionNoticeFromPreapproval(preapproval(), NOW)).toEqual({
      provider: 'mercadopago',
      eventId: `preapproval:${PREAPPROVAL_ID}:authorized:2026-10-08T15:59:00.000Z`,
      eventAt: '2026-10-08T15:59:00.000Z',
      payload: expect.any(Object) as unknown,
      userId: USER,
      subscriptionId: PREAPPROVAL_ID,
      plan: 'monthly',
      status: 'active',
      periodEnd: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      scheduledChange: false,
      priceId: null,
      promotionCode: null,
    });
  });

  it('paused queda past_due y cancelled queda canceled sin otro cobro', () => {
    expect(subscriptionNoticeFromPreapproval(preapproval({ status: 'paused' }), NOW)).toMatchObject(
      { status: 'past_due', cancelAtPeriodEnd: false },
    );
    expect(
      subscriptionNoticeFromPreapproval(preapproval({ status: 'cancelled' }), NOW),
    ).toMatchObject({ status: 'canceled', cancelAtPeriodEnd: true });
  });

  it('pending, un estado que no conocemos o una suscripción sin id se ignoran', () => {
    expect(subscriptionNoticeFromPreapproval(preapproval({ status: 'pending' }), NOW)).toBeNull();
    expect(subscriptionNoticeFromPreapproval(preapproval({ status: 'finished' }), NOW)).toBeNull();
    expect(subscriptionNoticeFromPreapproval(preapproval({ id: null }), NOW)).toBeNull();
  });

  it('una reanudación es otro evento y sin hora de cambio usa la de la lectura', () => {
    const first = subscriptionNoticeFromPreapproval(preapproval(), NOW);
    const resumed = subscriptionNoticeFromPreapproval(
      preapproval({ last_modified: '2026-10-20T10:00:00.000-06:00' }),
      NOW,
    );
    expect(resumed?.eventId).not.toBe(first?.eventId);
    expect(
      subscriptionNoticeFromPreapproval(preapproval({ last_modified: undefined }), NOW),
    ).toMatchObject({
      eventId: `preapproval:${PREAPPROVAL_ID}:authorized`,
      eventAt: new Date(NOW).toISOString(),
    });
  });

  it('lo guardado no lleva el correo del pagador', () => {
    const payload = subscriptionNoticeFromPreapproval(preapproval(), NOW)?.payload;
    expect(payload).toMatchObject({ id: PREAPPROVAL_ID, status: 'authorized' });
    expect(JSON.stringify(payload)).not.toContain('alumna@ejemplo.mx');
  });
});

describe('tema subscription_authorized_payment', () => {
  it('un cobro aprobado alarga la suscripción con el id de su pago', () => {
    expect(chargeNoticeFromAuthorizedPayment(authorizedPayment())).toEqual({
      provider: 'mercadopago',
      eventId: 'authorized_payment:6114264375:approved',
      payload: expect.any(Object) as unknown,
      kind: 'paid',
      userId: USER,
      purpose: 'subscription',
      plan: 'monthly',
      method: 'mercadopago',
      providerPaymentId: '1325961474',
      paymentIntentId: null,
      providerSubscriptionId: PREAPPROVAL_ID,
      amountMxn: 149,
      discountMxn: null,
      promotionCode: null,
      periodEnd: '2026-11-08T16:00:00.000Z',
      expiresAt: null,
    });
    expect(
      chargeNoticeFromAuthorizedPayment(
        authorizedPayment({ external_reference: `${USER}|annual|sub`, transaction_amount: 1499 }),
      ),
    ).toMatchObject({ plan: 'annual', amountMxn: 1499, periodEnd: '2027-10-08T16:00:00.000Z' });
  });

  it('el mismo cobro por los temas payment y subscription_authorized_payment no suma dos veces', () => {
    const fromPayment = chargeNoticeFromPayment(subscriptionPayment());
    const fromAuthorized = chargeNoticeFromAuthorizedPayment(authorizedPayment());
    // Son dos avisos distintos del mismo cobro. La base lo reconoce por el id del pago y el periodo
    // termina el mismo día, así que el segundo no alarga nada
    expect(fromPayment?.eventId).not.toBe(fromAuthorized?.eventId);
    for (const key of [
      'providerPaymentId',
      'providerSubscriptionId',
      'userId',
      'plan',
      'purpose',
      'amountMxn',
      'periodEnd',
    ] as const) {
      expect(fromPayment?.[key]).toBe(fromAuthorized?.[key]);
    }
  });

  it('un intento rechazado o en reintento, o un cobro sin pago, no cambian nada', () => {
    expect(
      chargeNoticeFromAuthorizedPayment(
        authorizedPayment({
          status: 'recycling',
          payment: {
            id: 1325961475,
            status: 'rejected',
            status_detail: 'cc_rejected_insufficient_amount',
          },
        }),
      ),
    ).toBeNull();
    expect(chargeNoticeFromAuthorizedPayment(authorizedPayment({ payment: null }))).toBeNull();
    expect(chargeNoticeFromAuthorizedPayment({})).toBeNull();
  });

  it('sin referencia propia usa la de su suscripción', () => {
    const orphan = authorizedPayment({ external_reference: '' });
    expect(chargeNoticeFromAuthorizedPayment(orphan)?.userId).toBeNull();
    expect(
      chargeNoticeFromAuthorizedPayment(orphan, {
        userId: USER,
        plan: 'monthly',
        purpose: 'subscription',
      })?.userId,
    ).toBe(USER);
  });
});

// ---------------------------------------------------------------------------------------------
// Paso 3. El aviso completo

function webhookDeps(overrides: Partial<MercadoPagoWebhookDeps & MercadoPagoActionDeps> = {}) {
  const charges: ChargeNotice[] = [];
  const states: SubscriptionNotice[] = [];
  const lines: string[] = [];
  const deps: MercadoPagoWebhookDeps & Partial<MercadoPagoActionDeps> = {
    env,
    fetch: () => Promise.reject(new Error('no debía llamar a Mercado Pago')),
    now: () => NOW,
    log: (line) => lines.push(line),
    applyNotice: () => Promise.reject(new Error('el aviso de antes ya no se usa')),
    applyCharge: (notice) => {
      charges.push(notice);
      return Promise.resolve('applied');
    },
    applySubscriptionState: (notice) => {
      states.push(notice);
      return Promise.resolve('applied');
    },
    ...overrides,
  };
  return { deps, charges, states, lines };
}

function send(
  deps: MercadoPagoWebhookDeps & Partial<MercadoPagoActionDeps>,
  options: {
    query?: string;
    body?: unknown;
    signature?: string | null;
    requestId?: string | null;
    method?: string;
  },
) {
  const method = options.method ?? 'POST';
  return handleMercadoPagoWebhook(
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
}

/** Un aviso firmado de un tema y un id, como lo manda Mercado Pago */
const notice = (type: string, id: string, ts: number | string = NOW) => ({
  query: `?data.id=${id}&type=${type}`,
  body: { action: `${type}.updated`, type, data: { id } },
  signature: mpHeader({ dataId: id, requestId: 'r1', ts }),
  requestId: 'r1',
});

describe('aviso de Mercado Pago', () => {
  it('tema payment. Consulta el pago con el token del servidor y lo aplica con apply_charge', async () => {
    const api = fakeMercadoPago({ 'GET /v1/payments/12345': passPayment() });
    const { deps, charges } = webhookDeps({ fetch: api.fetch });
    const reply = await send(deps, notice('payment', '12345'));
    expect(reply.status).toBe(200);
    expect(await reply.text()).toBe('applied');
    expect(api.calls).toEqual([
      { method: 'GET', path: '/v1/payments/12345', auth: `Bearer ${TOKEN}`, body: null },
    ]);
    expect(charges).toEqual([chargeNoticeFromPayment(passPayment())]);
  });

  it('la firma con ts en segundos también pasa, y el id puede venir solo en el cuerpo', async () => {
    const api = fakeMercadoPago({ 'GET /v1/payments/12345': passPayment() });
    const { deps, charges } = webhookDeps({ fetch: api.fetch });
    const seconds = notice('payment', '12345', Math.floor(NOW / 1000));
    expect((await send(deps, seconds)).status).toBe(200);
    const bodyOnly = { ...notice('payment', '12345'), query: '' };
    expect((await send(deps, bodyOnly)).status).toBe(200);
    expect(charges).toHaveLength(2);
  });

  it('tema subscription_preapproval. Consulta la suscripción y la aplica con apply_subscription_state', async () => {
    const api = fakeMercadoPago({ [`GET /preapproval/${PREAPPROVAL_ID}`]: preapproval() });
    const { deps, states, charges } = webhookDeps({
      fetch: api.fetch,
      applySubscriptionState: (state) => {
        states.push(state);
        return Promise.resolve('stale');
      },
    });
    const reply = await send(deps, notice('subscription_preapproval', PREAPPROVAL_ID));
    expect(await reply.text()).toBe('stale');
    expect(states).toEqual([subscriptionNoticeFromPreapproval(preapproval(), NOW)]);
    expect(charges).toHaveLength(0);
  });

  it('tema subscription_authorized_payment. Consulta el cobro y lo aplica como cobro de suscripción', async () => {
    const api = fakeMercadoPago({ 'GET /authorized_payments/6114264375': authorizedPayment() });
    const { deps, charges } = webhookDeps({ fetch: api.fetch });
    const reply = await send(deps, notice('subscription_authorized_payment', '6114264375'));
    expect(reply.status).toBe(200);
    expect(charges).toEqual([chargeNoticeFromAuthorizedPayment(authorizedPayment())]);
    expect(api.calls.map((call) => call.path)).toEqual(['/authorized_payments/6114264375']);
  });

  it('un cobro de suscripción sin referencia la toma de su suscripción, y si no se puede leer pide reintento', async () => {
    const orphan = subscriptionPayment({ external_reference: undefined });
    const api = fakeMercadoPago({
      'GET /v1/payments/1325961474': orphan,
      [`GET /preapproval/${PREAPPROVAL_ID}`]: preapproval(),
    });
    const { deps, charges } = webhookDeps({ fetch: api.fetch });
    expect((await send(deps, notice('payment', '1325961474'))).status).toBe(200);
    expect(charges[0]).toMatchObject({ userId: USER, plan: 'monthly', purpose: 'subscription' });
    expect(api.calls.map((call) => call.path)).toEqual([
      '/v1/payments/1325961474',
      `/preapproval/${PREAPPROVAL_ID}`,
    ]);

    const failing = fakeMercadoPago({
      'GET /v1/payments/1325961474': orphan,
      [`GET /preapproval/${PREAPPROVAL_ID}`]: 500,
    });
    const second = webhookDeps({ fetch: failing.fetch });
    expect((await send(second.deps, notice('payment', '1325961474'))).status).toBe(502);
    expect(second.charges).toHaveLength(0);
  });

  it('un pago que no cambia nada se ignora sin tocar la base', async () => {
    const api = fakeMercadoPago({
      'GET /v1/payments/12345': passPayment({ status: 'in_process' }),
      [`GET /preapproval/${PREAPPROVAL_ID}`]: preapproval({ status: 'pending' }),
    });
    const { deps, charges, states } = webhookDeps({ fetch: api.fetch });
    expect(await (await send(deps, notice('payment', '12345'))).text()).toBe('Ignorado');
    expect(
      await (await send(deps, notice('subscription_preapproval', PREAPPROVAL_ID))).text(),
    ).toBe('Ignorado');
    expect(charges).toHaveLength(0);
    expect(states).toHaveLength(0);
  });

  it('sin firma, con una mala o firmada para otro id contesta 401 y no consulta nada', async () => {
    const { deps, charges } = webhookDeps();
    const good = notice('payment', '12345');
    expect((await send(deps, { ...good, signature: null })).status).toBe(401);
    expect(
      (
        await send(deps, {
          ...good,
          signature: mpHeader({ dataId: '12345', requestId: 'r1', secret: 'otro' }),
        })
      ).status,
    ).toBe(401);
    expect((await send(deps, { ...good, query: '?data.id=888&type=payment' })).status).toBe(401);
    expect(charges).toHaveLength(0);
  });

  it('otros temas y ids raros se ignoran con 200', async () => {
    const { deps, charges } = webhookDeps();
    for (const [type, id] of [
      ['merchant_order', '777'],
      ['subscription_preapproval_plan', 'abc'],
      ['payment', '../x'],
      ['payment', 'abc'],
      ['subscription_preapproval', 'a/b'],
    ] as const) {
      const reply = await send(deps, notice(type, id));
      expect(reply.status).toBe(200);
      expect(await reply.text()).toBe('Ignorado');
    }
    expect(charges).toHaveLength(0);
  });

  it('si Mercado Pago no contesta la consulta responde 502 para que lo reintente, sin la llave en el registro', async () => {
    for (const route of [500, new TypeError('red')]) {
      const api = fakeMercadoPago({ 'GET /v1/payments/12345': route });
      const { deps, lines } = webhookDeps({ fetch: api.fetch });
      expect((await send(deps, notice('payment', '12345'))).status).toBe(502);
      expect(lines).toHaveLength(1);
      expect(lines.join(' ')).not.toContain(TOKEN);
    }
  });

  it('si la base falla contesta 500 para que lo reintente', async () => {
    const api = fakeMercadoPago({ 'GET /v1/payments/12345': passPayment() });
    const { deps } = webhookDeps({
      fetch: api.fetch,
      applyCharge: () => Promise.reject(new Error('caída')),
    });
    expect((await send(deps, notice('payment', '12345'))).status).toBe(500);
  });

  it('sin configurar contesta 503 y con otro método 405', async () => {
    expect(
      (await send(webhookDeps({ env: { ...env, MERCADOPAGO_ACCESS_TOKEN: undefined } }).deps, {}))
        .status,
    ).toBe(503);
    expect(
      (await send(webhookDeps({ env: { ...env, MERCADOPAGO_WEBHOOK_SECRET: '' } }).deps, {}))
        .status,
    ).toBe(503);
    expect((await send(webhookDeps().deps, { method: 'GET' })).status).toBe(405);
  });
});

describe('acciones con Mercado Pago después del aviso', () => {
  const action = (overrides: Partial<BillingAction> = {}): BillingAction => ({
    id: 'accion-1',
    provider: 'mercadopago',
    kind: 'cancel_subscription',
    target: PREAPPROVAL_ID,
    reason: 'refund',
    attempts: 1,
    ...overrides,
  });

  function withActions(routes: Record<string, Route>, actions: BillingAction[]) {
    const api = fakeMercadoPago({ 'GET /v1/payments/12345': passPayment(), ...routes });
    const finished: { id: string; ok: boolean; error: string | null }[] = [];
    const limits: number[] = [];
    const { deps, lines } = webhookDeps({
      fetch: api.fetch,
      claimBillingActions: (limit) => {
        limits.push(limit);
        return Promise.resolve(actions);
      },
      finishBillingAction: (result) => {
        finished.push(result);
        return Promise.resolve();
      },
    });
    return { api, deps, finished, limits, lines };
  }

  it('cancela en Mercado Pago las suscripciones que dejó la base, hasta cinco, y deja las de Stripe', async () => {
    const run = withActions({ [`PUT /preapproval/${PREAPPROVAL_ID}`]: { status: 'cancelled' } }, [
      action(),
      action({ id: 'accion-stripe', provider: 'stripe', target: 'sub_123' }),
    ]);
    const reply = await send(run.deps, notice('payment', '12345'));
    expect(await reply.text()).toBe('applied');
    expect(run.limits).toEqual([5]);
    expect(run.api.calls.slice(1)).toEqual([
      {
        method: 'PUT',
        path: `/preapproval/${PREAPPROVAL_ID}`,
        auth: `Bearer ${TOKEN}`,
        body: { status: 'cancelled' },
      },
    ]);
    expect(run.finished).toEqual([{ id: 'accion-1', ok: true, error: null }]);
  });

  it('si ya estaba cancelada cuenta como hecha, y si no se pudo queda fallida con su motivo', async () => {
    const already = withActions(
      {
        [`PUT /preapproval/${PREAPPROVAL_ID}`]: 400,
        [`GET /preapproval/${PREAPPROVAL_ID}`]: preapproval({ status: 'cancelled' }),
      },
      [action()],
    );
    await send(already.deps, notice('payment', '12345'));
    expect(already.finished).toEqual([{ id: 'accion-1', ok: true, error: null }]);

    const failed = withActions(
      {
        [`PUT /preapproval/${PREAPPROVAL_ID}`]: 500,
        [`GET /preapproval/${PREAPPROVAL_ID}`]: preapproval(),
      },
      [action()],
    );
    const reply = await send(failed.deps, notice('payment', '12345'));
    // El aviso ya se aplicó, así que la respuesta sigue en 200 y la acción se reintenta después
    expect(reply.status).toBe(200);
    expect(failed.finished).toEqual([
      { id: 'accion-1', ok: false, error: 'Mercado Pago no la canceló. estado 500' },
    ]);
  });

  it('si la base no entrega las acciones el aviso sigue en 200, y sin esas dependencias no las pide', async () => {
    const api = fakeMercadoPago({ 'GET /v1/payments/12345': passPayment() });
    const broken = webhookDeps({
      fetch: api.fetch,
      claimBillingActions: () => Promise.reject(new Error('caída')),
      finishBillingAction: () => Promise.resolve(),
    });
    expect((await send(broken.deps, notice('payment', '12345'))).status).toBe(200);
    expect(broken.lines).toEqual(['No se pudieron tomar las acciones pendientes con Mercado Pago']);
    // runtime.ts todavía no pasa claimBillingActions ni finishBillingAction
    const plain = webhookDeps({ fetch: api.fetch });
    expect((await send(plain.deps, notice('payment', '12345'))).status).toBe(200);
  });

  it('un id de suscripción raro no llega a la ruta de la API', async () => {
    const api = fakeMercadoPago({});
    expect(await cancelMercadoPagoSubscription('../otra', TOKEN, api.fetch)).toEqual({
      ok: false,
      error: 'La suscripción no tiene un id válido',
    });
    expect(api.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Paso 2. Crear el pago

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
  const created = (url = 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1') =>
    ((input: string, init?: RequestInit) => {
      sent.push({ url: input, init });
      return Promise.resolve(new Response(JSON.stringify({ id: 'x', init_point: url })));
    }) as typeof fetch;
  const create = (overrides: Partial<Parameters<typeof createMercadoPagoCheckout>[0]> = {}) =>
    createMercadoPagoCheckout({
      user: { id: USER, email: 'alumna@ejemplo.mx' },
      plan: 'annual',
      mode: 'pass',
      context,
      env,
      fetch: created(),
      log: (line) => lines.push(line),
      ...overrides,
    });
  const sentBody = () => JSON.parse(bodyText(sent[0]?.init)) as Record<string, unknown>;

  it('pase. Crea la preferencia con el precio, la referencia, la metadata y las direcciones de regreso', async () => {
    sent.length = 0;
    expect(await create()).toEqual({
      ok: true,
      url: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1',
    });
    expect(sent[0]?.url).toBe(`${API}/checkout/preferences`);
    expect(sent[0]?.init?.method).toBe('POST');
    expect(new Headers(sent[0]?.init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(sentBody()).toEqual({
      items: [
        {
          id: 'annual',
          title: 'Studiare. Pase de 1 año',
          quantity: 1,
          currency_id: 'MXN',
          unit_price: 1499,
        },
      ],
      external_reference: `${USER}|annual`,
      metadata: { user_id: USER, plan: 'annual', mode: 'pass' },
      back_urls: {
        success: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=ok',
        pending:
          'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=pendiente&metodo=mercadopago',
        failure: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=cancelado',
      },
      auto_return: 'approved',
      statement_descriptor: 'STUDIARE',
      notification_url: 'https://proyecto.supabase.co/functions/v1/payment-webhook-mercadopago',
    });
    // El pase no lleva el correo del alumno
    expect(bodyText(sent[0]?.init)).not.toContain('alumna@ejemplo.mx');
  });

  it('pase. Sin FUNCTIONS_URL no manda notification_url y queda el aviso del panel', async () => {
    sent.length = 0;
    await create({ env: { ...env, FUNCTIONS_URL: undefined }, plan: 'monthly' });
    expect(sentBody()).not.toHaveProperty('notification_url');
    expect(sentBody()).toMatchObject({
      items: [{ unit_price: 149, title: 'Studiare. Pase de 1 mes' }],
    });
  });

  it('suscripción. Crea el preapproval mensual o anual en pending con el correo de la cuenta', async () => {
    for (const [plan, frequency, amount, reason] of [
      ['monthly', 1, 149, 'Studiare. Plan mensual'],
      ['annual', 12, 1499, 'Studiare. Plan anual'],
    ] as const) {
      sent.length = 0;
      const reply = await create({
        plan,
        mode: 'subscription',
        fetch: created(
          `https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=${PREAPPROVAL_ID}`,
        ),
      });
      expect(reply).toEqual({
        ok: true,
        url: `https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=${PREAPPROVAL_ID}`,
      });
      expect(sent[0]?.url).toBe(`${API}/preapproval`);
      expect(sentBody()).toEqual({
        reason,
        external_reference: `${USER}|${plan}|sub`,
        payer_email: 'alumna@ejemplo.mx',
        auto_recurring: {
          frequency,
          frequency_type: 'months',
          transaction_amount: amount,
          currency_id: 'MXN',
        },
        back_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=ok',
        status: 'pending',
      });
    }
  });

  it('suscripción. Sin correo en la cuenta no se puede crear y lo deja en el registro', async () => {
    sent.length = 0;
    lines.length = 0;
    expect(
      await create({ mode: 'subscription', user: { id: USER, email: null }, plan: 'monthly' }),
    ).toEqual({ ok: false, error: 'invalid' });
    expect(sent).toHaveLength(0);
    expect(lines).toEqual([
      'No se pudo crear la suscripción del plan monthly. La cuenta no tiene correo',
    ]);
  });

  it('no abre otro cobro con una suscripción vigente ni una suscripción con un pase vigente', async () => {
    sent.length = 0;
    const subscribed: CheckoutContext = { ...context, inForce: 'subscription' };
    const withPass: CheckoutContext = {
      ...context,
      inForce: 'pass',
      passEnd: '2026-11-08T16:00:00.000Z',
    };
    expect(await create({ context: subscribed })).toEqual({
      ok: false,
      error: 'already_subscribed',
    });
    expect(await create({ context: subscribed, mode: 'subscription' })).toEqual({
      ok: false,
      error: 'already_subscribed',
    });
    expect(await create({ context: withPass, mode: 'subscription' })).toEqual({
      ok: false,
      error: 'pass_in_force',
    });
    expect(sent).toHaveLength(0);
    // Con un pase vigente sí se suma otro pase
    expect((await create({ context: withPass })).ok).toBe(true);
  });

  it('el precio Fundador no existe en Mercado Pago', async () => {
    sent.length = 0;
    const founder = { plan: 'founder' } as unknown as Partial<
      Parameters<typeof createMercadoPagoCheckout>[0]
    >;
    expect(await create(founder)).toEqual({ ok: false, error: 'invalid' });
    expect(sent).toHaveLength(0);
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

  it('una dirección fuera de Mercado Pago o sin https no se devuelve', async () => {
    lines.length = 0;
    for (const url of [
      'https://mercadopago.com.mx.otro.mx/pago',
      'http://www.mercadopago.com.mx/x',
    ]) {
      expect(await create({ fetch: created(url) })).toEqual({ ok: false, error: 'provider' });
    }
    expect(lines).toEqual([
      'Mercado Pago creó el pago del plan annual sin una dirección de pago válida',
      'Mercado Pago creó el pago del plan annual sin una dirección de pago válida',
    ]);
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

  it('si Mercado Pago rechaza, no responde la dirección o no hay red, falla con provider y lo deja en el registro sin llave ni correo', async () => {
    lines.length = 0;
    expect(
      await create({ fetch: () => Promise.resolve(new Response('{}', { status: 500 })) }),
    ).toEqual({ ok: false, error: 'provider' });
    expect(
      await create({
        mode: 'subscription',
        plan: 'monthly',
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                message: 'Invalid users involved alumna@ejemplo.mx',
                error: 'bad_request',
                status: 400,
                cause: [{ code: 4, description: 'payer_email alumna@ejemplo.mx' }],
              }),
              { status: 400 },
            ),
          ),
      }),
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
      'Mercado Pago rechazó la suscripción del plan monthly. estado 400, código bad_request, causa 4',
      'Mercado Pago creó el pago del plan annual sin una dirección de pago válida',
      'No se pudo crear el pago del plan annual con mercadopago. TypeError',
    ]);
    expect(lines.join(' ')).not.toContain(TOKEN);
    expect(lines.join(' ')).not.toContain('alumna@ejemplo.mx');
  });
});

// ---------------------------------------------------------------------------------------------
// Paso 3. cancel-subscription

const mpSubscription = (overrides: Partial<CheckoutSubscription> = {}): CheckoutSubscription => ({
  plan: 'monthly',
  status: 'active',
  provider: 'mercadopago',
  subscriptionId: PREAPPROVAL_ID,
  periodEnd: '2026-11-08T16:00:00.000Z',
  cancelAtPeriodEnd: false,
  ...overrides,
});

function cancelDeps(overrides: Partial<CancelSubscriptionDeps> = {}) {
  const states: SubscriptionNotice[] = [];
  const lines: string[] = [];
  const contexts: string[] = [];
  const deps: CancelSubscriptionDeps = {
    env,
    fetch: () => Promise.reject(new Error('no debía llamar a Mercado Pago')),
    now: () => NOW,
    log: (line) => lines.push(line),
    authenticate: (authorization) =>
      Promise.resolve(
        authorization === 'Bearer token-alumna' ? { id: USER, email: 'alumna@ejemplo.mx' } : null,
      ),
    checkoutContext: (userId) => {
      contexts.push(userId);
      return Promise.resolve({
        ...context,
        inForce: 'subscription',
        subscription: mpSubscription(),
      });
    },
    applySubscriptionState: (state) => {
      states.push(state);
      return Promise.resolve('applied');
    },
    ...overrides,
  };
  return { deps, states, lines, contexts };
}

const withSubscription = (subscription: CheckoutSubscription | null) => () =>
  Promise.resolve({ ...context, subscription });

function cancel(
  deps: CancelSubscriptionDeps,
  options: { method?: string; authorization?: string | null; body?: unknown } = {},
) {
  const method = options.method ?? 'POST';
  return handleCancelSubscription(
    new Request('https://f.supabase.co/functions/v1/cancel-subscription', {
      method,
      headers: {
        origin: 'https://app.ejemplo.mx',
        ...(options.authorization === null
          ? {}
          : { authorization: options.authorization ?? 'Bearer token-alumna' }),
      },
      ...(method === 'POST' ? { body: JSON.stringify(options.body ?? {}) } : {}),
    }),
    deps,
  );
}

describe('cancel-subscription', () => {
  it('cancela en Mercado Pago la suscripción que dice la base y la aplica en el acto', async () => {
    const api = fakeMercadoPago({
      [`PUT /preapproval/${PREAPPROVAL_ID}`]: preapproval({ status: 'cancelled' }),
    });
    const { deps, states, contexts } = cancelDeps({ fetch: api.fetch });
    // El navegador no elige qué suscripción se cancela
    const reply = await cancel(deps, { body: { subscriptionId: 'otra-suscripcion' } });
    expect(reply.status).toBe(200);
    expect(reply.headers.get('access-control-allow-origin')).toBe('https://app.ejemplo.mx');
    expect(await reply.json()).toEqual({
      status: 'canceled',
      periodEnd: '2026-11-08T16:00:00.000Z',
    });
    expect(contexts).toEqual([USER]);
    expect(api.calls).toEqual([
      {
        method: 'PUT',
        path: `/preapproval/${PREAPPROVAL_ID}`,
        auth: `Bearer ${TOKEN}`,
        body: { status: 'cancelled' },
      },
    ]);
    expect(states).toEqual([
      {
        provider: 'mercadopago',
        eventId: `cancel:${PREAPPROVAL_ID}`,
        eventAt: '2026-10-08T16:00:00.000Z',
        payload: { id: PREAPPROVAL_ID, status: 'cancelled', source: 'cancel-subscription' },
        userId: USER,
        subscriptionId: PREAPPROVAL_ID,
        plan: 'monthly',
        status: 'canceled',
        periodEnd: null,
        trialEnd: null,
        cancelAtPeriodEnd: true,
        scheduledChange: false,
        priceId: null,
        promotionCode: null,
      },
    ]);
  });

  it('el aviso que llega después de la cancelación ya no cambia nada', async () => {
    const own = await (async () => {
      const api = fakeMercadoPago({ [`PUT /preapproval/${PREAPPROVAL_ID}`]: {} });
      const { deps, states } = cancelDeps({ fetch: api.fetch });
      await cancel(deps);
      return states[0];
    })();
    const later = subscriptionNoticeFromPreapproval(
      preapproval({ status: 'cancelled', last_modified: '2026-10-08T11:59:59.000-04:00' }),
      NOW + 60_000,
    );
    // Es otro id de evento con una hora anterior a la cancelación, así que la base responde stale
    expect(later?.eventId).not.toBe(own?.eventId);
    expect(Date.parse(later?.eventAt ?? '')).toBeLessThan(Date.parse(own?.eventAt ?? ''));
  });

  it('si Mercado Pago dice que no pero ya estaba cancelada, cuenta como hecha', async () => {
    const api = fakeMercadoPago({
      [`PUT /preapproval/${PREAPPROVAL_ID}`]: 400,
      [`GET /preapproval/${PREAPPROVAL_ID}`]: preapproval({ status: 'cancelled' }),
    });
    const { deps, states } = cancelDeps({ fetch: api.fetch });
    expect((await cancel(deps)).status).toBe(200);
    expect(states).toHaveLength(1);
  });

  it('si Mercado Pago no la cancela o no responde contesta 502, sin aplicar nada y sin la llave en el registro', async () => {
    const cases: Record<string, Route>[] = [
      {
        [`PUT /preapproval/${PREAPPROVAL_ID}`]: 500,
        [`GET /preapproval/${PREAPPROVAL_ID}`]: preapproval(),
      },
      { [`PUT /preapproval/${PREAPPROVAL_ID}`]: new TypeError('red') },
    ];
    for (const routes of cases) {
      const api = fakeMercadoPago(routes);
      const { deps, states, lines } = cancelDeps({ fetch: api.fetch });
      const reply = await cancel(deps);
      expect(reply.status).toBe(502);
      expect(await reply.json()).toEqual({ error: 'provider' });
      expect(states).toHaveLength(0);
      expect(lines).toHaveLength(1);
      expect(lines.join(' ')).not.toContain(TOKEN);
    }
  });

  it('si la base no responde después de cancelar contesta 200 y lo deja en el registro', async () => {
    const api = fakeMercadoPago({ [`PUT /preapproval/${PREAPPROVAL_ID}`]: {} });
    const { deps, lines } = cancelDeps({
      fetch: api.fetch,
      applySubscriptionState: () => Promise.reject(new Error('caída')),
    });
    expect((await cancel(deps)).status).toBe(200);
    expect(lines).toEqual([
      'Mercado Pago canceló la suscripción, pero la base no respondió. Lo aplicará su aviso',
    ]);
  });

  it('una suscripción ya cancelada responde lo mismo sin llamar a Mercado Pago', async () => {
    const { deps, states } = cancelDeps({
      checkoutContext: withSubscription(mpSubscription({ status: 'canceled' })),
    });
    const reply = await cancel(deps);
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      status: 'canceled',
      periodEnd: '2026-11-08T16:00:00.000Z',
    });
    expect(states).toHaveLength(0);
  });

  it('sin suscripción de Mercado Pago contesta 404 no_subscription', async () => {
    for (const subscription of [
      null,
      mpSubscription({ provider: 'stripe', subscriptionId: 'sub_123' }),
      mpSubscription({ subscriptionId: null }),
      mpSubscription({ plan: 'free', status: 'canceled' }),
      mpSubscription({ status: 'incomplete' }),
    ]) {
      const { deps } = cancelDeps({ checkoutContext: withSubscription(subscription) });
      const reply = await cancel(deps);
      expect(reply.status).toBe(404);
      expect(await reply.json()).toEqual({ error: 'no_subscription' });
    }
  });

  it('sin sesión 401, sin token 503, si la base falla 502, con otro método 405 y OPTIONS para el navegador', async () => {
    expect((await cancel(cancelDeps().deps, { authorization: null })).status).toBe(401);
    expect(
      (await cancel(cancelDeps({ env: { ...env, MERCADOPAGO_ACCESS_TOKEN: undefined } }).deps))
        .status,
    ).toBe(503);
    const broken = cancelDeps({ checkoutContext: () => Promise.reject(new Error('caída')) });
    expect((await cancel(broken.deps)).status).toBe(502);
    expect(broken.lines).toHaveLength(1);
    expect((await cancel(cancelDeps().deps, { method: 'GET' })).status).toBe(405);
    const preflight = await cancel(cancelDeps().deps, { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://app.ejemplo.mx');
  });
});
