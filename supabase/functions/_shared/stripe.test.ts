import { describe, expect, it } from 'vitest';
import { STRIPE_API_VERSION, type FunctionEnv } from './billingTypes.ts';
import {
  PASS_PRICE_SECRETS,
  PLAN_PRICE_SECRETS,
  cancelStripeSubscription,
  checkoutSessionSteps,
  customerParams,
  invoiceChargeNotice,
  isMissingCustomer,
  oxxoExpiresAt,
  passNoticeText,
  passPlanOfPrice,
  passSessionParams,
  planOfPrice,
  portalSessionParams,
  priceFromEnv,
  refundedCharge,
  sessionNeedsRead,
  stripeCall,
  stripeFailureLine,
  stripeSubscriptionStatus,
  subscriptionNotice,
  subscriptionNoticeText,
  subscriptionSessionParams,
  trialEndingNotice,
  type NoticeContext,
} from './stripe.ts';

const USER = '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f';
const NOW = Date.parse('2026-10-14T16:00:00.000Z');
const APP = 'https://app.ejemplo.mx/Studiare-ENARM/';

const env: FunctionEnv = {
  STRIPE_PRICE_FOUNDER: 'price_fundador',
  STRIPE_PRICE_FOUNDER_ANNUAL: 'price_fundador_anual',
  STRIPE_PRICE_MONTHLY: 'price_mensual',
  STRIPE_PRICE_ANNUAL: ' price_anual ',
  STRIPE_PRICE_PASS_MONTHLY: 'price_pase_mes',
  STRIPE_PRICE_PASS_ANNUAL: 'price_pase_anio',
};

const context = (lines: string[] = []): NoticeContext => ({
  eventId: 'evt_1',
  eventAt: '2026-10-14T16:00:00.000Z',
  payload: { id: 'evt_1' },
  env,
  log: (line) => lines.push(line),
});

const form = (params: URLSearchParams) => Object.fromEntries(params);
const seconds = (iso: string) => Date.parse(iso) / 1000;

function recorder(replies: (() => Response)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let index = 0;
  const fetchImpl = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    return reply ? Promise.resolve(reply()) : Promise.reject(new Error('sin respuesta'));
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('llamadas a Stripe', () => {
  it('mandan la llave, la versión fija y el cuerpo en POST', async () => {
    const { calls, fetchImpl } = recorder([() => Response.json({ id: 'cus_1' })]);
    const reply = await stripeCall(
      { key: 'llave-de-prueba', fetch: fetchImpl },
      'POST',
      '/v1/customers',
      new URLSearchParams({ email: 'a@x.mx' }),
      { idempotencyKey: 'clave-1' },
    );
    expect(reply).toEqual({ ok: true, status: 200, body: { id: 'cus_1' } });
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/customers');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('authorization')).toBe('Bearer llave-de-prueba');
    expect(headers.get('stripe-version')).toBe(STRIPE_API_VERSION);
    expect(STRIPE_API_VERSION).toBe('2026-09-30.endive');
    expect(headers.get('idempotency-key')).toBe('clave-1');
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    const body = calls[0]?.init?.body;
    expect(body instanceof URLSearchParams ? body.toString() : null).toBe('email=a%40x.mx');
  });

  it('en GET y DELETE mandan los parámetros en la dirección y leen un cuerpo raro como vacío', async () => {
    const { calls, fetchImpl } = recorder([() => new Response('no es json', { status: 500 })]);
    const client = { key: 'k', fetch: fetchImpl };
    const reply = await stripeCall(
      client,
      'DELETE',
      '/v1/subscriptions/sub_1',
      new URLSearchParams({ prorate: 'false' }),
    );
    expect(reply).toEqual({ ok: false, status: 500, body: {} });
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/subscriptions/sub_1?prorate=false');
    expect(calls[0]?.init?.body).toBeUndefined();
    await stripeCall(client, 'GET', '/v1/subscriptions/sub_1');
    expect(calls[1]?.url).toBe('https://api.stripe.com/v1/subscriptions/sub_1');
  });

  it('el motivo de un rechazo va en una línea sin llaves', () => {
    const reply = {
      ok: false,
      status: 400,
      body: {
        error: {
          type: 'invalid_request_error',
          code: 'resource_missing',
          param: 'customer',
          message: 'No such customer',
        },
      },
    };
    expect(stripeFailureLine(reply)).toBe(
      'estado 400, tipo invalid_request_error, código resource_missing, parámetro customer, mensaje No such customer',
    );
    expect(stripeFailureLine({ ok: false, status: 502, body: {} })).toBe(
      'estado 502, tipo ?, código ?, parámetro ?, mensaje ?',
    );
  });

  it('reconoce cuando el cliente guardado ya no existe', () => {
    expect(
      isMissingCustomer({
        ok: false,
        status: 400,
        body: { error: { code: 'resource_missing', param: 'customer' } },
      }),
    ).toBe(true);
    expect(
      isMissingCustomer({
        ok: false,
        status: 400,
        body: { error: { message: "No such customer: 'cus_1'" } },
      }),
    ).toBe(true);
    expect(
      isMissingCustomer({
        ok: false,
        status: 400,
        body: { error: { code: 'resource_missing', param: 'line_items[0][price]' } },
      }),
    ).toBe(false);
    expect(isMissingCustomer({ ok: true, status: 200, body: {} })).toBe(false);
  });
});

describe('precios de Stripe', () => {
  it('cada plan y cada pase tiene su secreto', () => {
    expect(PLAN_PRICE_SECRETS).toEqual({
      founder: 'STRIPE_PRICE_FOUNDER',
      founder_annual: 'STRIPE_PRICE_FOUNDER_ANNUAL',
      monthly: 'STRIPE_PRICE_MONTHLY',
      annual: 'STRIPE_PRICE_ANNUAL',
    });
    expect(PASS_PRICE_SECRETS).toEqual({
      monthly: 'STRIPE_PRICE_PASS_MONTHLY',
      annual: 'STRIPE_PRICE_PASS_ANNUAL',
    });
  });

  it('un secreto que falta o que trae otra cosa deja la línea con el nombre del secreto', () => {
    expect(priceFromEnv(env, 'STRIPE_PRICE_ANNUAL')).toEqual({ ok: true, price: 'price_anual' });
    expect(priceFromEnv({}, 'STRIPE_PRICE_FOUNDER_ANNUAL')).toEqual({
      ok: false,
      line: 'Falta el secreto STRIPE_PRICE_FOUNDER_ANNUAL en Supabase, Edge Functions, Secrets',
    });
    expect(priceFromEnv({ STRIPE_PRICE_FOUNDER: ' prod_VPyZ ' }, 'STRIPE_PRICE_FOUNDER')).toEqual({
      ok: false,
      line: 'STRIPE_PRICE_FOUNDER no es un Price ID. Debe empezar con price_ y empieza con prod_. Cópialo de la sección Pricing del producto en Stripe',
    });
  });

  it('el plan sale del Price ID y uno desconocido no es ninguno', () => {
    expect(planOfPrice('price_fundador_anual', env)).toBe('founder_annual');
    expect(planOfPrice('price_anual', env)).toBe('annual');
    expect(planOfPrice('price_otro', env)).toBeNull();
    expect(planOfPrice(null, env)).toBeNull();
    expect(passPlanOfPrice('price_pase_anio', env)).toBe('annual');
    expect(passPlanOfPrice('price_mensual', env)).toBeNull();
  });
});

describe('sesión de suscripción', () => {
  const base = {
    appUrl: APP,
    userId: USER,
    customerId: 'cus_1',
    plan: 'founder' as const,
    priceId: 'price_fundador',
    trialDays: 7,
    automaticTax: false,
    nowMs: NOW,
  };

  it('con prueba pide 7 días, guarda quién y qué, deja códigos y no limita los medios de pago', () => {
    const params = subscriptionSessionParams(base);
    expect(form(params)).toMatchObject({
      mode: 'subscription',
      customer: 'cus_1',
      'line_items[0][price]': 'price_fundador',
      'line_items[0][quantity]': '1',
      client_reference_id: USER,
      'metadata[user_id]': USER,
      'metadata[plan]': 'founder',
      'metadata[mode]': 'subscription',
      'metadata[trial]': 'true',
      'subscription_data[metadata][user_id]': USER,
      'subscription_data[metadata][plan]': 'founder',
      'subscription_data[metadata][trial]': 'true',
      'subscription_data[trial_period_days]': '7',
      allow_promotion_codes: 'true',
      locale: 'es-419',
      success_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=ok',
      cancel_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=cancelado',
    });
    // Apple Pay y Google Pay aparecen solos cuando la sesión no limita los medios de pago (4.29)
    const keys = [...params.keys()];
    expect(keys.some((key) => key.startsWith('payment_method_types'))).toBe(false);
    expect(keys.some((key) => key.startsWith('allowed_payment_method_types'))).toBe(false);
    expect(keys.some((key) => key.startsWith('excluded_payment_method_types'))).toBe(false);
    expect(params.has('payment_method_collection')).toBe(false);
    expect(params.has('customer_email')).toBe(false);
    expect(params.has('automatic_tax[enabled]')).toBe(false);
    expect(params.get('custom_text[submit][message]')).toContain('Hoy no se cobra nada');
    expect(params.get('custom_text[submit][message]')).toContain('21 de octubre de 2026');
    expect(params.get('custom_text[submit][message]')).toContain('$79 MXN');
  });

  it('sin prueba no pide días y avisa el cobro de hoy, también en el anual Fundador', () => {
    const params = subscriptionSessionParams({
      ...base,
      plan: 'founder_annual',
      priceId: 'price_fundador_anual',
      trialDays: null,
    });
    expect(params.has('subscription_data[trial_period_days]')).toBe(false);
    expect(params.get('metadata[trial]')).toBe('false');
    expect(params.get('metadata[plan]')).toBe('founder_annual');
    expect(params.get('custom_text[submit][message]')).toContain(
      'Hoy se cobran $749 MXN y luego cada año',
    );
  });

  it('con Stripe Tax calcula el impuesto y deja actualizar el cliente', () => {
    const params = subscriptionSessionParams({ ...base, automaticTax: true });
    expect(form(params)).toMatchObject({
      'automatic_tax[enabled]': 'true',
      billing_address_collection: 'required',
      'tax_id_collection[enabled]': 'true',
      'customer_update[address]': 'auto',
      'customer_update[name]': 'auto',
    });
  });

  it('los avisos de la página de pago no llevan dos puntos y dicen la garantía', () => {
    for (const message of [
      subscriptionNoticeText('monthly', 7, NOW),
      subscriptionNoticeText('annual', null, NOW),
      passNoticeText('oxxo'),
      passNoticeText('spei'),
    ]) {
      expect(message).not.toContain(':');
      expect(message).toContain('7 días de garantía');
      expect(message.length).toBeLessThanOrEqual(1200);
    }
    expect(passNoticeText('oxxo')).toContain('por transferencia');
    expect(passNoticeText('spei')).toContain('monto exacto');
  });
});

describe('sesión de pase', () => {
  const base = {
    appUrl: APP,
    userId: USER,
    customerId: 'cus_1',
    plan: 'monthly' as const,
    priceId: 'price_pase_mes',
    oxxoExpiresDays: 3,
  };

  it('OXXO solo permite OXXO, con su vencimiento y el regreso de pago pendiente', () => {
    const params = passSessionParams({ ...base, method: 'oxxo' });
    expect(form(params)).toMatchObject({
      mode: 'payment',
      customer: 'cus_1',
      'line_items[0][price]': 'price_pase_mes',
      'allowed_payment_method_types[0]': 'oxxo',
      'payment_method_options[oxxo][expires_after_days]': '3',
      'metadata[user_id]': USER,
      'metadata[plan]': 'monthly',
      'metadata[mode]': 'pass',
      'metadata[method]': 'oxxo',
      'metadata[oxxo_days]': '3',
      'payment_intent_data[metadata][user_id]': USER,
      'payment_intent_data[metadata][method]': 'oxxo',
      allow_promotion_codes: 'true',
      locale: 'es-419',
      success_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=pendiente&metodo=oxxo',
      cancel_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=cancelado',
    });
    expect(params.has('allowed_payment_method_types[1]')).toBe(false);
    expect(params.has('payment_method_options[customer_balance][funding_type]')).toBe(false);
    expect(params.has('subscription_data[trial_period_days]')).toBe(false);
  });

  it('SPEI es transferencia de México sobre el saldo del cliente', () => {
    const params = passSessionParams({
      ...base,
      plan: 'annual',
      priceId: 'price_pase_anio',
      method: 'spei',
    });
    expect(form(params)).toMatchObject({
      customer: 'cus_1',
      'allowed_payment_method_types[0]': 'customer_balance',
      'payment_method_options[customer_balance][funding_type]': 'bank_transfer',
      'payment_method_options[customer_balance][bank_transfer][type]': 'mx_bank_transfer',
      success_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion?pago=pendiente&metodo=spei',
    });
    expect(params.has('payment_method_options[oxxo][expires_after_days]')).toBe(false);
    expect(params.has('metadata[oxxo_days]')).toBe(false);
  });

  it('el cliente nuevo lleva su correo, su id y el idioma', () => {
    expect(form(customerParams({ id: USER, email: 'a@x.mx' }))).toEqual({
      'metadata[user_id]': USER,
      'preferred_locales[0]': 'es-419',
      email: 'a@x.mx',
    });
    expect(customerParams({ id: USER, email: null }).has('email')).toBe(false);
  });
});

describe('sesión del portal', () => {
  it('lleva la configuración, el idioma y el regreso a Suscripción', () => {
    expect(
      form(
        portalSessionParams({
          customerId: 'cus_1',
          appUrl: APP,
          configuration: 'bpc_1',
          flow: null,
          subscriptionId: 'sub_1',
        }),
      ),
    ).toEqual({
      customer: 'cus_1',
      return_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion',
      locale: 'es-419',
      configuration: 'bpc_1',
    });
  });

  it('con flow abre directo cambiar de plan o cancelar y regresa a Suscripción', () => {
    expect(
      form(
        portalSessionParams({
          customerId: 'cus_1',
          appUrl: APP,
          configuration: null,
          flow: 'update',
          subscriptionId: 'sub_1',
        }),
      ),
    ).toMatchObject({
      'flow_data[type]': 'subscription_update',
      'flow_data[subscription_update][subscription]': 'sub_1',
      'flow_data[after_completion][type]': 'redirect',
      'flow_data[after_completion][redirect][return_url]':
        'https://app.ejemplo.mx/Studiare-ENARM/suscripcion',
    });
    const cancel = portalSessionParams({
      customerId: 'cus_1',
      appUrl: APP,
      configuration: null,
      flow: 'cancel',
      subscriptionId: 'sub_1',
    });
    expect(cancel.get('flow_data[type]')).toBe('subscription_cancel');
    expect(cancel.get('flow_data[subscription_cancel][subscription]')).toBe('sub_1');
    expect(cancel.has('configuration')).toBe(false);
    const withoutSubscription = portalSessionParams({
      customerId: 'cus_1',
      appUrl: APP,
      configuration: null,
      flow: 'update',
      subscriptionId: null,
    });
    expect(withoutSubscription.has('flow_data[type]')).toBe(false);
  });
});

describe('cancelar una suscripción en Stripe', () => {
  it('la cancela en el acto, sin prorrateo ni factura final', async () => {
    const { calls, fetchImpl } = recorder([
      () => Response.json({ id: 'sub_1', status: 'canceled' }),
    ]);
    expect(await cancelStripeSubscription({ key: 'k', fetch: fetchImpl }, 'sub_1')).toEqual({
      ok: true,
      error: null,
    });
    expect(calls[0]?.init?.method).toBe('DELETE');
    expect(calls[0]?.url).toBe(
      'https://api.stripe.com/v1/subscriptions/sub_1?prorate=false&invoice_now=false',
    );
  });

  it('una que ya estaba cancelada cuenta como hecha', async () => {
    const { calls, fetchImpl } = recorder([
      () => Response.json({ error: { message: 'already canceled' } }, { status: 400 }),
      () => Response.json({ id: 'sub_1', status: 'canceled' }),
    ]);
    expect(await cancelStripeSubscription({ key: 'k', fetch: fetchImpl }, 'sub_1')).toEqual({
      ok: true,
      error: null,
    });
    expect(calls[1]?.init?.method).toBe('GET');
  });

  it('si no se pudo queda el motivo sin llaves, también sin red', async () => {
    const { fetchImpl } = recorder([
      () => Response.json({ error: { type: 'api_error', message: 'Boom' } }, { status: 500 }),
      () => Response.json({ id: 'sub_1', status: 'active' }),
    ]);
    const failed = await cancelStripeSubscription(
      { key: 'llave-secreta', fetch: fetchImpl },
      'sub_1',
    );
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain('estado 500');
    expect(failed.error).not.toContain('llave-secreta');
    const offline = await cancelStripeSubscription(
      { key: 'k', fetch: () => Promise.reject(new TypeError('red')) },
      'sub_1',
    );
    expect(offline).toEqual({ ok: false, error: 'Sin red hacia Stripe al cancelar. TypeError' });
  });
});

describe('estado de una suscripción', () => {
  const subscription = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub_1',
    status: 'active',
    metadata: { user_id: USER, plan: 'monthly' },
    items: {
      data: [
        {
          price: { id: 'price_mensual' },
          current_period_end: seconds('2026-11-14T16:00:00.000Z'),
        },
      ],
    },
    trial_end: null,
    cancel_at_period_end: false,
    cancel_at: null,
    schedule: null,
    ...overrides,
  });

  it('traduce cada estado de Stripe como dice 1.3', () => {
    expect(
      [
        'trialing',
        'active',
        'past_due',
        'unpaid',
        'paused',
        'canceled',
        'incomplete_expired',
        'incomplete',
        'otro',
      ].map(stripeSubscriptionStatus),
    ).toEqual([
      'trialing',
      'active',
      'past_due',
      'past_due',
      'past_due',
      'ended',
      'ended',
      null,
      null,
    ]);
  });

  it('una activa trae quién, el plan por su Price ID y el fin del periodo de sus items', () => {
    expect(subscriptionNotice(subscription(), context())).toEqual({
      provider: 'stripe',
      eventId: 'evt_1',
      eventAt: '2026-10-14T16:00:00.000Z',
      payload: { id: 'evt_1' },
      userId: USER,
      subscriptionId: 'sub_1',
      plan: 'monthly',
      status: 'active',
      periodEnd: '2026-11-14T16:00:00.000Z',
      trialEnd: null,
      cancelAtPeriodEnd: false,
      scheduledChange: false,
      priceId: 'price_mensual',
      promotionCode: null,
    });
  });

  it('una en prueba, cancelada al final, con cambio programado o con código lo dice', () => {
    const notice = subscriptionNotice(
      subscription({
        status: 'trialing',
        trial_end: seconds('2026-10-21T16:00:00.000Z'),
        cancel_at_period_end: true,
        schedule: 'sub_sched_1',
        discounts: [{ promotion_code: { code: 'prueba10' } }],
      }),
      context(),
    );
    expect(notice).toMatchObject({
      status: 'trialing',
      trialEnd: '2026-10-21T16:00:00.000Z',
      cancelAtPeriodEnd: true,
      scheduledChange: true,
      promotionCode: 'PRUEBA10',
    });
    // Una cancelación agendada con fecha también cuenta
    expect(
      subscriptionNotice(
        subscription({ cancel_at: seconds('2026-11-14T16:00:00.000Z') }),
        context(),
      )?.cancelAtPeriodEnd,
    ).toBe(true);
  });

  it('con la forma anterior el fin del periodo sale de la suscripción', () => {
    const notice = subscriptionNotice(
      subscription({
        items: { data: [{ plan: { id: 'price_anual' } }] },
        current_period_end: seconds('2027-10-14T16:00:00.000Z'),
      }),
      context(),
    );
    expect(notice).toMatchObject({ plan: 'annual', periodEnd: '2027-10-14T16:00:00.000Z' });
  });

  it('un Price ID desconocido deja una línea y llega sin plan', () => {
    const lines: string[] = [];
    const notice = subscriptionNotice(
      subscription({ items: { data: [{ price: { id: 'price_viejo' } }] } }),
      context(lines),
    );
    expect(notice).toMatchObject({ plan: null, priceId: 'price_viejo' });
    expect(lines).toEqual([
      'Price ID desconocido price_viejo en la suscripción sub_1. Revisa los secretos STRIPE_PRICE_. No cambia el plan',
    ]);
  });

  it('la borrada termina y se recorta a la hora en que terminó', () => {
    expect(
      subscriptionNotice(
        subscription({ status: 'canceled', ended_at: seconds('2026-10-20T00:00:00.000Z') }),
        {
          ...context(),
          ended: true,
        },
      ),
    ).toMatchObject({
      status: 'ended',
      periodEnd: '2026-10-20T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    });
    expect(
      subscriptionNotice(subscription({ status: 'incomplete_expired' }), context())?.status,
    ).toBe('ended');
  });

  it('lo incompleto, sin id o sin metadata propia no trae alumno o se ignora', () => {
    expect(subscriptionNotice(subscription({ status: 'incomplete' }), context())).toBeNull();
    expect(subscriptionNotice({ status: 'active' }, context())).toBeNull();
    expect(
      subscriptionNotice(subscription({ metadata: { user_id: 'no-es-uuid' } }), context())?.userId,
    ).toBeNull();
  });

  it('el aviso de fin de prueba trae la suscripción y su fin', () => {
    expect(
      trialEndingNotice(
        subscription({ status: 'trialing', trial_end: seconds('2026-10-21T16:00:00.000Z') }),
        context(),
      ),
    ).toEqual({
      provider: 'stripe',
      eventId: 'evt_1',
      payload: { id: 'evt_1' },
      userId: USER,
      subscriptionId: 'sub_1',
      trialEnd: '2026-10-21T16:00:00.000Z',
    });
    expect(trialEndingNotice({}, context())).toBeNull();
  });
});

describe('cobro de una factura', () => {
  const invoice = (overrides: Record<string, unknown> = {}) => ({
    id: 'in_1',
    amount_paid: 14_900,
    currency: 'mxn',
    customer: 'cus_1',
    parent: {
      subscription_details: { subscription: 'sub_1', metadata: { user_id: USER, plan: 'monthly' } },
    },
    lines: {
      data: [
        {
          pricing: { price_details: { price: 'price_anual' } },
          period: { end: seconds('2026-11-14T16:00:00.000Z') },
        },
        { period: { end: seconds('2027-10-14T16:00:00.000Z') } },
      ],
    },
    total_discount_amounts: [{ amount: 1_490, discount: 'di_1' }],
    ...overrides,
  });

  it('un cobro pagado trae quién, el plan por el precio de su línea, el descuento y el fin más lejano', () => {
    expect(invoiceChargeNotice(invoice(), 'paid', context())).toEqual({
      provider: 'stripe',
      eventId: 'evt_1',
      payload: { id: 'evt_1' },
      kind: 'paid',
      purpose: 'subscription',
      userId: USER,
      plan: 'annual',
      method: 'card',
      providerPaymentId: 'in_1',
      paymentIntentId: null,
      providerSubscriptionId: 'sub_1',
      amountMxn: 149,
      discountMxn: 14.9,
      promotionCode: null,
      periodEnd: '2027-10-14T16:00:00.000Z',
      expiresAt: null,
    });
  });

  it('con la forma anterior y sin precio conocido usa la metadata', () => {
    const notice = invoiceChargeNotice(
      {
        id: 'in_2',
        subscription: 'sub_9',
        amount_paid: 149_900,
        currency: 'mxn',
        subscription_details: { metadata: { user_id: USER, plan: 'annual' } },
        lines: {
          data: [
            { price: { id: 'price_viejo' }, period: { end: seconds('2027-10-14T16:00:00.000Z') } },
          ],
        },
      },
      'paid',
      context(),
    );
    expect(notice).toMatchObject({
      userId: USER,
      plan: 'annual',
      providerSubscriptionId: 'sub_9',
      amountMxn: 1499,
      discountMxn: null,
    });
  });

  it('la factura de 0 de la prueba no es un cobro y un cobro fallido no trae monto', () => {
    expect(invoiceChargeNotice(invoice({ amount_paid: 0 }), 'paid', context())).toBeNull();
    expect(invoiceChargeNotice(invoice({ currency: 'usd' }), 'paid', context())).toBeNull();
    expect(invoiceChargeNotice(invoice(), 'failed', context())).toMatchObject({
      kind: 'failed',
      amountMxn: null,
      discountMxn: null,
      providerSubscriptionId: 'sub_1',
    });
    expect(
      invoiceChargeNotice({ id: 'in_3', amount_paid: 100, currency: 'mxn' }, 'paid', context()),
    ).toMatchObject({
      userId: null,
      plan: null,
      periodEnd: null,
    });
  });
});

describe('sesión de pago terminada', () => {
  const subscriptionSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'cs_1',
    mode: 'subscription',
    payment_status: 'no_payment_required',
    client_reference_id: USER,
    metadata: { user_id: USER, plan: 'founder', mode: 'subscription', trial: 'true' },
    customer: 'cus_1',
    amount_total: 0,
    currency: 'mxn',
    invoice: 'in_0',
    subscription: {
      id: 'sub_1',
      status: 'trialing',
      metadata: { user_id: USER, plan: 'founder' },
      trial_end: seconds('2026-10-21T16:00:00.000Z'),
      items: {
        data: [
          {
            price: { id: 'price_fundador' },
            current_period_end: seconds('2026-10-21T16:00:00.000Z'),
          },
        ],
      },
    },
    discounts: [{ promotion_code: { code: 'PRUEBA10' } }],
    total_details: { amount_discount: 0 },
    ...overrides,
  });

  it('con prueba liga al cliente y aplica el estado sin cobro', () => {
    const steps = checkoutSessionSteps(
      'checkout.session.completed',
      subscriptionSession(),
      context(),
    );
    expect(steps?.link).toEqual({ userId: USER, customerId: 'cus_1' });
    expect(steps?.state).toMatchObject({
      subscriptionId: 'sub_1',
      status: 'trialing',
      plan: 'founder',
      userId: USER,
      promotionCode: 'PRUEBA10',
      trialEnd: '2026-10-21T16:00:00.000Z',
    });
    expect(steps?.charge).toBeNull();
  });

  it('sin prueba también registra el cobro con la misma factura que traerá invoice.paid', () => {
    const steps = checkoutSessionSteps(
      'checkout.session.completed',
      subscriptionSession({
        payment_status: 'paid',
        amount_total: 13_410,
        invoice: { id: 'in_1' },
        total_details: { amount_discount: 1_490 },
        subscription: {
          id: 'sub_1',
          status: 'active',
          metadata: { user_id: USER, plan: 'monthly' },
          items: {
            data: [
              {
                price: { id: 'price_mensual' },
                current_period_end: seconds('2026-11-14T16:00:00.000Z'),
              },
            ],
          },
        },
      }),
      context(),
    );
    expect(steps?.state?.status).toBe('active');
    expect(steps?.charge).toMatchObject({
      eventId: 'evt_1:charge',
      kind: 'paid',
      purpose: 'subscription',
      plan: 'monthly',
      method: 'card',
      providerPaymentId: 'in_1',
      providerSubscriptionId: 'sub_1',
      amountMxn: 134.1,
      discountMxn: 14.9,
      promotionCode: 'PRUEBA10',
      periodEnd: '2026-11-14T16:00:00.000Z',
    });
  });

  const passSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'cs_2',
    mode: 'payment',
    payment_status: 'unpaid',
    client_reference_id: USER,
    metadata: { user_id: USER, plan: 'monthly', mode: 'pass', method: 'oxxo', oxxo_days: '3' },
    customer: 'cus_1',
    amount_total: 14_900,
    currency: 'mxn',
    payment_intent: 'pi_1',
    created: seconds('2026-10-14T16:00:00.000Z'),
    total_details: { amount_discount: 0 },
    ...overrides,
  });

  it('una ficha OXXO generada queda pendiente con su vencimiento', () => {
    const steps = checkoutSessionSteps('checkout.session.completed', passSession(), context());
    expect(steps?.state).toBeNull();
    expect(steps?.charge).toMatchObject({
      eventId: 'evt_1',
      kind: 'pending',
      purpose: 'pass',
      plan: 'monthly',
      method: 'oxxo',
      providerPaymentId: 'pi_1',
      paymentIntentId: 'pi_1',
      amountMxn: 149,
      expiresAt: '2026-10-18T05:59:59.000Z',
    });
  });

  it('SPEI pendiente no vence, pagado al momento da el pase y los avisos de después lo cierran', () => {
    const spei = {
      metadata: { user_id: USER, plan: 'annual', mode: 'pass', method: 'spei' },
      amount_total: 149_900,
    };
    expect(
      checkoutSessionSteps('checkout.session.completed', passSession(spei), context())?.charge,
    ).toMatchObject({
      kind: 'pending',
      method: 'spei',
      plan: 'annual',
      expiresAt: null,
    });
    expect(
      checkoutSessionSteps(
        'checkout.session.completed',
        passSession({ ...spei, payment_status: 'paid' }),
        context(),
      )?.charge?.kind,
    ).toBe('paid');
    expect(
      checkoutSessionSteps('checkout.session.async_payment_succeeded', passSession(), context())
        ?.charge?.kind,
    ).toBe('paid');
    expect(
      checkoutSessionSteps('checkout.session.async_payment_failed', passSession(), context())
        ?.charge?.kind,
    ).toBe('expired');
  });

  it('lo que no es nuestro o no se entiende no aplica nada', () => {
    expect(
      checkoutSessionSteps('checkout.session.completed', { id: 'cs_3', mode: 'setup' }, context()),
    ).toBeNull();
    expect(
      checkoutSessionSteps(
        'checkout.session.async_payment_succeeded',
        subscriptionSession(),
        context(),
      ),
    ).toBeNull();
    expect(checkoutSessionSteps('checkout.session.completed', {}, context())).toBeNull();
    const foreign = checkoutSessionSteps(
      'checkout.session.completed',
      passSession({ client_reference_id: 'no-es-uuid', metadata: { plan: 'monthly' } }),
      context(),
    );
    expect(foreign?.link).toBeNull();
    expect(foreign?.charge?.userId).toBeNull();
  });

  it('solo se lee de Stripe la suscripción o una sesión con descuento', () => {
    expect(sessionNeedsRead(subscriptionSession())).toBe(true);
    expect(sessionNeedsRead(passSession())).toBe(false);
    expect(sessionNeedsRead(passSession({ total_details: { amount_discount: 1_490 } }))).toBe(true);
  });

  it('la ficha vence a las 23:59 de Ciudad de México del último día', () => {
    expect(oxxoExpiresAt(Date.parse('2026-10-14T16:00:00.000Z'), 3)).toBe(
      '2026-10-18T05:59:59.000Z',
    );
    // A las 11 de la noche del 14 en México ya es 15 en UTC, y cuenta el 14
    expect(oxxoExpiresAt(Date.parse('2026-10-15T05:00:00.000Z'), 1)).toBe(
      '2026-10-16T05:59:59.000Z',
    );
  });
});

describe('cargo devuelto', () => {
  const charge = (overrides: Record<string, unknown> = {}) => ({
    id: 'ch_1',
    amount: 14_900,
    amount_refunded: 14_900,
    refunded: true,
    currency: 'mxn',
    customer: 'cus_1',
    payment_intent: 'pi_1',
    ...overrides,
  });

  it('uno completo trae el cliente, el PaymentIntent y el monto', () => {
    expect(refundedCharge(charge(), context())).toEqual({
      customerId: 'cus_1',
      notice: expect.objectContaining({
        kind: 'refunded',
        purpose: 'subscription',
        paymentIntentId: 'pi_1',
        providerPaymentId: null,
        amountMxn: 149,
        userId: null,
      }) as unknown,
    });
  });

  it('uno parcial, sin cliente o de otra moneda se ignora', () => {
    expect(
      refundedCharge(charge({ refunded: false, amount_refunded: 5_000 }), context()),
    ).toBeNull();
    expect(refundedCharge(charge({ customer: null }), context())).toBeNull();
    expect(refundedCharge(charge({ currency: 'usd' }), context())).toBeNull();
    expect(refundedCharge(charge({ amount: 0 }), context())).toBeNull();
  });
});
