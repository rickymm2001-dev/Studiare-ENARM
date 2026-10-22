import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
  type AnalyticsRecord,
} from '../analytics/catalog';
import { newId, testApi } from '../testing/fixtures';
import { cancelMercadoPagoSubscription } from './cancel';
import {
  checkoutRequestFor,
  isAllowedCheckoutUrl,
  measuredMethodOf,
  startCheckout,
  trackCheckoutStarted,
  walletCheckoutRequestFor,
  type CheckoutFailureResult,
  type CheckoutRequest,
  type HostedCheckoutResult,
  type WalletCheckoutResult,
} from './checkout';
import { isAllowedPortalUrl, openBillingPortal } from './portal';
import {
  CloudPlanSchema,
  fetchCloudPlan,
  mirrorCloudPlan,
  refreshCloudPlan,
  subscriptionFromCloud,
  type CloudPlan,
} from './cloudPlan';

interface Reply {
  data?: unknown;
  error?: unknown;
}

function fakeCloud(options: { rpc?: Reply; invoke?: Reply | (() => never) }) {
  const calls: { rpc: string[]; invoke: [string, unknown][] } = { rpc: [], invoke: [] };
  const cloud = {
    rpc: (name: string) => {
      calls.rpc.push(name);
      return Promise.resolve({
        data: options.rpc?.data ?? null,
        error: options.rpc?.error ?? null,
      });
    },
    functions: {
      invoke: (name: string, init: unknown) => {
        calls.invoke.push([name, init]);
        if (typeof options.invoke === 'function') return options.invoke();
        return Promise.resolve({
          data: options.invoke?.data ?? null,
          error: options.invoke?.error ?? null,
        });
      },
    },
  } as unknown as SupabaseClient;
  return { cloud, calls };
}

const withBody = (body: unknown, status: number) => ({
  error: { context: new Response(JSON.stringify(body), { status }) },
});

/** Lo que devuelve my_plan v2, leído con el mismo esquema que la app */
const cloudPlan = (raw: Record<string, unknown>): CloudPlan => CloudPlanSchema.parse(raw);

describe('dirección de pago', () => {
  it('solo acepta https en los dominios de la pasarela elegida', () => {
    expect(isAllowedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_1', 'stripe')).toBe(
      true,
    );
    expect(
      isAllowedCheckoutUrl(
        'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1',
        'mercadopago',
      ),
    ).toBe(true);
    expect(isAllowedCheckoutUrl('https://sandbox.mercadopago.com/checkout', 'mercadopago')).toBe(
      true,
    );
    expect(isAllowedCheckoutUrl('https://mercadopago.com/x', 'mercadopago')).toBe(true);
  });

  it('rechaza otros dominios, http, credenciales, imitaciones y direcciones rotas', () => {
    expect(isAllowedCheckoutUrl('http://checkout.stripe.com/x', 'stripe')).toBe(false);
    expect(isAllowedCheckoutUrl('https://checkout.stripe.com.malo.example/x', 'stripe')).toBe(
      false,
    );
    expect(isAllowedCheckoutUrl('https://malo.example/checkout.stripe.com', 'stripe')).toBe(false);
    expect(isAllowedCheckoutUrl('https://usuario:clave@checkout.stripe.com/x', 'stripe')).toBe(
      false,
    );
    expect(isAllowedCheckoutUrl('https://notmercadopago.com/x', 'mercadopago')).toBe(false);
    expect(isAllowedCheckoutUrl('https://checkout.stripe.com/x', 'mercadopago')).toBe(false);
    expect(isAllowedCheckoutUrl('javascript:alert(1)', 'stripe')).toBe(false);
    expect(isAllowedCheckoutUrl('no es una url', 'stripe')).toBe(false);
  });
});

describe('portal de facturación', () => {
  it('solo se abre una dirección https del portal de Stripe', () => {
    expect(isAllowedPortalUrl('https://billing.stripe.com/p/session/test_1')).toBe(true);
    expect(isAllowedPortalUrl('http://billing.stripe.com/p/session/test_1')).toBe(false);
    expect(isAllowedPortalUrl('https://billing.stripe.com.malo.example/x')).toBe(false);
    expect(isAllowedPortalUrl('https://checkout.stripe.com/c/pay/cs_1')).toBe(false);
    expect(isAllowedPortalUrl('https://usuario:clave@billing.stripe.com/x')).toBe(false);
    expect(isAllowedPortalUrl('no es una url')).toBe(false);
  });

  it('pide la dirección al servidor sin mandar ningún cliente', async () => {
    const { cloud, calls } = fakeCloud({
      invoke: { data: { url: 'https://billing.stripe.com/p/session/test_1' } },
    });
    expect(await openBillingPortal(cloud)).toEqual({
      ok: true,
      url: 'https://billing.stripe.com/p/session/test_1',
    });
    expect(calls.invoke).toEqual([['create-portal-session', { body: {} }]]);
  });

  it('con un flujo abre directo en cambiar de plan o en cancelar (B10)', async () => {
    const { cloud, calls } = fakeCloud({
      invoke: { data: { url: 'https://billing.stripe.com/p/session/test_2' } },
    });
    expect(await openBillingPortal(cloud, { flow: 'update' })).toEqual({
      ok: true,
      url: 'https://billing.stripe.com/p/session/test_2',
    });
    await openBillingPortal(cloud, { flow: 'cancel' });
    expect(calls.invoke).toEqual([
      ['create-portal-session', { body: { flow: 'update' } }],
      ['create-portal-session', { body: { flow: 'cancel' } }],
    ]);
  });

  it('no abre una dirección que no es del portal', async () => {
    const { cloud } = fakeCloud({ invoke: { data: { url: 'https://malo.example/portal' } } });
    expect(await openBillingPortal(cloud)).toEqual({ ok: false, reason: 'unsafe_url' });
  });

  it('traduce los errores del servidor', async () => {
    expect(
      await openBillingPortal(fakeCloud({ invoke: withBody({ error: 'no_customer' }, 404) }).cloud),
    ).toEqual({ ok: false, reason: 'no_customer' });
    expect(
      await openBillingPortal(
        fakeCloud({ invoke: withBody({ error: 'not_configured' }, 503) }).cloud,
      ),
    ).toEqual({ ok: false, reason: 'not_configured' });
    // La suscripción es de Mercado Pago, que se cancela en la app (B10)
    expect(
      await openBillingPortal(fakeCloud({ invoke: withBody({ error: 'mercadopago' }, 409) }).cloud),
    ).toEqual({ ok: false, reason: 'mercadopago' });
    expect(
      await openBillingPortal(fakeCloud({ invoke: withBody({ error: 'provider' }, 502) }).cloud),
    ).toEqual({ ok: false, reason: 'failed' });
    expect(
      await openBillingPortal(fakeCloud({ invoke: { error: new Error('red') } }).cloud),
    ).toEqual({ ok: false, reason: 'failed' });
    expect(await openBillingPortal(fakeCloud({ invoke: { data: {} } }).cloud)).toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('una excepción es un fallo y no tira la pantalla', async () => {
    const { cloud } = fakeCloud({
      invoke: () => {
        throw new Error('sin red');
      },
    });
    expect(await openBillingPortal(cloud)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('iniciar el pago', () => {
  const CARD: CheckoutRequest = {
    plan: 'founder',
    provider: 'stripe',
    mode: 'subscription',
    expectTrial: true,
  };

  it('pide la sesión al servidor con el plan, la forma de pago y la prueba que se avisó, sin precios ni usuario', async () => {
    const { cloud, calls } = fakeCloud({
      invoke: {
        data: { url: 'https://checkout.stripe.com/c/pay/cs_1', mode: 'subscription', trial: true },
      },
    });
    expect(await startCheckout(cloud, CARD)).toEqual({
      ok: true,
      url: 'https://checkout.stripe.com/c/pay/cs_1',
      trial: true,
    });
    await startCheckout(cloud, {
      plan: 'monthly',
      provider: 'stripe',
      mode: 'pass',
      method: 'oxxo',
      expectTrial: false,
    });
    expect(calls.invoke).toEqual([
      [
        'create-checkout',
        { body: { plan: 'founder', provider: 'stripe', mode: 'subscription', expectTrial: true } },
      ],
      [
        'create-checkout',
        {
          body: {
            plan: 'monthly',
            provider: 'stripe',
            mode: 'pass',
            method: 'oxxo',
            expectTrial: false,
          },
        },
      ],
    ]);
  });

  it('solo la tarjeta lleva el precio Fundador y la prueba. Pases y Mercado Pago van con el plan regular', () => {
    expect(checkoutRequestFor('card', 'founder', true)).toEqual(CARD);
    expect(checkoutRequestFor('card', 'founder_annual', false)).toEqual({
      plan: 'founder_annual',
      provider: 'stripe',
      mode: 'subscription',
      expectTrial: false,
    });
    expect(checkoutRequestFor('oxxo', 'founder', true)).toEqual({
      plan: 'monthly',
      provider: 'stripe',
      mode: 'pass',
      method: 'oxxo',
      expectTrial: false,
    });
    expect(checkoutRequestFor('spei', 'founder_annual', true)).toEqual({
      plan: 'annual',
      provider: 'stripe',
      mode: 'pass',
      method: 'spei',
      expectTrial: false,
    });
    expect(checkoutRequestFor('mercadopago', 'founder', true)).toEqual({
      plan: 'monthly',
      provider: 'mercadopago',
      mode: 'subscription',
      expectTrial: false,
    });
    expect(checkoutRequestFor('mercadopago_pass', 'founder_annual', true)).toEqual({
      plan: 'annual',
      provider: 'mercadopago',
      mode: 'pass',
      expectTrial: false,
    });
  });

  it('no abre una dirección que no es de la pasarela elegida', async () => {
    const { cloud } = fakeCloud({ invoke: { data: { url: 'https://malo.example/pagar' } } });
    expect(await startCheckout(cloud, CARD)).toEqual({ ok: false, reason: 'unsafe_url' });
    const stripeForMp = fakeCloud({ invoke: { data: { url: 'https://checkout.stripe.com/x' } } });
    expect(
      await startCheckout(stripeForMp.cloud, checkoutRequestFor('mercadopago', 'monthly', false)),
    ).toEqual({ ok: false, reason: 'unsafe_url' });
  });

  it('traduce cada código de create-checkout, con los datos que trae el 409', async () => {
    const reply = (body: unknown, status: number) =>
      startCheckout(fakeCloud({ invoke: withBody(body, status) }).cloud, CARD);
    for (const code of ['founder_full', 'founder_lost', 'already_subscribed'] as const) {
      expect(await reply({ error: code }, 409), code).toEqual({ ok: false, reason: code });
    }
    expect(
      await reply({ error: 'pass_in_force', passEnd: '2026-11-20T00:00:00.000Z' }, 409),
    ).toEqual({ ok: false, reason: 'pass_in_force', passEnd: '2026-11-20T00:00:00.000Z' });
    expect(await reply({ error: 'pass_in_force' }, 409)).toEqual({
      ok: false,
      reason: 'pass_in_force',
      passEnd: null,
    });
    expect(await reply({ error: 'trial_mismatch', trialAvailable: false }, 409)).toEqual({
      ok: false,
      reason: 'trial_mismatch',
      trialAvailable: false,
    });
    expect(await reply({ error: 'not_configured' }, 503)).toEqual({
      ok: false,
      reason: 'not_configured',
    });
    expect(await reply({ error: 'provider' }, 502)).toEqual({ ok: false, reason: 'failed' });
    expect(await reply({ error: 'invalid' }, 400)).toEqual({ ok: false, reason: 'failed' });
    expect(
      await startCheckout(fakeCloud({ invoke: { error: new Error('red') } }).cloud, CARD),
    ).toEqual({ ok: false, reason: 'failed' });
    expect(
      await startCheckout(
        fakeCloud({ invoke: { error: { context: new Response('no es json') } } }).cloud,
        CARD,
      ),
    ).toEqual({ ok: false, reason: 'failed' });
  });

  it('una respuesta sin dirección o una excepción son un fallo, no un cierre', async () => {
    expect(await startCheckout(fakeCloud({ invoke: { data: {} } }).cloud, CARD)).toEqual({
      ok: false,
      reason: 'failed',
    });
    const throwing = fakeCloud({
      invoke: () => {
        throw new Error('boom');
      },
    });
    expect(await startCheckout(throwing.cloud, CARD)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('contrato de las billeteras (B17, 9.6)', () => {
  const CARD: CheckoutRequest = {
    plan: 'monthly',
    provider: 'stripe',
    mode: 'subscription',
    expectTrial: false,
  };

  it('sin ui el resultado es siempre el hospedado, que no trae kind ni clientSecret', async () => {
    const { cloud } = fakeCloud({
      invoke: { data: { url: 'https://checkout.stripe.com/c/pay/cs_1', trial: false } },
    });
    // Si el tipo de retorno trajera la variante wallet, result.url no compilaría
    const result: HostedCheckoutResult | CheckoutFailureResult = await startCheckout(cloud, CARD);
    expect(result).toEqual({
      ok: true,
      url: 'https://checkout.stripe.com/c/pay/cs_1',
      trial: false,
    });
    expect(result.ok && result.kind).toBeUndefined();
    const hosted = await startCheckout(cloud, { ...CARD, ui: 'hosted' });
    if (hosted.ok) expect(hosted.url).toBe('https://checkout.stripe.com/c/pay/cs_1');
  });

  it('con ui wallet manda ui, valida { clientSecret, trial } y devuelve la variante wallet sin tocar la dirección', async () => {
    const { cloud, calls } = fakeCloud({
      invoke: { data: { clientSecret: 'cs_test_a1b2c3_secret_d4e5f6', trial: true } },
    });
    const result: WalletCheckoutResult | CheckoutFailureResult = await startCheckout(
      cloud,
      walletCheckoutRequestFor('founder', true),
    );
    expect(result).toEqual({
      ok: true,
      kind: 'wallet',
      clientSecret: 'cs_test_a1b2c3_secret_d4e5f6',
      trial: true,
    });
    expect(calls.invoke).toEqual([
      [
        'create-checkout',
        {
          body: {
            plan: 'founder',
            provider: 'stripe',
            mode: 'subscription',
            expectTrial: true,
            ui: 'wallet',
          },
        },
      ],
    ]);
    // La pantalla de pago hospedada nunca manda ui
    const hosted = fakeCloud({
      invoke: { data: { url: 'https://checkout.stripe.com/c/pay/cs_1' } },
    });
    await startCheckout(hosted.cloud, { ...CARD, ui: 'hosted' });
    expect(hosted.calls.invoke[0]?.[1]).toEqual({
      body: { plan: 'monthly', provider: 'stripe', mode: 'subscription', expectTrial: false },
    });
  });

  it('la respuesta wallet que no tiene la forma pedida es un fallo, también si trae una dirección', async () => {
    for (const data of [
      {},
      null,
      { trial: true },
      { clientSecret: 'cs_test_a1b2c3_secret_d4e5f6' },
      { clientSecret: 'cs_test_a1b2c3_secret_d4e5f6', trial: 'si' },
      { clientSecret: '', trial: true },
      { clientSecret: 'pi_123_secret_456', trial: true },
      { clientSecret: 'cs_con espacio', trial: true },
      { clientSecret: 'cs_corto', trial: true },
      { url: 'https://checkout.stripe.com/c/pay/cs_1', trial: true },
    ]) {
      const { cloud } = fakeCloud({ invoke: { data } });
      expect(await startCheckout(cloud, { ...CARD, ui: 'wallet' }), JSON.stringify(data)).toEqual({
        ok: false,
        reason: 'failed',
      });
    }
  });

  it('con ui wallet traduce los errores como el pago hospedado y nunca lanza', async () => {
    const wallet = { ...CARD, ui: 'wallet' } as const;
    const reply = (body: unknown, status: number) =>
      startCheckout(fakeCloud({ invoke: withBody(body, status) }).cloud, wallet);
    expect(await reply({ error: 'trial_mismatch', trialAvailable: false }, 409)).toEqual({
      ok: false,
      reason: 'trial_mismatch',
      trialAvailable: false,
    });
    expect(await reply({ error: 'already_subscribed' }, 409)).toEqual({
      ok: false,
      reason: 'already_subscribed',
    });
    expect(await reply({ error: 'founder_full' }, 409)).toEqual({
      ok: false,
      reason: 'founder_full',
    });
    expect(await reply({ error: 'not_configured' }, 503)).toEqual({
      ok: false,
      reason: 'not_configured',
    });
    expect(await reply({ error: 'provider' }, 502)).toEqual({ ok: false, reason: 'failed' });
    const throwing = fakeCloud({
      invoke: () => {
        throw new Error('boom');
      },
    });
    expect(await startCheckout(throwing.cloud, wallet)).toEqual({ ok: false, reason: 'failed' });
  });

  it('walletCheckoutRequestFor es la tarjeta con Stripe de siempre, con el plan Fundador y la prueba', () => {
    expect(walletCheckoutRequestFor('founder_annual', true)).toEqual({
      plan: 'founder_annual',
      provider: 'stripe',
      mode: 'subscription',
      expectTrial: true,
      ui: 'wallet',
    });
    expect(walletCheckoutRequestFor('monthly', false)).toEqual({
      ...checkoutRequestFor('card', 'monthly', false),
      ui: 'wallet',
    });
  });
});

describe('medir el botón de pagar (B15, 1.5)', () => {
  afterEach(() => {
    resetAnalytics();
  });
  const watch = () => {
    const seen: AnalyticsRecord[] = [];
    setAnalyticsSink((record) => seen.push(record));
    return seen;
  };
  const failing = () => fakeCloud({ invoke: { error: new Error('red') } }).cloud;

  it('con permiso manda el plan, la forma de pago y si llevaba prueba, y nada más', async () => {
    const seen = watch();
    setAnalyticsConsent(true);
    await startCheckout(failing(), checkoutRequestFor('card', 'founder', true));
    await startCheckout(failing(), checkoutRequestFor('oxxo', 'annual', false));
    await startCheckout(failing(), checkoutRequestFor('mercadopago_pass', 'monthly', false));
    expect(seen.map((record) => [record.event, record.properties])).toEqual([
      ['checkout_started', { plan: 'founder', method: 'card', with_trial: true }],
      ['checkout_started', { plan: 'annual', method: 'oxxo', with_trial: false }],
      ['checkout_started', { plan: 'monthly', method: 'mercadopago', with_trial: false }],
    ]);
  });

  it('pedir la sesión de las billeteras no mide nada, y tocar la billetera sí, como tarjeta', async () => {
    const seen = watch();
    setAnalyticsConsent(true);
    await startCheckout(failing(), walletCheckoutRequestFor('monthly', true));
    expect(seen).toEqual([]);
    trackCheckoutStarted(walletCheckoutRequestFor('founder', true));
    expect(seen.map((record) => [record.event, record.properties])).toEqual([
      ['checkout_started', { plan: 'founder', method: 'card', with_trial: true }],
    ]);
  });

  it('sin permiso, o sin saber si lo hay, no manda nada y el pago sigue igual', async () => {
    const seen = watch();
    await startCheckout(failing(), checkoutRequestFor('card', 'monthly', true));
    setAnalyticsConsent(false);
    expect(await startCheckout(failing(), checkoutRequestFor('spei', 'monthly', false))).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(seen).toEqual([]);
  });

  it('cada forma de pago se mide con las cuatro de la lista', () => {
    const options = ['card', 'oxxo', 'spei', 'mercadopago', 'mercadopago_pass'] as const;
    expect(
      options.map((option) => measuredMethodOf(checkoutRequestFor(option, 'founder', true))),
    ).toEqual(['card', 'oxxo', 'spei', 'mercadopago', 'mercadopago']);
  });
});

describe('cancelar la suscripción de Mercado Pago', () => {
  it('llama a cancel-subscription sin mandar ninguna suscripción y dice hasta cuándo vale', async () => {
    const { cloud, calls } = fakeCloud({
      invoke: { data: { status: 'canceled', periodEnd: '2026-11-14T00:00:00.000Z' } },
    });
    expect(await cancelMercadoPagoSubscription(cloud)).toEqual({
      ok: true,
      periodEnd: '2026-11-14T00:00:00.000Z',
    });
    expect(calls.invoke).toEqual([['cancel-subscription', { body: {} }]]);
  });

  it('traduce sus errores y nunca lanza', async () => {
    const reply = (invoke: Reply | (() => never)) =>
      cancelMercadoPagoSubscription(fakeCloud({ invoke }).cloud);
    expect(await reply(withBody({ error: 'no_subscription' }, 404))).toEqual({
      ok: false,
      reason: 'no_subscription',
    });
    expect(await reply(withBody({ error: 'not_configured' }, 503))).toEqual({
      ok: false,
      reason: 'not_configured',
    });
    expect(await reply(withBody({ error: 'provider' }, 502))).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(await reply({ data: { status: 'otro' } })).toEqual({ ok: false, reason: 'failed' });
    expect(
      await reply(() => {
        throw new Error('sin red');
      }),
    ).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('plan de la nube', () => {
  const disposers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    await Promise.all(disposers.splice(0).map((dispose) => dispose()));
  });
  const apiFor = () => {
    const api = testApi('real');
    disposers.push(() => api.dispose());
    return api;
  };
  const monthly = cloudPlan({
    plan: 'monthly',
    source: 'payment',
    status: 'active',
    provider: 'stripe',
    periodEnd: '2026-11-08T00:00:00+00:00',
    trialAvailable: false,
  });

  it('lee el plan que devuelve la función del servidor, con las fechas en UTC', async () => {
    const read = await fetchCloudPlan(fakeCloud({ rpc: { data: monthly } }).cloud);
    expect(read).toMatchObject({
      plan: 'monthly',
      source: 'payment',
      status: 'active',
      provider: 'stripe',
      periodEnd: '2026-11-08T00:00:00.000Z',
    });
    // my_plan de antes de B10 solo manda cinco campos y se sigue leyendo
    expect(
      await fetchCloudPlan(
        fakeCloud({
          rpc: {
            data: {
              plan: 'founder',
              source: 'payment',
              status: 'active',
              provider: 'stripe',
              periodEnd: null,
            },
          },
        }).cloud,
      ),
    ).toMatchObject({ plan: 'founder', source: 'payment', status: 'active' });
    expect(await fetchCloudPlan(fakeCloud({ rpc: { data: null } }).cloud)).toBeNull();
    expect(await fetchCloudPlan(fakeCloud({ rpc: { error: { code: '42501' } } }).cloud)).toBeNull();
    expect(
      await fetchCloudPlan({
        rpc: () => Promise.reject(new Error('red')),
      } as unknown as SupabaseClient),
    ).toBeNull();
  });

  it('tolera valores que no conoce. Un plan desconocido es Gratis y lo demás se ignora (8.18)', async () => {
    const read = await fetchCloudPlan(
      fakeCloud({
        rpc: {
          data: {
            plan: 'platino',
            source: 'regalo',
            status: 'pausada',
            provider: 'paypal',
            periodEnd: 'mañana',
            pendingPayment: { method: 'cheque', amountMxn: 1, createdAt: 'hoy' },
            issue: 'otro',
            trialAvailable: 'sí',
          },
        },
      }).cloud,
    );
    expect(read).toMatchObject({ plan: 'free', status: 'pausada' });
    expect(read?.source).toBeUndefined();
    expect(read?.provider).toBeUndefined();
    expect(read?.periodEnd).toBeUndefined();
    expect(read?.pendingPayment).toBeUndefined();
    expect(read?.issue).toBeUndefined();
    expect(read?.trialAvailable).toBeUndefined();
    // Y el espejo sigue escribiendo una suscripción válida
    expect(subscriptionFromCloud(newId(), read as CloudPlan)).toMatchObject({
      plan: 'free',
      status: 'none',
    });
  });

  it('un plan de pago se refleja como activo y no simulado', () => {
    const subscription = subscriptionFromCloud(
      newId(),
      monthly,
      new Date('2026-10-08T12:00:00.000Z'),
    );
    expect(subscription).toMatchObject({
      plan: 'monthly',
      status: 'active',
      isSimulated: false,
      periodEnd: '2026-11-08T00:00:00.000Z',
      source: 'payment',
      cloudStatus: 'active',
      provider: 'stripe',
      trialAvailable: false,
    });
    const free = subscriptionFromCloud(
      newId(),
      cloudPlan({ plan: 'free', source: 'none', status: 'none' }),
    );
    expect(free).toMatchObject({ plan: 'free', status: 'none', periodEnd: null });
    expect(free).not.toHaveProperty('source');
    expect(free).not.toHaveProperty('cloudStatus');
    expect(subscriptionFromCloud(newId(), { ...monthly, source: 'referral' }).source).toBe(
      'referral',
    );
  });

  it('el espejo deja status active en cada estado vigente y guarda el detalle de my_plan v2 (B10)', () => {
    const userId = newId();
    const trialing = subscriptionFromCloud(
      userId,
      cloudPlan({
        plan: 'founder',
        source: 'payment',
        status: 'trialing',
        provider: 'stripe',
        periodEnd: '2026-10-21T15:00:00+00:00',
        trialEnd: '2026-10-21T15:00:00+00:00',
        cancelAtPeriodEnd: false,
        scheduledChange: false,
        passEnd: null,
        trialAvailable: false,
        guaranteeUntil: null,
        pendingPayment: null,
        issue: null,
      }),
    );
    expect(trialing).toMatchObject({
      plan: 'founder',
      status: 'active',
      cloudStatus: 'trialing',
      trialEnd: '2026-10-21T15:00:00.000Z',
    });
    expect(trialing).not.toHaveProperty('cancelAtPeriodEnd');
    expect(trialing).not.toHaveProperty('pendingPayment');

    const pastDue = subscriptionFromCloud(
      userId,
      cloudPlan({
        plan: 'annual',
        source: 'payment',
        status: 'past_due',
        provider: 'mercadopago',
        periodEnd: '2026-11-01T00:00:00Z',
      }),
    );
    expect(pastDue).toMatchObject({
      plan: 'annual',
      status: 'active',
      cloudStatus: 'past_due',
      provider: 'mercadopago',
    });

    const canceled = subscriptionFromCloud(
      userId,
      cloudPlan({
        plan: 'founder_annual',
        source: 'payment',
        status: 'active',
        periodEnd: '2027-10-01T00:00:00Z',
        cancelAtPeriodEnd: true,
        scheduledChange: true,
        guaranteeUntil: '2026-10-20T00:00:00Z',
      }),
    );
    expect(canceled).toMatchObject({
      plan: 'founder_annual',
      status: 'active',
      cancelAtPeriodEnd: true,
      scheduledChange: true,
      guaranteeUntil: '2026-10-20T00:00:00.000Z',
    });

    const pass = subscriptionFromCloud(
      userId,
      cloudPlan({
        plan: 'monthly',
        source: 'pass',
        status: 'canceled',
        periodEnd: '2026-12-14T00:00:00Z',
        passEnd: '2026-12-14T00:00:00Z',
        pendingPayment: {
          method: 'spei',
          plan: 'annual',
          amountMxn: 1499,
          expiresAt: null,
          createdAt: '2026-10-14T10:00:00Z',
        },
      }),
    );
    expect(pass).toMatchObject({
      plan: 'monthly',
      status: 'active',
      source: 'pass',
      passEnd: '2026-12-14T00:00:00.000Z',
      pendingPayment: {
        method: 'spei',
        plan: 'annual',
        amountMxn: 1499,
        expiresAt: null,
        createdAt: '2026-10-14T10:00:00.000Z',
      },
    });

    // Gratis con una ficha vencida conserva el aviso y la prueba disponible
    const expired = subscriptionFromCloud(
      userId,
      cloudPlan({
        plan: 'free',
        source: 'none',
        status: 'none',
        trialAvailable: true,
        issue: 'voucher_expired',
      }),
    );
    expect(expired).toMatchObject({
      plan: 'free',
      status: 'none',
      trialAvailable: true,
      issue: 'voucher_expired',
    });
  });

  it('el plan de la nube reemplaza al simulado local y no repite si no cambió', async () => {
    const api = apiFor();
    const userId = newId();
    const free = cloudPlan({ plan: 'free', source: 'none', status: 'none' });
    await api.repos.subscriptions.put({
      userId,
      plan: 'annual',
      status: 'active',
      isSimulated: true,
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(await mirrorCloudPlan(api, userId, free)).toBe(true);
    expect(await api.repos.subscriptions.get(userId)).toMatchObject({
      plan: 'free',
      isSimulated: false,
    });
    expect(await mirrorCloudPlan(api, userId, free)).toBe(false);
    expect(await mirrorCloudPlan(api, userId, monthly)).toBe(true);
    expect(await mirrorCloudPlan(api, userId, monthly)).toBe(false);
    // El mismo plan que pasa de mes regalado a pagado también se refleja
    expect(await mirrorCloudPlan(api, userId, { ...monthly, source: 'referral' })).toBe(true);
    expect(await mirrorCloudPlan(api, userId, monthly)).toBe(true);
    // Un cambio solo en el detalle de v2, como cancelar al final del periodo, también
    expect(await mirrorCloudPlan(api, userId, { ...monthly, cancelAtPeriodEnd: true })).toBe(true);
    expect(await api.repos.subscriptions.get(userId)).toMatchObject({
      plan: 'monthly',
      status: 'active',
      cancelAtPeriodEnd: true,
    });
  });

  it('refreshCloudPlan refleja el plan y nunca falla', async () => {
    const api = apiFor();
    const userId = newId();
    expect(
      await refreshCloudPlan(api, fakeCloud({ rpc: { data: monthly } }).cloud, userId),
    ).toMatchObject({ plan: 'monthly' });
    expect((await api.repos.subscriptions.get(userId))?.plan).toBe('monthly');
    expect(
      await refreshCloudPlan(
        api,
        fakeCloud({ rpc: { error: { message: 'no existe' } } }).cloud,
        userId,
      ),
    ).toBeNull();
    // Sin cambios locales cuando la nube no responde
    expect((await api.repos.subscriptions.get(userId))?.plan).toBe('monthly');
  });
});
