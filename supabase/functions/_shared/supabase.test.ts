import { describe, expect, it } from 'vitest';
import type { PaymentNotice } from './payments.ts';
import {
  applyNoticeViaRest,
  authenticateUser,
  customerOfUserViaRest,
  founderSeatsLeftViaRest,
  linkCustomerViaRest,
  userOfCustomerViaRest,
} from './supabase.ts';

const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

const env = {
  url: 'https://proyecto.supabase.co',
  anonKey: 'anon-de-prueba',
  serviceKey: 'servicio-de-prueba',
};
const notice: PaymentNotice = {
  provider: 'stripe',
  eventId: 'evt_1',
  kind: 'paid',
  userId: '3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f',
  plan: 'monthly',
  providerPaymentId: 'in_1',
  providerSubscriptionId: 'sub_1',
  amountMxn: 150,
  periodEnd: '2026-11-08T00:00:00.000Z',
  payload: { id: 'evt_1' },
};

function recorder(reply: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(reply());
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('apply_payment_notice por REST', () => {
  it('manda el aviso con la llave de servicio y devuelve el resultado', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(JSON.stringify('applied')));
    expect(await applyNoticeViaRest(env, notice, fetchImpl)).toBe('applied');
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/apply_payment_notice');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('apikey')).toBe('servicio-de-prueba');
    expect(headers.get('authorization')).toBe('Bearer servicio-de-prueba');
    expect(JSON.parse(bodyText(calls[0]?.init))).toEqual({
      p_provider: 'stripe',
      p_event_id: 'evt_1',
      p_payload: { id: 'evt_1' },
      p_kind: 'paid',
      p_user: notice.userId,
      p_plan: 'monthly',
      p_provider_payment_id: 'in_1',
      p_provider_subscription_id: 'sub_1',
      p_amount_mxn: 150,
      p_period_end: '2026-11-08T00:00:00.000Z',
    });
  });

  it('falla si la base responde con error o con algo que no es un texto', async () => {
    await expect(
      applyNoticeViaRest(env, notice, recorder(() => new Response('x', { status: 500 })).fetchImpl),
    ).rejects.toThrow('500');
    await expect(
      applyNoticeViaRest(env, notice, recorder(() => new Response('{"a":1}')).fetchImpl),
    ).rejects.toThrow('texto');
  });
});

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

describe('lugares de Fundador', () => {
  const fetchFor = (settings: Response, taken: Response) =>
    ((url: string) =>
      Promise.resolve(url.includes('platform_settings') ? settings : taken)) as typeof fetch;

  it('resta los ocupados del total', async () => {
    const fetchImpl = fetchFor(
      new Response(JSON.stringify([{ value: { total: 100 } }])),
      new Response('[]', { headers: { 'content-range': '0-0/37' } }),
    );
    expect(await founderSeatsLeftViaRest(env, fetchImpl)).toBe(63);
  });

  it('si no se puede saber devuelve null', async () => {
    expect(
      await founderSeatsLeftViaRest(
        env,
        fetchFor(new Response('', { status: 500 }), new Response('[]')),
      ),
    ).toBeNull();
    expect(
      await founderSeatsLeftViaRest(
        env,
        fetchFor(new Response('[]'), new Response('[]', { headers: { 'content-range': '*/*' } })),
      ),
    ).toBeNull();
    expect(await founderSeatsLeftViaRest(env, () => Promise.reject(new Error('red')))).toBeNull();
  });
});

describe('clientes de Stripe por REST', () => {
  it('liga al alumno con su cliente usando la llave de servicio', async () => {
    const { calls, fetchImpl } = recorder(() => new Response(JSON.stringify('linked')));
    await linkCustomerViaRest(env, { userId: notice.userId ?? '', customerId: 'cus_1' }, fetchImpl);
    expect(calls[0]?.url).toBe('https://proyecto.supabase.co/rest/v1/rpc/record_billing_customer');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(
      'Bearer servicio-de-prueba',
    );
    expect(JSON.parse(bodyText(calls[0]?.init))).toEqual({
      p_provider: 'stripe',
      p_customer_id: 'cus_1',
      p_user: notice.userId,
    });
  });

  it('busca el cliente de un alumno y el alumno de un cliente', async () => {
    const customer = recorder(() => new Response(JSON.stringify('cus_1')));
    expect(await customerOfUserViaRest(env, 'u1', customer.fetchImpl)).toBe('cus_1');
    expect(customer.calls[0]?.url).toContain('/rpc/billing_customer_of_user');
    expect(JSON.parse(bodyText(customer.calls[0]?.init))).toEqual({
      p_provider: 'stripe',
      p_user: 'u1',
    });
    const user = recorder(() => new Response(JSON.stringify('u1')));
    expect(await userOfCustomerViaRest(env, 'cus_1', user.fetchImpl)).toBe('u1');
    expect(user.calls[0]?.url).toContain('/rpc/billing_user_of_customer');
  });

  it('sin resultado devuelve null y si la base falla lanza', async () => {
    const empty = recorder(() => new Response('null'));
    expect(await customerOfUserViaRest(env, 'u1', empty.fetchImpl)).toBeNull();
    expect(await userOfCustomerViaRest(env, 'cus_x', empty.fetchImpl)).toBeNull();
    const broken = recorder(() => new Response('x', { status: 500 }));
    await expect(userOfCustomerViaRest(env, 'cus_1', broken.fetchImpl)).rejects.toThrow('500');
    await expect(
      linkCustomerViaRest(env, { userId: 'u1', customerId: 'c' }, broken.fetchImpl),
    ).rejects.toThrow('500');
    await expect(customerOfUserViaRest(env, 'u1', broken.fetchImpl)).rejects.toThrow('500');
  });
});
