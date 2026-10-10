import 'fake-indexeddb/auto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import { newId, testApi } from '../testing/fixtures';
import { isAllowedCheckoutUrl, startCheckout } from './checkout';
import { isAllowedPortalUrl, openBillingPortal } from './portal';
import {
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
  const withBody = (body: unknown, status: number) => ({
    error: { context: new Response(JSON.stringify(body), { status }) },
  });

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
  it('pide la sesión al servidor con el plan y la pasarela, sin precios ni usuario', async () => {
    const { cloud, calls } = fakeCloud({
      invoke: { data: { url: 'https://checkout.stripe.com/c/pay/cs_1' } },
    });
    expect(await startCheckout(cloud, { plan: 'monthly', provider: 'stripe' })).toEqual({
      ok: true,
      url: 'https://checkout.stripe.com/c/pay/cs_1',
    });
    expect(calls.invoke).toEqual([
      ['create-checkout', { body: { plan: 'monthly', provider: 'stripe' } }],
    ]);
  });

  it('no abre una dirección que no es de la pasarela', async () => {
    const { cloud } = fakeCloud({ invoke: { data: { url: 'https://malo.example/pagar' } } });
    expect(await startCheckout(cloud, { plan: 'annual', provider: 'stripe' })).toEqual({
      ok: false,
      reason: 'unsafe_url',
    });
  });

  it('traduce los errores del servidor', async () => {
    const withBody = (body: unknown, status: number) => ({
      error: { context: new Response(JSON.stringify(body), { status }) },
    });
    expect(
      await startCheckout(fakeCloud({ invoke: withBody({ error: 'founder_full' }, 409) }).cloud, {
        plan: 'founder',
        provider: 'stripe',
      }),
    ).toEqual({ ok: false, reason: 'founder_full' });
    expect(
      await startCheckout(fakeCloud({ invoke: withBody({ error: 'not_configured' }, 503) }).cloud, {
        plan: 'monthly',
        provider: 'stripe',
      }),
    ).toEqual({ ok: false, reason: 'not_configured' });
    expect(
      await startCheckout(fakeCloud({ invoke: withBody({ error: 'provider' }, 502) }).cloud, {
        plan: 'monthly',
        provider: 'stripe',
      }),
    ).toEqual({ ok: false, reason: 'failed' });
    expect(
      await startCheckout(fakeCloud({ invoke: { error: new Error('red') } }).cloud, {
        plan: 'monthly',
        provider: 'stripe',
      }),
    ).toEqual({ ok: false, reason: 'failed' });
    expect(
      await startCheckout(
        fakeCloud({ invoke: { error: { context: new Response('no es json') } } }).cloud,
        { plan: 'monthly', provider: 'stripe' },
      ),
    ).toEqual({ ok: false, reason: 'failed' });
  });

  it('una respuesta sin dirección o una excepción son un fallo, no un cierre', async () => {
    expect(
      await startCheckout(fakeCloud({ invoke: { data: {} } }).cloud, {
        plan: 'monthly',
        provider: 'stripe',
      }),
    ).toEqual({ ok: false, reason: 'failed' });
    const throwing = fakeCloud({
      invoke: () => {
        throw new Error('boom');
      },
    });
    expect(await startCheckout(throwing.cloud, { plan: 'monthly', provider: 'stripe' })).toEqual({
      ok: false,
      reason: 'failed',
    });
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
  const monthly: CloudPlan = {
    plan: 'monthly',
    source: 'payment',
    status: 'active',
    provider: 'stripe',
    periodEnd: '2026-11-08T00:00:00.000Z',
  };

  it('lee el plan que devuelve la función del servidor', async () => {
    expect(await fetchCloudPlan(fakeCloud({ rpc: { data: monthly } }).cloud)).toEqual(monthly);
    expect(await fetchCloudPlan(fakeCloud({ rpc: { data: { plan: 'gratis' } } }).cloud)).toBeNull();
    expect(await fetchCloudPlan(fakeCloud({ rpc: { error: { code: '42501' } } }).cloud)).toBeNull();
    expect(
      await fetchCloudPlan({
        rpc: () => Promise.reject(new Error('red')),
      } as unknown as SupabaseClient),
    ).toBeNull();
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
    });
    const free = subscriptionFromCloud(newId(), { plan: 'free', source: 'none', status: 'none' });
    expect(free).toMatchObject({ plan: 'free', status: 'none', periodEnd: null });
    expect(subscriptionFromCloud(newId(), { ...monthly, periodEnd: 'ayer' }).periodEnd).toBeNull();
  });

  it('el plan de la nube reemplaza al simulado local y no repite si no cambió', async () => {
    const api = apiFor();
    const userId = newId();
    await api.repos.subscriptions.put({
      userId,
      plan: 'annual',
      status: 'active',
      isSimulated: true,
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(
      await mirrorCloudPlan(api, userId, { plan: 'free', source: 'none', status: 'none' }),
    ).toBe(true);
    expect(await api.repos.subscriptions.get(userId)).toMatchObject({
      plan: 'free',
      isSimulated: false,
    });
    expect(
      await mirrorCloudPlan(api, userId, { plan: 'free', source: 'none', status: 'none' }),
    ).toBe(false);
    expect(await mirrorCloudPlan(api, userId, monthly)).toBe(true);
    expect(await mirrorCloudPlan(api, userId, monthly)).toBe(false);
    expect(await api.repos.subscriptions.get(userId)).toMatchObject({
      plan: 'monthly',
      status: 'active',
    });
  });

  it('refreshCloudPlan refleja el plan y nunca falla', async () => {
    const api = apiFor();
    const userId = newId();
    expect(
      await refreshCloudPlan(api, fakeCloud({ rpc: { data: monthly } }).cloud, userId),
    ).toEqual(monthly);
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
