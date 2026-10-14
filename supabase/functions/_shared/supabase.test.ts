import { describe, expect, it } from 'vitest';
import type { ChargeNotice, SubscriptionNotice, TrialEndingNotice } from './billingTypes.ts';
import {
  applyChargeViaRest,
  applySubscriptionStateViaRest,
  authenticateUser,
  checkoutContextViaRest,
  claimBillingActionsViaRest,
  finishBillingActionViaRest,
  linkCustomerViaRest,
  noteTrialWillEndViaRest,
  parseCheckoutContext,
  userOfCustomerViaRest,
} from './supabase.ts';

const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

const env = {
  url: 'https://proyecto.supabase.co',
  anonKey: 'anon-de-prueba',
  serviceKey: 'servicio-de-prueba',
};
const USER = '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f';

function recorder(reply: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(reply());
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('quién es el usuario del token', () => {
  it('lo pregunta a Supabase con la llave pública y el token del alumno', async () => {
    const { calls, fetchImpl } = recorder(
      () => new Response(JSON.stringify({ id: 'u1', email: 'a@x.mx' })),
    );
    expect(await authenticateUser(env, 'Bearer token-del-alumno', fetchImpl)).toEqual({
      id: 'u1',
      email: 'a@x.mx',
    });
    const headers = new Headers(calls[0]?.init?.headers);
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/auth/v1/user');
    expect(headers.get('apikey')).toBe('anon-de-prueba');
    expect(headers.get('authorization')).toBe('Bearer token-del-alumno');
  });

  it('sin token, con un token que Supabase no reconoce o con respuestas raras devuelve null', async () => {
    const { fetchImpl } = recorder(() => new Response('{}', { status: 401 }));
    expect(await authenticateUser(env, null, fetchImpl)).toBeNull();
    expect(await authenticateUser(env, 'Basic xyz', fetchImpl)).toBeNull();
    expect(await authenticateUser(env, 'Bearer malo', fetchImpl)).toBeNull();
    expect(
      await authenticateUser(env, 'Bearer x', recorder(() => new Response('{}')).fetchImpl),
    ).toBeNull();
    expect(
      await authenticateUser(env, 'Bearer x', recorder(() => new Response('null')).fetchImpl),
    ).toBeNull();
    expect(
      await authenticateUser(
        env,
        'Bearer x',
        recorder(() => new Response('{"id":"u","email":5}')).fetchImpl,
      ),
    ).toEqual({ id: 'u', email: null });
  });
});

describe('clientes de Stripe por REST', () => {
  it('liga al alumno con su cliente usando la llave de servicio', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(JSON.stringify('linked')));
    await linkCustomerViaRest(env, { userId: USER, customerId: 'cus_1' }, fetchImpl);
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/record_billing_customer');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(
      'Bearer servicio-de-prueba',
    );
    expect(JSON.parse(bodyText(calls[0]?.init))).toEqual({
      p_provider: 'stripe',
      p_customer_id: 'cus_1',
      p_user: USER,
    });
  });

  it('busca el alumno de un cliente', async () => {
    const user = recorder(() => new Response(JSON.stringify('u1')));
    expect(await userOfCustomerViaRest(env, 'cus_1', user.fetchImpl)).toBe('u1');
    expect(user.calls[0]?.url).toContain('/rpc/billing_user_of_customer');
    expect(JSON.parse(bodyText(user.calls[0]?.init))).toEqual({
      p_provider: 'stripe',
      p_customer_id: 'cus_1',
    });
  });

  it('sin resultado devuelve null y si la base falla lanza', async () => {
    const empty = recorder(() => new Response('null'));
    expect(await userOfCustomerViaRest(env, 'cus_x', empty.fetchImpl)).toBeNull();
    const broken = recorder(() => new Response('x', { status: 500 }));
    await expect(userOfCustomerViaRest(env, 'cus_1', broken.fetchImpl)).rejects.toThrow('500');
    await expect(
      linkCustomerViaRest(env, { userId: 'u1', customerId: 'c' }, broken.fetchImpl),
    ).rejects.toThrow('500');
  });
});

// Contrato con las funciones de la base de B10 (6.5 del diseño). Cada llamada manda los nombres de
// parámetros exactos de las migraciones 20261022000001 a 20261022000003

describe('contexto del pago por REST', () => {
  const context = {
    inForce: 'subscription',
    subscription: {
      plan: 'founder',
      status: 'trialing',
      provider: 'stripe',
      subscriptionId: 'sub_1',
      periodEnd: '2026-10-21T16:00:00+00:00',
      cancelAtPeriodEnd: false,
    },
    passEnd: null,
    trialAvailable: false,
    trialDays: 7,
    founderOpen: true,
    founderSeatsLeft: 63,
    founderLost: false,
    oxxoExpiresDays: 3,
    customerId: 'cus_1',
    flags: { cashPasses: true, mercadoPago: false },
  };

  it('pide checkout_context con la llave de servicio y el alumno', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(JSON.stringify(context)));
    expect(await checkoutContextViaRest(env, USER, fetchImpl)).toEqual(context);
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/checkout_context');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(
      'Bearer servicio-de-prueba',
    );
    expect(JSON.parse(bodyText(calls[0]?.init))).toEqual({ p_user: USER });
  });

  it('las banderas solo se prenden con true y sin ellas cuentan como apagadas', () => {
    const { flags: _flags, ...withoutFlags } = context;
    expect(parseCheckoutContext(withoutFlags).flags).toEqual({
      cashPasses: false,
      mercadoPago: false,
    });
    expect(
      parseCheckoutContext({ ...context, flags: { cashPasses: 'true', mercadoPago: 1 } }).flags,
    ).toEqual({ cashPasses: false, mercadoPago: false });
    expect(parseCheckoutContext({ ...context, flags: [true] }).flags).toEqual({
      cashPasses: false,
      mercadoPago: false,
    });
  });

  it('sin suscripción ni cliente los deja en null', () => {
    expect(
      parseCheckoutContext({ ...context, inForce: null, subscription: null, customerId: null }),
    ).toMatchObject({ inForce: null, subscription: null, customerId: null });
  });

  it('si la base falla o la forma no es la esperada lanza, para no abrir un pago a ciegas', async () => {
    await expect(
      checkoutContextViaRest(
        env,
        USER,
        recorder(() => new Response('x', { status: 500 })).fetchImpl,
      ),
    ).rejects.toThrow('500');
    for (const broken of [
      null,
      [],
      { ...context, inForce: 'otro' },
      { ...context, trialAvailable: 'sí' },
      { ...context, founderSeatsLeft: null },
      { ...context, passEnd: 'no es fecha' },
      { ...context, subscription: { status: 'active' } },
    ]) {
      expect(() => parseCheckoutContext(broken)).toThrow();
    }
  });
});

describe('cobros y estados por REST', () => {
  const charge: ChargeNotice = {
    provider: 'stripe',
    eventId: 'evt_1',
    payload: { id: 'evt_1' },
    kind: 'paid',
    userId: USER,
    purpose: 'pass',
    plan: 'annual',
    method: 'oxxo',
    providerPaymentId: 'pi_1',
    paymentIntentId: 'pi_1',
    providerSubscriptionId: null,
    amountMxn: 1349.1,
    discountMxn: 149.9,
    promotionCode: 'PRUEBA10',
    periodEnd: null,
    expiresAt: '2026-10-12T05:59:59.000Z',
  };
  const state: SubscriptionNotice = {
    provider: 'stripe',
    eventId: 'evt_2',
    eventAt: '2026-10-08T16:00:00.000Z',
    payload: { id: 'evt_2' },
    userId: USER,
    subscriptionId: 'sub_1',
    plan: 'founder',
    status: 'trialing',
    periodEnd: '2026-10-15T16:00:00.000Z',
    trialEnd: '2026-10-15T16:00:00.000Z',
    cancelAtPeriodEnd: false,
    scheduledChange: false,
    priceId: 'price_1',
    promotionCode: null,
  };
  const trial: TrialEndingNotice = {
    provider: 'stripe',
    eventId: 'evt_3',
    payload: { id: 'evt_3' },
    userId: USER,
    subscriptionId: 'sub_1',
    trialEnd: '2026-10-15T16:00:00.000Z',
  };

  it('apply_charge recibe cada campo con su nombre', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(JSON.stringify('applied')));
    expect(await applyChargeViaRest(env, charge, fetchImpl)).toBe('applied');
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/apply_charge');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('apikey')).toBe('servicio-de-prueba');
    expect(headers.get('authorization')).toBe('Bearer servicio-de-prueba');
    expect(JSON.parse(bodyText(calls[0]?.init))).toEqual({
      p_provider: 'stripe',
      p_event_id: 'evt_1',
      p_payload: { id: 'evt_1' },
      p_kind: 'paid',
      p_user: USER,
      p_purpose: 'pass',
      p_plan: 'annual',
      p_method: 'oxxo',
      p_provider_payment_id: 'pi_1',
      p_payment_intent_id: 'pi_1',
      p_provider_subscription_id: null,
      p_amount_mxn: 1349.1,
      p_discount_mxn: 149.9,
      p_promotion_code: 'PRUEBA10',
      p_period_end: null,
      p_expires_at: '2026-10-12T05:59:59.000Z',
    });
  });

  it('apply_subscription_state recibe cada campo con su nombre', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(JSON.stringify('stale')));
    expect(await applySubscriptionStateViaRest(env, state, fetchImpl)).toBe('stale');
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/apply_subscription_state');
    expect(JSON.parse(bodyText(calls[0]?.init))).toEqual({
      p_provider: 'stripe',
      p_event_id: 'evt_2',
      p_event_at: '2026-10-08T16:00:00.000Z',
      p_payload: { id: 'evt_2' },
      p_user: USER,
      p_subscription_id: 'sub_1',
      p_plan: 'founder',
      p_status: 'trialing',
      p_period_end: '2026-10-15T16:00:00.000Z',
      p_trial_end: '2026-10-15T16:00:00.000Z',
      p_cancel_at_period_end: false,
      p_scheduled_change: false,
      p_price_id: 'price_1',
      p_promotion_code: null,
    });
  });

  it('note_trial_will_end recibe cada campo con su nombre', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(JSON.stringify('queued')));
    expect(await noteTrialWillEndViaRest(env, trial, fetchImpl)).toBe('queued');
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/note_trial_will_end');
    expect(JSON.parse(bodyText(calls[0]?.init))).toEqual({
      p_provider: 'stripe',
      p_event_id: 'evt_3',
      p_payload: { id: 'evt_3' },
      p_user: USER,
      p_subscription_id: 'sub_1',
      p_trial_end: '2026-10-15T16:00:00.000Z',
    });
  });

  it('las tres lanzan si la base falla o no devuelve un texto', async () => {
    const broken = recorder(() => new Response('x', { status: 500 })).fetchImpl;
    const odd = recorder(() => new Response('{"a":1}')).fetchImpl;
    await expect(applyChargeViaRest(env, charge, broken)).rejects.toThrow('500');
    await expect(applySubscriptionStateViaRest(env, state, broken)).rejects.toThrow('500');
    await expect(noteTrialWillEndViaRest(env, trial, broken)).rejects.toThrow('500');
    await expect(applyChargeViaRest(env, charge, odd)).rejects.toThrow('texto');
  });
});

describe('acciones con la pasarela por REST', () => {
  it('toma las acciones de una pasarela y descarta filas que no entiende', async () => {
    const { calls, fetchImpl } = recorder(
      () =>
        new Response(
          JSON.stringify([
            {
              id: 'a1',
              provider: 'stripe',
              kind: 'cancel_subscription',
              target: 'sub_2',
              reason: 'trial_duplicate',
              status: 'pending',
              attempts: 1,
            },
            {
              id: 'a2',
              provider: 'paypal',
              kind: 'cancel_subscription',
              target: 'x',
              reason: 'refund',
            },
            { id: 'a3', provider: 'stripe', kind: 'otra', target: 'x', reason: 'refund' },
          ]),
        ),
    );
    expect(
      await claimBillingActionsViaRest(env, { limit: 5, provider: 'stripe' }, fetchImpl),
    ).toEqual([
      {
        id: 'a1',
        provider: 'stripe',
        kind: 'cancel_subscription',
        target: 'sub_2',
        reason: 'trial_duplicate',
        attempts: 1,
      },
    ]);
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/claim_billing_actions');
    expect(JSON.parse(bodyText(calls[0]?.init))).toEqual({ p_limit: 5, p_provider: 'stripe' });
  });

  it('cierra una acción sin leer la respuesta, también si la base contesta 204', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(null, { status: 204 }));
    await finishBillingActionViaRest(env, { id: 'a1', ok: false, error: 'Stripe 500' }, fetchImpl);
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/finish_billing_action');
    expect(JSON.parse(bodyText(calls[0]?.init))).toEqual({
      p_id: 'a1',
      p_ok: false,
      p_error: 'Stripe 500',
    });
  });

  it('lanzan si la base falla o la respuesta no es una lista', async () => {
    const broken = recorder(() => new Response('x', { status: 500 })).fetchImpl;
    await expect(
      claimBillingActionsViaRest(env, { limit: 5, provider: null }, broken),
    ).rejects.toThrow('500');
    await expect(
      finishBillingActionViaRest(env, { id: 'a1', ok: true, error: null }, broken),
    ).rejects.toThrow('500');
    await expect(
      claimBillingActionsViaRest(
        env,
        { limit: 5, provider: null },
        recorder(() => new Response('{}')).fetchImpl,
      ),
    ).rejects.toThrow('lista');
  });
});
