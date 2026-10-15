// Prepara Stripe en modo prueba para los pagos de B10 (7.2 del diseño). Crea o reutiliza
//   - El producto Studiare (studiare_plan) con los cuatro precios con renovación, con IVA incluido
//   - El producto Studiare pase (studiare_pase) con los dos precios de un solo pago
//   - El cupón PRUEBA10 de 10% en el primer cobro y su código PRUEBA10 para clientes nuevos
//   - Las dos configuraciones del portal, la de Fundadores y la regular
// e imprime los ocho IDs que van en Supabase, Edge Functions, Secrets, en líneas NOMBRE=valor.
//
// Se puede correr las veces que haga falta. Los productos y el cupón tienen id fijo, cada precio una
// clave de búsqueda y cada configuración del portal su metadata studiare_key, así que lo que ya existe se
// reutiliza. Si una clave de búsqueda está en un precio de otro producto, como los de antes de B10, el
// precio nuevo se la lleva (transfer_lookup_key) y el viejo se archiva solo con --archive-old.
//
// Solo acepta llaves de prueba (sk_test_ o rk_test_). La llave se lee de STRIPE_SECRET_KEY, no se guarda
// ni se imprime. En la sesión en la nube, sin esa variable, la pone el proxy del entorno y la sesión no la
// ve. Entonces lo primero es leer el saldo, que dice livemode, y si no sale en false no se crea nada.
// Todas las llamadas usan la versión fija de la API. Uso
//   STRIPE_SECRET_KEY=rk_test_... node scripts/stripe/setup-test.ts [--app-url=https://...] [--archive-old]
//     [--write-ids=private/stripe-test-ids.json]
//   node --use-env-proxy scripts/stripe/setup-test.ts ...   en la sesión en la nube
// Las opciones con valor aceptan --nombre=valor y --nombre valor.
// Con --write-ids guarda además los ocho IDs en ese JSON, que npm run deploy:supabase pone en los
// secretos de Supabase con --secrets-from (docs/DESPLIEGUE.md). private/ no va al repo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { STRIPE_API_VERSION } from '../../supabase/functions/_shared/billingTypes.ts';
import { subscriptionUrl } from '../../supabase/functions/_shared/http.ts';

export type TaxBehavior = 'inclusive' | 'exclusive' | 'unspecified';

export const DEFAULT_APP_URL = 'https://rickymm2001-dev.github.io/Studiare-ENARM/';

export interface ProductSpec {
  id: 'studiare_plan' | 'studiare_pase';
  name: string;
  description: string;
}

export const PRODUCT_SPECS: readonly ProductSpec[] = [
  {
    id: 'studiare_plan',
    name: 'Studiare',
    description: 'Plan de Studiare con renovación automática',
  },
  {
    id: 'studiare_pase',
    name: 'Studiare pase',
    description: 'Pase de Studiare de un solo pago, sin renovación',
  },
];

export type PriceKey =
  'founder' | 'founder_annual' | 'monthly' | 'annual' | 'pass_monthly' | 'pass_annual';

export type SecretName =
  | 'STRIPE_PRICE_FOUNDER'
  | 'STRIPE_PRICE_FOUNDER_ANNUAL'
  | 'STRIPE_PRICE_MONTHLY'
  | 'STRIPE_PRICE_ANNUAL'
  | 'STRIPE_PRICE_PASS_MONTHLY'
  | 'STRIPE_PRICE_PASS_ANNUAL'
  | 'STRIPE_PORTAL_CONFIG_FOUNDER'
  | 'STRIPE_PORTAL_CONFIG_REGULAR';

export interface PriceSpec {
  key: PriceKey;
  product: ProductSpec['id'];
  /** Pesos con IVA. Una prueba confirma que coinciden con los de la app y las funciones */
  amountMxn: number;
  /** null es un pago único */
  interval: 'month' | 'year' | null;
  /** Lleva el monto, porque un precio de Stripe no cambia de monto y uno nuevo necesita otra clave */
  lookupKey: string;
  nickname: string;
  env: SecretName;
}

export const PRICE_SPECS: readonly PriceSpec[] = [
  {
    key: 'founder',
    product: 'studiare_plan',
    amountMxn: 79,
    interval: 'month',
    lookupKey: 'studiare_founder_79_mxn_month',
    nickname: 'Mensual Fundador',
    env: 'STRIPE_PRICE_FOUNDER',
  },
  {
    key: 'founder_annual',
    product: 'studiare_plan',
    amountMxn: 749,
    interval: 'year',
    lookupKey: 'studiare_founder_annual_749_mxn_year',
    nickname: 'Anual Fundador',
    env: 'STRIPE_PRICE_FOUNDER_ANNUAL',
  },
  {
    key: 'monthly',
    product: 'studiare_plan',
    amountMxn: 149,
    interval: 'month',
    lookupKey: 'studiare_monthly_149_mxn_month',
    nickname: 'Mensual',
    env: 'STRIPE_PRICE_MONTHLY',
  },
  {
    key: 'annual',
    product: 'studiare_plan',
    amountMxn: 1499,
    interval: 'year',
    lookupKey: 'studiare_annual_1499_mxn_year',
    nickname: 'Anual',
    env: 'STRIPE_PRICE_ANNUAL',
  },
  {
    key: 'pass_monthly',
    product: 'studiare_pase',
    amountMxn: 149,
    interval: null,
    lookupKey: 'studiare_pass_month_149_mxn',
    nickname: 'Pase de 1 mes',
    env: 'STRIPE_PRICE_PASS_MONTHLY',
  },
  {
    key: 'pass_annual',
    product: 'studiare_pase',
    amountMxn: 1499,
    interval: null,
    lookupKey: 'studiare_pass_year_1499_mxn',
    nickname: 'Pase de 1 año',
    env: 'STRIPE_PRICE_PASS_ANNUAL',
  },
];

/** Cupón de prueba de influencer. repeating de 1 mes cubre el primer cobro con o sin prueba (8.8) */
export const PROMO_SPEC = {
  coupon: 'PRUEBA10',
  code: 'PRUEBA10',
  percentOff: 10,
  durationInMonths: 1,
  name: 'Prueba 10% en el primer cobro',
} as const;

export interface PortalSpec {
  /** Va en metadata[studiare_key] para encontrarla al volver a correr */
  key: 'portal_founder' | 'portal_regular';
  name: string;
  /** Los precios entre los que se puede cambiar, del mismo producto (2.3) */
  prices: readonly PriceKey[];
  env: SecretName;
}

export const PORTAL_SPECS: readonly PortalSpec[] = [
  {
    key: 'portal_founder',
    name: 'Studiare Fundadores',
    prices: ['founder', 'founder_annual'],
    env: 'STRIPE_PORTAL_CONFIG_FOUNDER',
  },
  {
    key: 'portal_regular',
    name: 'Studiare regular',
    prices: ['monthly', 'annual'],
    env: 'STRIPE_PORTAL_CONFIG_REGULAR',
  },
];

/** Motivos de cancelación que ofrece el portal */
const CANCELLATION_REASONS = [
  'too_expensive',
  'missing_features',
  'switched_service',
  'unused',
  'customer_service',
  'too_complex',
  'low_quality',
  'other',
] as const;

export interface SetupId {
  env: SecretName;
  id: string;
  /** created es nuevo, reused ya existía igual y updated es una configuración del portal puesta al día */
  status: 'created' | 'reused' | 'updated';
}

export interface SetupResult {
  /** Los ocho IDs en el orden de 2.6 */
  ids: SetupId[];
  coupon: { id: string; created: boolean };
  promotionCode: { id: string; code: string; created: boolean };
  /** Precios de otro producto que tenían una de las claves de búsqueda y se la cedieron al nuevo */
  replacedPrices: string[];
  /** Los que además se archivaron, con --archive-old */
  archivedPrices: string[];
}

export class StripeSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeSetupError';
  }
}

/** Solo llaves de prueba. Una llave real crearía productos en la cuenta de verdad */
export function isTestKey(key: string): boolean {
  return /^[sr]k_test_[A-Za-z0-9]{10,}$/.test(key);
}

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const asList = (value: unknown): Json[] =>
  Array.isArray(asRecord(value).data) ? (asRecord(value).data as unknown[]).map(asRecord) : [];
const idOf = (value: unknown): string | null => asString(value) ?? asString(asRecord(value).id);

/** Los parámetros de una configuración del portal (2.3) */
export function portalParams(
  spec: PortalSpec,
  prices: Record<PriceKey, string>,
  appUrl: string,
): URLSearchParams {
  const base = new URL(appUrl);
  if (!base.pathname.endsWith('/')) base.pathname = `${base.pathname}/`;
  const params = new URLSearchParams({
    'business_profile[headline]': 'Studiare',
    'business_profile[privacy_policy_url]': new URL('privacidad', base).href,
    'business_profile[terms_of_service_url]': new URL('terminos', base).href,
    default_return_url: subscriptionUrl(appUrl),
    'features[invoice_history][enabled]': 'true',
    'features[payment_method_update][enabled]': 'true',
    // El correo y el nombre los maneja Studiare
    'features[customer_update][enabled]': 'false',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[subscription_cancel][cancellation_reason][enabled]': 'true',
    'features[subscription_update][enabled]': 'true',
    'features[subscription_update][default_allowed_updates][0]': 'price',
    'features[subscription_update][products][0][product]': 'studiare_plan',
    // Subir cobra la diferencia al momento. Bajar o pasar de anual a mensual se agenda al fin del periodo
    'features[subscription_update][proration_behavior]': 'always_invoice',
    'features[subscription_update][schedule_at_period_end][conditions][0][type]':
      'decreasing_item_amount',
    'features[subscription_update][schedule_at_period_end][conditions][1][type]':
      'shortening_interval',
    // Cambiar de plan en la prueba no la termina (8.17)
    'features[subscription_update][trial_update_behavior]': 'continue_trial',
    name: spec.name,
    'metadata[studiare_key]': spec.key,
  });
  CANCELLATION_REASONS.forEach((option, index) => {
    params.set(`features[subscription_cancel][cancellation_reason][options][${index}]`, option);
  });
  spec.prices.forEach((price, index) => {
    params.set(`features[subscription_update][products][0][prices][${index}]`, prices[price]);
  });
  return params;
}

/** Un precio que ya existe sirve si es del producto, el monto, la moneda y el periodo que se piden */
function samePrice(price: Json, spec: PriceSpec): boolean {
  const recurring = asRecord(price.recurring);
  return (
    idOf(price.product) === spec.product &&
    price.unit_amount === spec.amountMxn * 100 &&
    String(price.currency).toLowerCase() === 'mxn' &&
    (spec.interval === null ? price.type === 'one_time' : recurring.interval === spec.interval)
  );
}

export async function setupStripeTest(input: {
  /** null cuando la pone el proxy del entorno, como en la sesión en la nube */
  key: string | null;
  fetch: typeof fetch;
  appUrl?: string;
  taxBehavior?: TaxBehavior;
  archiveOld?: boolean;
}): Promise<SetupResult> {
  if (input.key !== null && !isTestKey(input.key)) {
    throw new StripeSetupError(
      'Solo se aceptan llaves de prueba, que empiezan con sk_test_ o rk_test_',
    );
  }
  const appUrl = input.appUrl ?? DEFAULT_APP_URL;
  if (!URL.canParse(appUrl)) throw new StripeSetupError('La dirección de la app no es una URL');

  /** Una llamada a Stripe. Con missingIsNull un 404 devuelve null. Cualquier otro error lanza */
  async function call(
    method: 'GET' | 'POST',
    path: string,
    params?: URLSearchParams,
    options: { idempotencyKey?: string; missingIsNull?: boolean } = {},
  ): Promise<Json | null> {
    const query = method === 'GET' && params ? `?${params.toString()}` : '';
    const reply = await input.fetch(`https://api.stripe.com${path}${query}`, {
      method,
      headers: {
        ...(input.key === null ? {} : { authorization: `Bearer ${input.key}` }),
        'stripe-version': STRIPE_API_VERSION,
        ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
      },
      ...(method === 'POST' ? { body: params ?? new URLSearchParams() } : {}),
    });
    const body = asRecord(await reply.json().catch(() => ({})));
    if (reply.status === 404 && options.missingIsNull) return null;
    if (!reply.ok) {
      // Nunca se imprime la llave. Solo lo que devuelve Stripe
      const message = asString(asRecord(body.error).message) ?? '';
      throw new StripeSetupError(
        `Stripe respondió ${reply.status} en ${method} ${path}. ${message}`.trim(),
      );
    }
    // Nada de la cuenta real, aunque la llave pasara la revisión
    if (body.livemode === true) {
      throw new StripeSetupError(
        `Stripe respondió en modo real en ${method} ${path}. Solo se trabaja en modo prueba. Revisa la llave`,
      );
    }
    return body;
  }
  const created = (body: Json | null, what: string): string => {
    const id = asString(body?.id);
    if (!id) throw new StripeSetupError(`Stripe no devolvió el id de ${what}`);
    return id;
  };

  // Con la llave del proxy no se ve su prefijo. El saldo dice si es de prueba antes de crear nada
  if (input.key === null) {
    const balance = await call('GET', '/v1/balance');
    if (balance?.livemode !== false) {
      throw new StripeSetupError(
        'La llave que pone el proxy del entorno no es de prueba. No se creó nada. Pon una sk_test_ o rk_test_',
      );
    }
  }

  // Productos con id fijo
  for (const product of PRODUCT_SPECS) {
    const found = await call('GET', `/v1/products/${product.id}`, undefined, {
      missingIsNull: true,
    });
    if (!found) {
      await call(
        'POST',
        '/v1/products',
        new URLSearchParams({
          id: product.id,
          name: product.name,
          description: product.description,
          'metadata[studiare_key]': product.id,
        }),
        { idempotencyKey: `studiare-setup-product-${product.id}` },
      );
    } else if (found.active === false) {
      await call('POST', `/v1/products/${product.id}`, new URLSearchParams({ active: 'true' }));
    }
  }

  // Precios por su clave de búsqueda
  const priceIds = {} as Record<PriceKey, string>;
  const ids: SetupId[] = [];
  const replacedPrices: string[] = [];
  const archivedPrices: string[] = [];
  for (const spec of PRICE_SPECS) {
    const found = asList(
      await call(
        'GET',
        '/v1/prices',
        new URLSearchParams({ 'lookup_keys[]': spec.lookupKey, active: 'true', limit: '1' }),
      ),
    )[0];
    const holder = asString(found?.id);
    if (found && holder && samePrice(found, spec)) {
      priceIds[spec.key] = holder;
      ids.push({ env: spec.env, id: holder, status: 'reused' });
      continue;
    }
    const params = new URLSearchParams({
      product: spec.product,
      currency: 'mxn',
      unit_amount: String(spec.amountMxn * 100),
      lookup_key: spec.lookupKey,
      nickname: spec.nickname,
      tax_behavior: input.taxBehavior ?? 'inclusive',
      'metadata[studiare_key]': spec.key,
    });
    if (spec.interval) params.set('recurring[interval]', spec.interval);
    if (holder) params.set('transfer_lookup_key', 'true');
    const id = created(
      await call('POST', '/v1/prices', params, {
        idempotencyKey: `studiare-setup-price-${spec.lookupKey}${holder ? `-sin-${holder}` : ''}`,
      }),
      `el precio ${spec.lookupKey}`,
    );
    priceIds[spec.key] = id;
    ids.push({ env: spec.env, id, status: 'created' });
    if (holder) {
      replacedPrices.push(holder);
      if (input.archiveOld) {
        await call('POST', `/v1/prices/${holder}`, new URLSearchParams({ active: 'false' }));
        archivedPrices.push(holder);
      }
    }
  }

  // Cupón con id fijo y su código para clientes nuevos
  const coupon = await call('GET', `/v1/coupons/${PROMO_SPEC.coupon}`, undefined, {
    missingIsNull: true,
  });
  if (!coupon) {
    await call(
      'POST',
      '/v1/coupons',
      new URLSearchParams({
        id: PROMO_SPEC.coupon,
        name: PROMO_SPEC.name,
        percent_off: String(PROMO_SPEC.percentOff),
        duration: 'repeating',
        duration_in_months: String(PROMO_SPEC.durationInMonths),
        'metadata[studiare_key]': 'coupon_prueba10',
      }),
      { idempotencyKey: `studiare-setup-coupon-${PROMO_SPEC.coupon}` },
    );
  }
  const foundCode = asString(
    asList(
      await call(
        'GET',
        '/v1/promotion_codes',
        new URLSearchParams({ code: PROMO_SPEC.code, active: 'true', limit: '1' }),
      ),
    )[0]?.id,
  );
  // Desde clover el cupón va dentro de promotion (docs-digest, sección 0)
  const promotionId =
    foundCode ??
    created(
      await call(
        'POST',
        '/v1/promotion_codes',
        new URLSearchParams({
          'promotion[type]': 'coupon',
          'promotion[coupon]': PROMO_SPEC.coupon,
          code: PROMO_SPEC.code,
          'restrictions[first_time_transaction]': 'true',
          'metadata[studiare_key]': 'promo_prueba10',
        }),
        { idempotencyKey: `studiare-setup-promotion-${PROMO_SPEC.code}` },
      ),
      'el código de descuento',
    );

  // Configuraciones del portal por su metadata. Las que existen se ponen al día con los precios de hoy
  const configs = asList(
    await call(
      'GET',
      '/v1/billing_portal/configurations',
      new URLSearchParams({ active: 'true', limit: '100' }),
    ),
  );
  for (const spec of PORTAL_SPECS) {
    const params = portalParams(spec, priceIds, appUrl);
    const existing = asString(
      configs.find((config) => asRecord(config.metadata).studiare_key === spec.key)?.id,
    );
    if (existing) {
      await call('POST', `/v1/billing_portal/configurations/${existing}`, params);
      ids.push({ env: spec.env, id: existing, status: 'updated' });
    } else {
      const id = created(
        await call('POST', '/v1/billing_portal/configurations', params, {
          idempotencyKey: `studiare-setup-${spec.key}-${spec.prices.map((key) => priceIds[key]).join('-')}`,
        }),
        `la configuración ${spec.key}`,
      );
      ids.push({ env: spec.env, id, status: 'created' });
    }
  }

  return {
    ids,
    coupon: { id: PROMO_SPEC.coupon, created: !coupon },
    promotionCode: { id: promotionId, code: PROMO_SPEC.code, created: foundCode === null },
    replacedPrices,
    archivedPrices,
  };
}

/** Lo que imprime el script. Los ocho IDs en líneas NOMBRE=valor y el resto como notas, sin la llave */
export function summaryLines(result: SetupResult): string[] {
  const note = { created: '', reused: '  (ya existía)', updated: '  (puesta al día)' } as const;
  const lines = result.ids.map((entry) => `${entry.env}=${entry.id}${note[entry.status]}`);
  lines.push(
    `Cupón ${result.coupon.id} ${result.coupon.created ? 'creado' : 'ya existía'} y código ${result.promotionCode.code} ${result.promotionCode.created ? 'creado' : 'ya existía'}`,
  );
  if (result.archivedPrices.length > 0) {
    lines.push(`Precios viejos archivados ${result.archivedPrices.join(', ')}`);
  } else if (result.replacedPrices.length > 0) {
    lines.push(
      `Precios viejos que cedieron su clave ${result.replacedPrices.join(', ')}. Archívalos con --archive-old cuando los secretos nuevos estén puestos`,
    );
  }
  lines.push('Pon esos ocho valores en Supabase, Edge Functions, Secrets.');
  return lines;
}

/** Los ocho IDs como NOMBRE y valor, en el orden de 2.6. Es lo que lee deploy:supabase --secrets-from */
export function idsRecord(result: SetupResult): Record<SecretName, string> {
  return Object.fromEntries(result.ids.map((entry) => [entry.env, entry.id])) as Record<
    SecretName,
    string
  >;
}

/** Guarda los IDs en un JSON local. Solo los IDs, nunca la llave */
export function writeIdsFile(path: string, result: SetupResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(idsRecord(result), null, 2)}\n`, { mode: 0o600 });
}

/** Las opciones que llevan valor. Aceptan --nombre=valor y --nombre valor */
const VALUE_FLAGS = ['app-url', 'tax', 'write-ids'] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

export interface SetupArgs {
  values: Partial<Record<ValueFlag, string>>;
  archiveOld: boolean;
}

/** Lee las opciones. Devuelve un error si falta un valor o si una opción no existe */
export function parseSetupArgs(argv: readonly string[]): SetupArgs | { error: string } {
  const args: SetupArgs = { values: {}, archiveOld: false };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index] ?? '';
    if (raw === '--archive-old') {
      args.archiveOld = true;
      continue;
    }
    const [flag = '', inline] = raw.includes('=') ? raw.split(/=(.*)/s, 2) : [raw, undefined];
    const name = VALUE_FLAGS.find((candidate) => `--${candidate}` === flag);
    if (!name) {
      // No se repite lo que llegó, por si alguien pegó ahí la llave
      return {
        error: `No conozco la opción número ${index + 1}. Las que hay son --app-url, --tax, --write-ids y --archive-old`,
      };
    }
    let value = inline;
    if (value === undefined) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        value = next;
        index += 1;
      }
    }
    if (!value) return { error: `--${name} necesita un valor, por ejemplo --${name}=...` };
    args.values[name] = value;
  }
  return args;
}

/** Cuánto de cada cosa creó o reutilizó una corrida, sin la llave */
function createdSummary(result: SetupResult): string {
  const prices = result.ids.filter((entry) => entry.env.startsWith('STRIPE_PRICE_'));
  const portals = result.ids.filter((entry) => entry.env.startsWith('STRIPE_PORTAL_'));
  const count = (list: SetupId[], status: SetupId['status']) =>
    list.filter((entry) => entry.status === status).length;
  const parts = [
    `${count(prices, 'created')} precios y ${count(portals, 'created')} configuraciones del portal creados`,
    count(prices, 'reused') > 0 ? `${count(prices, 'reused')} precios que ya existían` : '',
    count(portals, 'updated') > 0
      ? `${count(portals, 'updated')} configuraciones del portal puestas al día`
      : '',
    `el cupón ${result.coupon.created ? 'creado' : 'que ya existía'}`,
    `el código ${result.promotionCode.created ? 'creado' : 'que ya existía'}`,
  ].filter((part) => part !== '');
  return parts.join(', ');
}

export interface SetupCliDeps {
  fetch: typeof fetch;
  log: (line: string) => void;
  error: (line: string) => void;
  /** Para probar una falla al guardar. Por omisión writeIdsFile */
  writeIds?: (path: string, result: SetupResult) => void;
}

/**
 * La llave de STRIPE_SECRET_KEY o, sin ella y con el proxy del entorno, null, porque la pone el proxy.
 * Sin las dos queda vacía y setupStripeTest la rechaza
 */
export function setupKey(env: Record<string, string | undefined>): string | null {
  const key = env.STRIPE_SECRET_KEY ?? '';
  if (key !== '') return key;
  return (env.HTTPS_PROXY ?? env.https_proxy ?? '') !== '' ? null : '';
}

/** La corrida desde la línea de comandos. Devuelve el código de salida */
export async function runSetupCli(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  deps: SetupCliDeps,
): Promise<number> {
  const args = parseSetupArgs(argv);
  if ('error' in args) {
    deps.error(args.error);
    return 2;
  }
  const taxArg = args.values.tax;
  const taxBehavior: TaxBehavior =
    taxArg === 'exclusive' || taxArg === 'unspecified' ? taxArg : 'inclusive';
  let result: SetupResult;
  try {
    result = await setupStripeTest({
      key: setupKey(env),
      fetch: deps.fetch,
      appUrl: args.values['app-url'] ?? env.APP_URL ?? DEFAULT_APP_URL,
      taxBehavior,
      archiveOld: args.archiveOld,
    });
  } catch (error) {
    // Un error ajeno, como el de fetch con un encabezado inválido, podría traer la llave en su mensaje
    deps.error(
      error instanceof StripeSetupError
        ? error.message
        : `Falló la configuración (${error instanceof Error ? error.name : 'error'})`,
    );
    return 1;
  }
  for (const line of summaryLines(result)) deps.log(line);
  const idsPath = args.values['write-ids'];
  if (idsPath) {
    try {
      (deps.writeIds ?? writeIdsFile)(resolve(idsPath), result);
    } catch (error) {
      // Lo de Stripe ya quedó. Se dice qué y cómo seguir, sin el mensaje del error, que no hace falta
      const code = (error as { code?: unknown } | null)?.code;
      const reason =
        typeof code === 'string' && /^E[A-Z]+$/.test(code)
          ? code
          : error instanceof Error
            ? error.name
            : 'error';
      deps.error(
        `No pude guardar los IDs en ${idsPath} (${reason}). En Stripe ya quedó lo de arriba, ${createdSummary(result)}. Los ocho IDs están en las líneas NOMBRE=valor de arriba. Corre otra vez con --write-ids en una carpeta donde se pueda escribir. Reutiliza todo sin crear nada nuevo`,
      );
      return 1;
    }
    deps.log(
      `Guardé los ocho IDs en ${idsPath}. Ponlos con npm run deploy:supabase -- --plan b10 --secrets-from ${idsPath}`,
    );
  }
  return 0;
}

// Uso desde la línea de comandos
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runSetupCli(process.argv.slice(2), process.env, {
    fetch,
    log: (line) => {
      console.log(line);
    },
    error: (line) => {
      console.error(line);
    },
  }).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      console.error('Falló la configuración');
      process.exitCode = 1;
    },
  );
}
