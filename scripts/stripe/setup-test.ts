// Crea en Stripe, en modo prueba, los tres productos de Studiare con su precio en pesos, y imprime los
// Price que hay que poner en los secretos de Supabase. Se puede correr las veces que haga falta, porque
// cada precio lleva una clave de búsqueda y si ya existe lo reutiliza en vez de crear otro.
// Solo acepta llaves de prueba. La llave se lee de la variable STRIPE_SECRET_KEY, no se guarda ni se
// imprime. Uso, STRIPE_SECRET_KEY=sk_test_... node scripts/stripe/setup-test.ts [--tax=inclusive]
import { resolve } from 'node:path';

export type TaxBehavior = 'inclusive' | 'exclusive' | 'unspecified';

export interface PlanSpec {
  plan: 'founder' | 'monthly' | 'annual';
  name: string;
  /** Pesos. Una prueba confirma que coinciden con los que cobra la función de pago */
  amountMxn: number;
  interval: 'month' | 'year';
  lookupKey: string;
  /** Secreto de Supabase que recibe el Price */
  env: 'STRIPE_PRICE_FOUNDER' | 'STRIPE_PRICE_MONTHLY' | 'STRIPE_PRICE_ANNUAL';
}

export const PLAN_SPECS: readonly PlanSpec[] = [
  {
    plan: 'founder',
    name: 'Studiare. Plan Fundador',
    amountMxn: 79,
    interval: 'month',
    lookupKey: 'studiare_founder_mxn_month',
    env: 'STRIPE_PRICE_FOUNDER',
  },
  {
    plan: 'monthly',
    name: 'Studiare. Plan mensual',
    amountMxn: 150,
    interval: 'month',
    lookupKey: 'studiare_monthly_mxn_month',
    env: 'STRIPE_PRICE_MONTHLY',
  },
  {
    plan: 'annual',
    name: 'Studiare. Plan anual',
    amountMxn: 1200,
    interval: 'year',
    lookupKey: 'studiare_annual_mxn_year',
    env: 'STRIPE_PRICE_ANNUAL',
  },
];

export interface SetupResult {
  plan: PlanSpec['plan'];
  env: PlanSpec['env'];
  priceId: string;
  /** false si el precio ya existía y se reutilizó */
  created: boolean;
}

class StripeError extends Error {}

/** Solo llaves de prueba. Una llave real crearía productos en la cuenta de verdad */
export function isTestKey(key: string): boolean {
  return /^[sr]k_test_[A-Za-z0-9]{10,}$/.test(key);
}

export async function setupStripeTest(input: {
  key: string;
  fetch: typeof fetch;
  taxBehavior?: TaxBehavior;
}): Promise<SetupResult[]> {
  if (!isTestKey(input.key)) {
    throw new StripeError('Solo se aceptan llaves de prueba, que empiezan con sk_test_ o rk_test_');
  }
  const headers = { authorization: `Bearer ${input.key}` };

  async function call(method: 'GET' | 'POST', path: string, form?: URLSearchParams, idem?: string) {
    const reply = await input.fetch(`https://api.stripe.com${path}`, {
      method,
      headers: {
        ...headers,
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(idem ? { 'idempotency-key': idem } : {}),
      },
      ...(form ? { body: form } : {}),
    });
    const body = (await reply.json().catch(() => ({}))) as {
      error?: { message?: string };
    } & Record<string, unknown>;
    if (!reply.ok) {
      // Nunca se imprime la llave. Solo el mensaje que devuelve Stripe
      throw new StripeError(
        `Stripe respondió ${reply.status}. ${body.error?.message ?? ''}`.trim(),
      );
    }
    return body;
  }

  const results: SetupResult[] = [];
  for (const spec of PLAN_SPECS) {
    const found = (await call(
      'GET',
      `/v1/prices?${new URLSearchParams({ 'lookup_keys[]': spec.lookupKey, active: 'true', limit: '1' })}`,
    )) as { data?: { id: string }[] };
    const existing = found.data?.[0]?.id;
    if (existing) {
      results.push({ plan: spec.plan, env: spec.env, priceId: existing, created: false });
      continue;
    }
    const product = await call(
      'POST',
      '/v1/products',
      new URLSearchParams({ name: spec.name, 'metadata[plan]': spec.plan }),
      `studiare-setup-product-${spec.plan}`,
    );
    const price = await call(
      'POST',
      '/v1/prices',
      new URLSearchParams({
        product: String(product.id),
        currency: 'mxn',
        unit_amount: String(spec.amountMxn * 100),
        'recurring[interval]': spec.interval,
        lookup_key: spec.lookupKey,
        tax_behavior: input.taxBehavior ?? 'inclusive',
        'metadata[plan]': spec.plan,
      }),
      `studiare-setup-price-${spec.plan}`,
    );
    results.push({ plan: spec.plan, env: spec.env, priceId: String(price.id), created: true });
  }
  return results;
}

// Uso desde la línea de comandos
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  const taxArg = process.argv.find((arg) => arg.startsWith('--tax='))?.slice('--tax='.length);
  const taxBehavior: TaxBehavior =
    taxArg === 'exclusive' || taxArg === 'unspecified' ? taxArg : 'inclusive';
  setupStripeTest({ key, fetch, taxBehavior }).then(
    (results) => {
      for (const result of results) {
        console.log(`${result.env}=${result.priceId}${result.created ? '' : '  (ya existía)'}`);
      }
      console.log('Pon esos tres valores en Supabase, Edge Functions, Secrets.');
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : 'Falló la configuración');
      process.exit(1);
    },
  );
}
