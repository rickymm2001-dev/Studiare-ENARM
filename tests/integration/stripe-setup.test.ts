import { describe, expect, it } from 'vitest';
import { PLAN_PRICES_MXN } from '../../supabase/functions/_shared/payments.ts';
import { isTestKey, PLAN_SPECS, setupStripeTest } from '../../scripts/stripe/setup-test.ts';

const KEY = `sk_test_${'a'.repeat(30)}`;

interface Call {
  method: string;
  path: string;
  form: URLSearchParams | null;
  headers: Headers;
}

/** Un Stripe falso con productos y precios en memoria */
function fakeStripe(existingLookupKeys: string[] = []) {
  const calls: Call[] = [];
  let counter = 0;
  const impl: typeof fetch = (input, init) => {
    const parsed = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const method = init?.method ?? 'GET';
    const form = init?.body instanceof URLSearchParams ? init.body : null;
    calls.push({
      method,
      path: parsed.pathname + (method === 'GET' ? parsed.search : ''),
      form,
      headers: new Headers(init?.headers),
    });
    if (method === 'GET') {
      const lookup = parsed.searchParams.get('lookup_keys[]') ?? '';
      const data = existingLookupKeys.includes(lookup) ? [{ id: `price_${lookup}` }] : [];
      return Promise.resolve(Response.json({ data }));
    }
    counter += 1;
    const prefix = parsed.pathname.endsWith('products') ? 'prod' : 'price';
    return Promise.resolve(Response.json({ id: `${prefix}_${counter}` }));
  };
  return { calls, fetch: impl };
}

describe('configuración de Stripe en modo prueba', () => {
  it('los precios en pesos son los mismos que cobra la función de pago', () => {
    for (const spec of PLAN_SPECS) expect(spec.amountMxn).toBe(PLAN_PRICES_MXN[spec.plan]);
  });

  it('solo acepta llaves de prueba', async () => {
    expect(isTestKey(KEY)).toBe(true);
    expect(isTestKey(`rk_test_${'b'.repeat(30)}`)).toBe(true);
    expect(isTestKey(`sk_live_${'a'.repeat(30)}`)).toBe(false);
    expect(isTestKey(`pk_test_${'a'.repeat(30)}`)).toBe(false);
    expect(isTestKey('')).toBe(false);
    const stripe = fakeStripe();
    await expect(
      setupStripeTest({ key: `sk_live_${'a'.repeat(30)}`, fetch: stripe.fetch }),
    ).rejects.toThrow(/llaves de prueba/);
    // Con una llave real ni siquiera se llama a Stripe
    expect(stripe.calls).toHaveLength(0);
  });

  it('crea un producto y un precio por plan, en pesos y con el periodo correcto', async () => {
    const stripe = fakeStripe();
    const results = await setupStripeTest({ key: KEY, fetch: stripe.fetch });
    expect(results.map((r) => [r.plan, r.created])).toEqual([
      ['founder', true],
      ['monthly', true],
      ['annual', true],
    ]);
    const prices = stripe.calls.filter((c) => c.method === 'POST' && c.path === '/v1/prices');
    expect(prices.map((c) => Object.fromEntries(c.form ?? []))).toMatchObject([
      { currency: 'mxn', unit_amount: '7900', 'recurring[interval]': 'month' },
      { currency: 'mxn', unit_amount: '15000', 'recurring[interval]': 'month' },
      { currency: 'mxn', unit_amount: '120000', 'recurring[interval]': 'year' },
    ]);
    // El precio queda con el impuesto incluido, como se muestra al consumidor en México
    expect(prices.every((c) => c.form?.get('tax_behavior') === 'inclusive')).toBe(true);
    expect(results.map((r) => r.env)).toEqual([
      'STRIPE_PRICE_FOUNDER',
      'STRIPE_PRICE_MONTHLY',
      'STRIPE_PRICE_ANNUAL',
    ]);
  });

  it('usa la llave como portador y manda una clave de idempotencia al crear', async () => {
    const stripe = fakeStripe();
    await setupStripeTest({ key: KEY, fetch: stripe.fetch });
    for (const call of stripe.calls) {
      expect(call.headers.get('authorization')).toBe(`Bearer ${KEY}`);
    }
    const creates = stripe.calls.filter((c) => c.method === 'POST');
    expect(creates.every((c) => c.headers.has('idempotency-key'))).toBe(true);
    expect(new Set(creates.map((c) => c.headers.get('idempotency-key'))).size).toBe(creates.length);
  });

  it('al correrlo otra vez reutiliza lo que ya existe y no crea nada repetido', async () => {
    const stripe = fakeStripe(PLAN_SPECS.map((spec) => spec.lookupKey));
    const results = await setupStripeTest({ key: KEY, fetch: stripe.fetch });
    expect(results.every((r) => !r.created)).toBe(true);
    expect(stripe.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('respeta el comportamiento de impuesto que se pida', async () => {
    const stripe = fakeStripe();
    await setupStripeTest({ key: KEY, fetch: stripe.fetch, taxBehavior: 'exclusive' });
    const prices = stripe.calls.filter((c) => c.method === 'POST' && c.path === '/v1/prices');
    expect(prices.every((c) => c.form?.get('tax_behavior') === 'exclusive')).toBe(true);
  });

  it('si Stripe rechaza, el error trae su mensaje y nunca la llave', async () => {
    const failing = (() =>
      Promise.resolve(
        Response.json({ error: { message: 'Invalid API Key provided' } }, { status: 401 }),
      )) as typeof fetch;
    const error = await setupStripeTest({ key: KEY, fetch: failing }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('401');
    expect(message).toContain('Invalid API Key provided');
    expect(message).not.toContain(KEY);
  });
});
