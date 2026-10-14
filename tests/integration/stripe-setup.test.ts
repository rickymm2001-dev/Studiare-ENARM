import { describe, expect, it } from 'vitest';
import { PLANS } from '../../src/config/billing.ts';
import {
  PASS_PRICES_MXN,
  PLAN_PRICES_MXN,
  STRIPE_API_VERSION,
  isPassPlan,
  isPaidPlan,
} from '../../supabase/functions/_shared/billingTypes.ts';
import { PASS_PRICE_SECRETS, PLAN_PRICE_SECRETS } from '../../supabase/functions/_shared/stripe.ts';
import {
  PORTAL_SPECS,
  PRICE_SPECS,
  PROMO_SPEC,
  isTestKey,
  portalParams,
  setupStripeTest,
  summaryLines,
  type PriceKey,
} from '../../scripts/stripe/setup-test.ts';

const KEY = `rk_test_${'a'.repeat(30)}`;
const APP = 'https://app.ejemplo.mx/Studiare-ENARM/';

interface Call {
  method: string;
  path: string;
  form: URLSearchParams;
  headers: Headers;
}

type Row = Record<string, unknown>;

/**
 * Un Stripe falso en memoria con productos, precios, cupones, códigos y configuraciones del portal.
 * Sigue las reglas que importan aquí. Un id fijo no se repite, una clave de búsqueda vive en un solo
 * precio y solo se mueve con transfer_lookup_key, y un código necesita su cupón
 */
function fakeStripe(seed: { prices?: Row[] } = {}) {
  const calls: Call[] = [];
  const products = new Map<string, Row>();
  const prices: Row[] = [...(seed.prices ?? [])];
  const coupons = new Map<string, Row>();
  const codes: Row[] = [];
  const configs: Row[] = [];
  let counter = 0;
  const next = (prefix: string) => {
    counter += 1;
    return `${prefix}_${String(counter)}`;
  };
  const ok = (body: unknown) => Promise.resolve(Response.json(body));
  const fail = (status: number, message: string) =>
    Promise.resolve(
      Response.json({ error: { type: 'invalid_request_error', message } }, { status }),
    );

  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    const form = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
    calls.push({ method, path: url.pathname, form, headers: new Headers(init?.headers) });
    const [, , resource = '', id = '', extra = ''] = url.pathname.split('/');
    const field = (name: string) => form.get(name);

    if (resource === 'products') {
      if (method === 'GET') {
        const product = products.get(id);
        return product ? ok(product) : fail(404, `No such product: '${id}'`);
      }
      if (id === '') {
        const productId = field('id') ?? next('prod');
        if (products.has(productId)) return fail(400, 'Product already exists');
        const product = { id: productId, name: field('name'), active: true };
        products.set(productId, product);
        return ok(product);
      }
      const product = products.get(id);
      if (!product) return fail(404, 'No such product');
      product.active = field('active') !== 'false';
      return ok(product);
    }

    if (resource === 'prices') {
      if (method === 'GET') {
        const keys = url.searchParams.getAll('lookup_keys[]');
        return ok({
          data: prices.filter(
            (price) => keys.includes(String(price.lookup_key)) && price.active === true,
          ),
        });
      }
      if (id !== '') {
        const price = prices.find((row) => row.id === id);
        if (!price) return fail(404, 'No such price');
        price.active = field('active') !== 'false';
        return ok(price);
      }
      const lookupKey = field('lookup_key');
      const holder = prices.find((price) => price.lookup_key === lookupKey);
      if (holder && field('transfer_lookup_key') !== 'true') {
        return fail(400, 'A price with this lookup_key already exists');
      }
      if (holder) holder.lookup_key = null;
      const interval = field('recurring[interval]');
      const price = {
        id: next('price'),
        product: field('product'),
        unit_amount: Number(field('unit_amount')),
        currency: field('currency'),
        type: interval ? 'recurring' : 'one_time',
        recurring: interval ? { interval } : null,
        lookup_key: lookupKey,
        active: true,
      };
      prices.push(price);
      return ok(price);
    }

    if (resource === 'coupons') {
      if (method === 'GET') {
        const coupon = coupons.get(id);
        return coupon ? ok(coupon) : fail(404, `No such coupon: '${id}'`);
      }
      const coupon = {
        id: field('id') ?? next('coupon'),
        percent_off: Number(field('percent_off')),
      };
      coupons.set(coupon.id, coupon);
      return ok(coupon);
    }

    if (resource === 'promotion_codes') {
      if (method === 'GET') {
        const code = url.searchParams.get('code');
        return ok({ data: codes.filter((row) => row.code === code) });
      }
      if (field('promotion[type]') !== 'coupon' || !coupons.has(field('promotion[coupon]') ?? '')) {
        return fail(400, 'Missing required param: promotion.');
      }
      const code = { id: next('promo'), code: field('code') };
      codes.push(code);
      return ok(code);
    }

    if (resource === 'billing_portal' && id === 'configurations') {
      if (method === 'GET') return ok({ data: configs });
      if (extra !== '') {
        const config = configs.find((row) => row.id === extra);
        if (!config) return fail(404, 'No such configuration');
        return ok(config);
      }
      const config = {
        id: next('bpc'),
        metadata: { studiare_key: field('metadata[studiare_key]') },
      };
      configs.push(config);
      return ok(config);
    }
    return fail(404, 'Unrecognized request URL');
  }) as typeof fetch;

  return { calls, fetch: fetchImpl, prices, configs };
}

const posts = (calls: Call[], path: string) =>
  calls.filter((call) => call.method === 'POST' && call.path === path);

const formOf = (call: Call | undefined): Record<string, string> =>
  Object.fromEntries(call?.form ?? []);

describe('configuración de Stripe en modo prueba', () => {
  it('los precios son los de la app y los de las funciones, y cada uno va a su secreto', () => {
    const amount = Object.fromEntries(PRICE_SPECS.map((spec) => [spec.key, spec.amountMxn]));
    expect(amount).toEqual({
      founder: PLANS.founder.priceMxn,
      founder_annual: PLANS.founder_annual.priceMxn,
      monthly: PLANS.monthly.priceMxn,
      annual: PLANS.annual.priceMxn,
      pass_monthly: PLANS.monthly.priceMxn,
      pass_annual: PLANS.annual.priceMxn,
    });
    for (const spec of PRICE_SPECS) {
      const plan = spec.key.replace('pass_', '');
      const expected = spec.key.startsWith('pass_')
        ? isPassPlan(plan) && PASS_PRICES_MXN[plan]
        : isPaidPlan(plan) && PLAN_PRICES_MXN[plan];
      expect(spec.amountMxn).toBe(expected);
      // La clave de búsqueda lleva el monto
      expect(spec.lookupKey).toContain(`_${String(spec.amountMxn)}_`);
    }
    expect(PRICE_SPECS.map((spec) => spec.env)).toEqual([
      ...Object.values(PLAN_PRICE_SECRETS),
      ...Object.values(PASS_PRICE_SECRETS),
    ]);
  });

  it('solo acepta llaves de prueba y con una real ni siquiera llama a Stripe', async () => {
    expect(isTestKey(KEY)).toBe(true);
    expect(isTestKey(`sk_test_${'b'.repeat(30)}`)).toBe(true);
    expect(isTestKey(`sk_live_${'a'.repeat(30)}`)).toBe(false);
    expect(isTestKey(`rk_live_${'a'.repeat(30)}`)).toBe(false);
    expect(isTestKey(`pk_test_${'a'.repeat(30)}`)).toBe(false);
    expect(isTestKey('')).toBe(false);
    const stripe = fakeStripe();
    await expect(
      setupStripeTest({ key: `sk_live_${'a'.repeat(30)}`, fetch: stripe.fetch }),
    ).rejects.toThrow(/llaves de prueba/);
    await expect(
      setupStripeTest({ key: KEY, fetch: stripe.fetch, appUrl: 'no es url' }),
    ).rejects.toThrow('no es una URL');
    expect(stripe.calls).toHaveLength(0);
  });

  it('la primera vez crea los dos productos con sus seis precios, el cupón, el código y los dos portales', async () => {
    const stripe = fakeStripe();
    const result = await setupStripeTest({ key: KEY, fetch: stripe.fetch, appUrl: APP });

    expect(posts(stripe.calls, '/v1/products').map((call) => call.form.get('id'))).toEqual([
      'studiare_plan',
      'studiare_pase',
    ]);
    const prices = posts(stripe.calls, '/v1/prices').map(formOf);
    expect(
      prices.map((price) => [
        price.product,
        price.unit_amount,
        price['recurring[interval]'] ?? 'único',
        price.lookup_key,
      ]),
    ).toEqual([
      ['studiare_plan', '7900', 'month', 'studiare_founder_79_mxn_month'],
      ['studiare_plan', '74900', 'year', 'studiare_founder_annual_749_mxn_year'],
      ['studiare_plan', '14900', 'month', 'studiare_monthly_149_mxn_month'],
      ['studiare_plan', '149900', 'year', 'studiare_annual_1499_mxn_year'],
      ['studiare_pase', '14900', 'único', 'studiare_pass_month_149_mxn'],
      ['studiare_pase', '149900', 'único', 'studiare_pass_year_1499_mxn'],
    ]);
    // Todo en pesos y con el IVA incluido, como se muestra al consumidor en México
    expect(
      prices.every((price) => price.tax_behavior === 'inclusive' && price.currency === 'mxn'),
    ).toBe(true);
    expect(prices.some((price) => 'transfer_lookup_key' in price)).toBe(false);

    expect(formOf(posts(stripe.calls, '/v1/coupons')[0])).toMatchObject({
      id: 'PRUEBA10',
      percent_off: '10',
      duration: 'repeating',
      duration_in_months: '1',
    });
    expect(formOf(posts(stripe.calls, '/v1/promotion_codes')[0])).toMatchObject({
      'promotion[type]': 'coupon',
      'promotion[coupon]': 'PRUEBA10',
      code: 'PRUEBA10',
      'restrictions[first_time_transaction]': 'true',
    });

    expect(result.ids.map((entry) => [entry.env, entry.status])).toEqual([
      ['STRIPE_PRICE_FOUNDER', 'created'],
      ['STRIPE_PRICE_FOUNDER_ANNUAL', 'created'],
      ['STRIPE_PRICE_MONTHLY', 'created'],
      ['STRIPE_PRICE_ANNUAL', 'created'],
      ['STRIPE_PRICE_PASS_MONTHLY', 'created'],
      ['STRIPE_PRICE_PASS_ANNUAL', 'created'],
      ['STRIPE_PORTAL_CONFIG_FOUNDER', 'created'],
      ['STRIPE_PORTAL_CONFIG_REGULAR', 'created'],
    ]);
    expect(result.ids.slice(0, 6).every((entry) => entry.id.startsWith('price_'))).toBe(true);
    expect(result.ids.slice(6).every((entry) => entry.id.startsWith('bpc_'))).toBe(true);
    expect(result.coupon).toEqual({ id: 'PRUEBA10', created: true });
    expect(result.promotionCode).toMatchObject({ code: 'PRUEBA10', created: true });
    expect(result.replacedPrices).toEqual([]);
  });

  it('cada portal deja cambiar solo entre sus dos precios, cobra al subir y agenda al bajar', async () => {
    const stripe = fakeStripe();
    const result = await setupStripeTest({ key: KEY, fetch: stripe.fetch, appUrl: APP });
    const priceOf = (env: string) => result.ids.find((entry) => entry.env === env)?.id;
    const [founder, regular] = posts(stripe.calls, '/v1/billing_portal/configurations').map(formOf);
    const prices = '[subscription_update][products][0][prices]';
    expect(founder).toMatchObject({
      'metadata[studiare_key]': 'portal_founder',
      'features[subscription_update][products][0][product]': 'studiare_plan',
      [`features${prices}[0]`]: priceOf('STRIPE_PRICE_FOUNDER'),
      [`features${prices}[1]`]: priceOf('STRIPE_PRICE_FOUNDER_ANNUAL'),
    });
    expect(regular).toMatchObject({
      'metadata[studiare_key]': 'portal_regular',
      [`features${prices}[0]`]: priceOf('STRIPE_PRICE_MONTHLY'),
      [`features${prices}[1]`]: priceOf('STRIPE_PRICE_ANNUAL'),
    });
    for (const config of [founder, regular]) {
      expect(config).toMatchObject({
        'features[subscription_update][default_allowed_updates][0]': 'price',
        'features[subscription_update][proration_behavior]': 'always_invoice',
        'features[subscription_update][schedule_at_period_end][conditions][0][type]':
          'decreasing_item_amount',
        'features[subscription_update][schedule_at_period_end][conditions][1][type]':
          'shortening_interval',
        'features[subscription_update][trial_update_behavior]': 'continue_trial',
        'features[subscription_cancel][mode]': 'at_period_end',
        'features[subscription_cancel][cancellation_reason][enabled]': 'true',
        'features[customer_update][enabled]': 'false',
        'features[payment_method_update][enabled]': 'true',
        'features[invoice_history][enabled]': 'true',
        default_return_url: 'https://app.ejemplo.mx/Studiare-ENARM/suscripcion',
        'business_profile[privacy_policy_url]': 'https://app.ejemplo.mx/Studiare-ENARM/privacidad',
        'business_profile[terms_of_service_url]': 'https://app.ejemplo.mx/Studiare-ENARM/terminos',
      });
      expect(config?.[`features${prices}[2]`]).toBeUndefined();
    }
    // Sin la diagonal final la dirección de la app igual queda bien armada
    const fakePrices = Object.fromEntries(
      PRICE_SPECS.map((spec) => [spec.key, `price_${spec.key}`]),
    ) as Record<PriceKey, string>;
    const [spec] = PORTAL_SPECS;
    expect(spec).toBeDefined();
    if (spec) {
      const noSlash = portalParams(spec, fakePrices, 'https://app.ejemplo.mx/Studiare-ENARM');
      expect(noSlash.get('business_profile[terms_of_service_url]')).toBe(
        'https://app.ejemplo.mx/Studiare-ENARM/terminos',
      );
    }
  });

  it('manda la llave, la versión fija y una clave de idempotencia distinta en cada creación', async () => {
    const stripe = fakeStripe();
    await setupStripeTest({ key: KEY, fetch: stripe.fetch, appUrl: APP });
    for (const call of stripe.calls) {
      expect(call.headers.get('authorization')).toBe(`Bearer ${KEY}`);
      expect(call.headers.get('stripe-version')).toBe(STRIPE_API_VERSION);
    }
    // Las creaciones van a la colección, por ejemplo /v1/prices, y no a un objeto
    const creates = stripe.calls.filter(
      (call) =>
        call.method === 'POST' &&
        (call.path.split('/').length === 3 || call.path === '/v1/billing_portal/configurations'),
    );
    expect(creates).toHaveLength(12);
    expect(creates.every((call) => call.headers.has('idempotency-key'))).toBe(true);
    expect(new Set(creates.map((call) => call.headers.get('idempotency-key'))).size).toBe(12);
  });

  it('al correrlo otra vez reutiliza todo, pone al día los portales y da los mismos IDs', async () => {
    const stripe = fakeStripe();
    const first = await setupStripeTest({ key: KEY, fetch: stripe.fetch, appUrl: APP });
    stripe.calls.length = 0;
    const second = await setupStripeTest({ key: KEY, fetch: stripe.fetch, appUrl: APP });
    expect(second.ids.map((entry) => entry.id)).toEqual(first.ids.map((entry) => entry.id));
    expect(second.ids.map((entry) => entry.status)).toEqual([
      ...Array<string>(6).fill('reused'),
      'updated',
      'updated',
    ]);
    expect(second.coupon.created).toBe(false);
    expect(second.promotionCode).toEqual({ ...first.promotionCode, created: false });
    expect(stripe.calls.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual([
      `/v1/billing_portal/configurations/${first.ids[6]?.id ?? ''}`,
      `/v1/billing_portal/configurations/${first.ids[7]?.id ?? ''}`,
    ]);
    expect(stripe.prices).toHaveLength(6);
    expect(stripe.configs).toHaveLength(2);
  });

  it('una clave que vive en un precio de otro producto pasa al nuevo, y el viejo se archiva solo si se pide', async () => {
    const legacy = () => [
      {
        id: 'price_viejo_mensual',
        product: 'prod_viejo',
        unit_amount: 14_900,
        currency: 'mxn',
        type: 'recurring',
        recurring: { interval: 'month' },
        lookup_key: 'studiare_monthly_149_mxn_month',
        active: true,
      },
    ];
    const kept = fakeStripe({ prices: legacy() });
    const moved = await setupStripeTest({ key: KEY, fetch: kept.fetch, appUrl: APP });
    const monthly = posts(kept.calls, '/v1/prices').find(
      (call) => call.form.get('lookup_key') === 'studiare_monthly_149_mxn_month',
    );
    expect(monthly?.form.get('transfer_lookup_key')).toBe('true');
    expect(monthly?.form.get('product')).toBe('studiare_plan');
    expect(moved.replacedPrices).toEqual(['price_viejo_mensual']);
    expect(moved.archivedPrices).toEqual([]);
    expect(kept.prices.find((price) => price.id === 'price_viejo_mensual')?.active).toBe(true);
    expect(summaryLines(moved).join('\n')).toContain(
      'Precios viejos que cedieron su clave price_viejo_mensual. Archívalos con --archive-old',
    );

    const archived = fakeStripe({ prices: legacy() });
    const result = await setupStripeTest({
      key: KEY,
      fetch: archived.fetch,
      appUrl: APP,
      archiveOld: true,
    });
    expect(result.archivedPrices).toEqual(['price_viejo_mensual']);
    expect(archived.prices.find((price) => price.id === 'price_viejo_mensual')?.active).toBe(false);
    expect(summaryLines(result)).toContain('Precios viejos archivados price_viejo_mensual');
  });

  it('si Stripe rechaza, el error trae el estado, la ruta y su mensaje, nunca la llave', async () => {
    const failing = (() =>
      Promise.resolve(
        Response.json(
          { error: { message: 'The provided key does not have permission' } },
          { status: 403 },
        ),
      )) as typeof fetch;
    const error = await setupStripeTest({ key: KEY, fetch: failing }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : '';
    expect(message).toBe(
      'Stripe respondió 403 en GET /v1/products/studiare_plan. The provided key does not have permission',
    );
    expect(message).not.toContain(KEY);
  });

  it('imprime los ocho IDs en líneas NOMBRE=valor, sin la llave', async () => {
    const stripe = fakeStripe();
    const lines = summaryLines(
      await setupStripeTest({ key: KEY, fetch: stripe.fetch, appUrl: APP }),
    );
    expect(lines.slice(0, 8).map((line) => line.split('=')[0])).toEqual([
      'STRIPE_PRICE_FOUNDER',
      'STRIPE_PRICE_FOUNDER_ANNUAL',
      'STRIPE_PRICE_MONTHLY',
      'STRIPE_PRICE_ANNUAL',
      'STRIPE_PRICE_PASS_MONTHLY',
      'STRIPE_PRICE_PASS_ANNUAL',
      'STRIPE_PORTAL_CONFIG_FOUNDER',
      'STRIPE_PORTAL_CONFIG_REGULAR',
    ]);
    expect(lines.slice(0, 8).every((line) => /^[A-Z_]+=(price|bpc)_\d+$/.test(line))).toBe(true);
    expect(lines).toContain(`Cupón ${PROMO_SPEC.coupon} creado y código ${PROMO_SPEC.code} creado`);
    expect(lines.join('\n')).not.toContain(KEY);
  });
});
