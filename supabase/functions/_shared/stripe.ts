// Stripe en las funciones de pago (B10 del plan del cambio, 2 del diseño).
//
// Aquí vive lo que es de Stripe y no depende de la base. Las llamadas con la versión fija de la API, los
// parámetros de cada sesión (suscripción, pase y portal), la cancelación que piden las acciones y la
// traducción de cada evento a los avisos de billingTypes.ts que entienden apply_charge,
// apply_subscription_state y note_trial_will_end. Los manejadores de payments.ts arman todo con esto.
// No depende de Deno, así se prueba con Vitest (D-096).
//
// Los campos se leyeron de la especificación de la API 2026-09-30.endive (docs-digest). La lectura es
// tolerante a las formas anteriores. Por ejemplo, el fin del periodo se lee de los items de la
// suscripción y, si no viene, de la suscripción, porque Stripe lo movió a los items en basil
import {
  PLAN_PRICES_MXN,
  STRIPE_API_VERSION,
  isPaidPlan,
  isPassPlan,
  isUuid,
  type BillingAction,
  type ChargeNotice,
  type FunctionEnv,
  type PaidPlan,
  type PassPlan,
  type SubscriptionNotice,
  type SubscriptionStatus,
  type TrialEndingNotice,
} from './billingTypes.ts';
import { asArray, asNumber, asRecord, asString, subscriptionUrl, type Json } from './http.ts';

export const STRIPE_API = 'https://api.stripe.com';

/** Días de garantía desde el primer cobro (billing_rules.guaranteeDays) que se dicen en la página de pago */
export const GUARANTEE_DAYS = 7;

export interface StripeClient {
  key: string;
  fetch: typeof fetch;
}

export interface StripeReply {
  ok: boolean;
  status: number;
  body: Json;
}

/**
 * Llama a Stripe con la llave del servidor y la versión fija de la API (8.1). GET y DELETE mandan los
 * parámetros en la dirección y POST en el cuerpo. Lanza solo si no hay red
 */
export async function stripeCall(
  client: StripeClient,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: URLSearchParams = new URLSearchParams(),
  options: { idempotencyKey?: string } = {},
): Promise<StripeReply> {
  const query = method !== 'POST' && params.toString() !== '' ? `?${params.toString()}` : '';
  const headers: Record<string, string> = {
    authorization: `Bearer ${client.key}`,
    'stripe-version': STRIPE_API_VERSION,
  };
  if (method === 'POST') headers['content-type'] = 'application/x-www-form-urlencoded';
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  const reply = await client.fetch(`${STRIPE_API}${path}${query}`, {
    method,
    headers,
    ...(method === 'POST' ? { body: params } : {}),
  });
  const body = asRecord(await reply.json().catch(() => ({})));
  return { ok: reply.ok, status: reply.status, body };
}

/**
 * Por qué Stripe rechazó una petición, en una línea y sin llaves. Stripe responde con un objeto error
 * que trae el tipo, el código, el parámetro que no le gustó y un mensaje en inglés
 */
export function stripeFailureLine(reply: StripeReply): string {
  const failure = asRecord(reply.body.error);
  return [
    `estado ${reply.status}`,
    `tipo ${asString(failure.type) ?? '?'}`,
    `código ${asString(failure.code) ?? '?'}`,
    `parámetro ${asString(failure.param) ?? '?'}`,
    `mensaje ${asString(failure.message) ?? '?'}`,
  ].join(', ');
}

/** Stripe dice que el cliente guardado ya no existe, por ejemplo si se borró o se cambió de llaves */
export function isMissingCustomer(reply: StripeReply): boolean {
  const failure = asRecord(reply.body.error);
  const message = asString(failure.message) ?? '';
  return (
    !reply.ok &&
    ((failure.code === 'resource_missing' && failure.param === 'customer') ||
      /no such customer/i.test(message))
  );
}

// ---------------------------------------------------------------------------------------------
// Precios

/** El secreto con el Price ID de cada plan con renovación (2.6) */
export const PLAN_PRICE_SECRETS = {
  founder: 'STRIPE_PRICE_FOUNDER',
  founder_annual: 'STRIPE_PRICE_FOUNDER_ANNUAL',
  monthly: 'STRIPE_PRICE_MONTHLY',
  annual: 'STRIPE_PRICE_ANNUAL',
} as const satisfies Record<PaidPlan, keyof FunctionEnv>;

/** El secreto con el Price ID de cada pase de un solo pago (2.6) */
export const PASS_PRICE_SECRETS = {
  monthly: 'STRIPE_PRICE_PASS_MONTHLY',
  annual: 'STRIPE_PRICE_PASS_ANNUAL',
} as const satisfies Record<PassPlan, keyof FunctionEnv>;

/**
 * El Price ID de un secreto. Si falta, o si trae otra cosa como el ID del producto (prod_), que en el
 * panel de Stripe se ve antes que el del precio, devuelve la línea para el registro con el secreto que
 * hay que cambiar
 */
export function priceFromEnv(
  env: FunctionEnv,
  name: keyof FunctionEnv,
): { ok: true; price: string } | { ok: false; line: string } {
  const price = (env[name] ?? '').trim();
  if (price === '')
    return { ok: false, line: `Falta el secreto ${name} en Supabase, Edge Functions, Secrets` };
  if (!price.startsWith('price_')) {
    return {
      ok: false,
      line: `${name} no es un Price ID. Debe empezar con price_ y empieza con ${price.split('_')[0] ?? '?'}_. Cópialo de la sección Pricing del producto en Stripe`,
    };
  }
  return { ok: true, price };
}

/** El plan de un Price ID según los secretos. null si no es ninguno de los cuatro */
export function planOfPrice(priceId: string | null, env: FunctionEnv): PaidPlan | null {
  if (!priceId) return null;
  for (const [plan, name] of Object.entries(PLAN_PRICE_SECRETS) as [
    PaidPlan,
    keyof FunctionEnv,
  ][]) {
    if ((env[name] ?? '').trim() === priceId) return plan;
  }
  return null;
}

/** El pase de un Price ID según los secretos. null si no es ninguno de los dos */
export function passPlanOfPrice(priceId: string | null, env: FunctionEnv): PassPlan | null {
  if (!priceId) return null;
  for (const [plan, name] of Object.entries(PASS_PRICE_SECRETS) as [
    PassPlan,
    keyof FunctionEnv,
  ][]) {
    if ((env[name] ?? '').trim() === priceId) return plan;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Textos de la página de pago

const longDate = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeZone: 'America/Mexico_City',
});

const pesos = (amount: number) =>
  `$${amount.toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN`;

const isYearly = (plan: PaidPlan) => plan === 'annual' || plan === 'founder_annual';

/**
 * Lo que dice la página de Stripe junto al botón de pagar (custom_text, 4.18). Repite el aviso de la
 * app con la prueba, la renovación y la garantía. Los términos con su casilla llegan en B16 (8.22)
 */
export function subscriptionNoticeText(
  plan: PaidPlan,
  trialDays: number | null,
  nowMs: number,
): string {
  const amount = pesos(PLAN_PRICES_MXN[plan]);
  const every = isYearly(plan) ? 'cada año' : 'cada mes';
  if (trialDays) {
    const end = longDate.format(new Date(nowMs + trialDays * 86_400_000));
    return `Hoy no se cobra nada. Tu prueba gratis termina el ${end}. Ese día se cobran ${amount} y luego ${every} hasta que canceles, salvo que tu código de descuento baje el primer cobro. Puedes cancelar antes en Studiare, Suscripción, y no se te cobra. Después del primer cobro tienes ${GUARANTEE_DAYS} días de garantía para pedir el reembolso completo.`;
  }
  return `Hoy se cobran ${amount} y luego ${every} hasta que canceles en Studiare, Suscripción. Si usas un código de descuento, el primer cobro baja. Tienes ${GUARANTEE_DAYS} días de garantía desde este cobro para pedir el reembolso completo.`;
}

/** El aviso de un pase de un solo pago (3.1.2). Con OXXO la garantía se devuelve por transferencia (8.7) */
export function passNoticeText(method: 'oxxo' | 'spei'): string {
  const base = `Es un pago único. No se renueva ni guarda tu tarjeta. Si ya tienes un pase, este se suma desde su fecha de fin. Tienes ${GUARANTEE_DAYS} días de garantía desde el pago.`;
  return method === 'oxxo'
    ? `${base} Los pagos en OXXO no se pueden devolver en la tienda, así que la garantía te la devolvemos por transferencia.`
    : `${base} Transfiere el monto exacto a la CLABE que te da Stripe.`;
}

// ---------------------------------------------------------------------------------------------
// Sesiones de pago

export interface SubscriptionSessionInput {
  appUrl: string;
  userId: string;
  customerId: string;
  plan: PaidPlan;
  priceId: string;
  /** Días de prueba, o null sin prueba */
  trialDays: number | null;
  automaticTax: boolean;
  nowMs: number;
}

/**
 * La sesión de suscripción (2.2). Sin payment_method_types ni allowed_payment_method_types, así Stripe
 * muestra tarjeta, Apple Pay y Google Pay según el dispositivo. Sin payment_method_collection, que por
 * omisión es always y guarda la tarjeta aunque la prueba cobre 0
 */
export function subscriptionSessionParams(input: SubscriptionSessionInput): URLSearchParams {
  const trial = input.trialDays !== null && input.trialDays > 0;
  const params = new URLSearchParams({
    mode: 'subscription',
    customer: input.customerId,
    'line_items[0][price]': input.priceId,
    'line_items[0][quantity]': '1',
    client_reference_id: input.userId,
    'metadata[user_id]': input.userId,
    'metadata[plan]': input.plan,
    'metadata[mode]': 'subscription',
    'metadata[trial]': String(trial),
    // La suscripción y sus facturas llevan el mismo dato, para los cobros siguientes
    'subscription_data[metadata][user_id]': input.userId,
    'subscription_data[metadata][plan]': input.plan,
    'subscription_data[metadata][trial]': String(trial),
    allow_promotion_codes: 'true',
    // La página de pago en el español de América Latina, como la app
    locale: 'es-419',
    'custom_text[submit][message]': subscriptionNoticeText(
      input.plan,
      trial ? input.trialDays : null,
      input.nowMs,
    ),
    success_url: subscriptionUrl(input.appUrl, { pago: 'ok' }),
    cancel_url: subscriptionUrl(input.appUrl, { pago: 'cancelado' }),
  });
  if (trial) params.set('subscription_data[trial_period_days]', String(input.trialDays));
  if (input.automaticTax) {
    params.set('automatic_tax[enabled]', 'true');
    params.set('billing_address_collection', 'required');
    params.set('tax_id_collection[enabled]', 'true');
    // El cliente ya existe y Stripe pide permiso para guardar en él la dirección y el nombre que se
    // capturen para calcular el impuesto
    params.set('customer_update[address]', 'auto');
    params.set('customer_update[name]', 'auto');
  }
  return params;
}

export interface PassSessionInput {
  appUrl: string;
  userId: string;
  customerId: string;
  plan: PassPlan;
  priceId: string;
  method: 'oxxo' | 'spei';
  oxxoExpiresDays: number;
}

/**
 * La sesión del pase de un solo pago (2.2). Solo el método elegido. SPEI es customer_balance con
 * transferencia de México y necesita el cliente, que toda sesión ya lleva
 */
export function passSessionParams(input: PassSessionInput): URLSearchParams {
  const params = new URLSearchParams({
    mode: 'payment',
    customer: input.customerId,
    'line_items[0][price]': input.priceId,
    'line_items[0][quantity]': '1',
    'allowed_payment_method_types[0]': input.method === 'oxxo' ? 'oxxo' : 'customer_balance',
    client_reference_id: input.userId,
    'metadata[user_id]': input.userId,
    'metadata[plan]': input.plan,
    'metadata[mode]': 'pass',
    'metadata[method]': input.method,
    'payment_intent_data[metadata][user_id]': input.userId,
    'payment_intent_data[metadata][plan]': input.plan,
    'payment_intent_data[metadata][mode]': 'pass',
    'payment_intent_data[metadata][method]': input.method,
    allow_promotion_codes: 'true',
    locale: 'es-419',
    'custom_text[submit][message]': passNoticeText(input.method),
    success_url: subscriptionUrl(input.appUrl, { pago: 'pendiente', metodo: input.method }),
    cancel_url: subscriptionUrl(input.appUrl, { pago: 'cancelado' }),
  });
  if (input.method === 'oxxo') {
    params.set('payment_method_options[oxxo][expires_after_days]', String(input.oxxoExpiresDays));
    // Para calcular el vencimiento de la ficha al llegar el aviso
    params.set('metadata[oxxo_days]', String(input.oxxoExpiresDays));
  } else {
    params.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
    params.set('payment_method_options[customer_balance][bank_transfer][type]', 'mx_bank_transfer');
  }
  return params;
}

/** El cliente de Stripe de una cuenta. Su id de alumno va en la metadata y la página en español */
export function customerParams(user: { id: string; email: string | null }): URLSearchParams {
  const params = new URLSearchParams({
    'metadata[user_id]': user.id,
    'preferred_locales[0]': 'es-419',
  });
  if (user.email) params.set('email', user.email);
  return params;
}

/**
 * La lectura de una sesión con su suscripción y sus códigos de descuento (2.4). El código puede venir en
 * los descuentos de la sesión o de su suscripción. No está confirmado que la sesión los llene cuando el
 * alumno teclea el código (docs-digest, sección 5), por eso también se pide el desglose, que sí lo
 * refleja pero solo con el id del código. Stripe no expande más de cuatro niveles
 */
export function sessionReadParams(): URLSearchParams {
  const params = new URLSearchParams();
  params.append('expand[]', 'subscription');
  params.append('expand[]', 'subscription.discounts.promotion_code');
  params.append('expand[]', 'discounts.promotion_code');
  params.append('expand[]', 'total_details.breakdown');
  return params;
}

/**
 * Los id de los códigos de descuento del desglose de una sesión, para leer su texto cuando la sesión no
 * lo trae en sus descuentos
 */
export function breakdownPromotionCodeIds(session: unknown): string[] {
  const breakdown = asRecord(asRecord(asRecord(session).total_details).breakdown);
  const ids = asArray(breakdown.discounts)
    .map((entry) => idOf(asRecord(asRecord(entry).discount).promotion_code))
    .filter((id): id is string => id?.startsWith('promo_') === true);
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------------------------
// Portal

export interface PortalSessionInput {
  customerId: string;
  appUrl: string;
  /** bpc_ de la configuración, o null para la de omisión */
  configuration: string | null;
  flow: 'update' | 'cancel' | null;
  subscriptionId: string | null;
}

/** La sesión del portal (2.3). Con flow abre directo cambiar de plan o cancelar */
export function portalSessionParams(input: PortalSessionInput): URLSearchParams {
  const back = subscriptionUrl(input.appUrl);
  const params = new URLSearchParams({
    customer: input.customerId,
    return_url: back,
    locale: 'es-419',
  });
  if (input.configuration) params.set('configuration', input.configuration);
  if (input.flow && input.subscriptionId) {
    const type = input.flow === 'update' ? 'subscription_update' : 'subscription_cancel';
    params.set('flow_data[type]', type);
    params.set(`flow_data[${type}][subscription]`, input.subscriptionId);
    params.set('flow_data[after_completion][type]', 'redirect');
    params.set('flow_data[after_completion][redirect][return_url]', back);
  }
  return params;
}

// ---------------------------------------------------------------------------------------------
// Acciones

/**
 * Cancela una suscripción en el acto, sin prorrateo ni factura final (8.6). Si Stripe dice que no
 * se pudo, se lee la suscripción y una ya cancelada cuenta como hecha. El error no lleva llaves
 */
export async function cancelStripeSubscription(
  client: StripeClient,
  subscriptionId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const path = `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`;
  try {
    const reply = await stripeCall(
      client,
      'DELETE',
      path,
      new URLSearchParams({ prorate: 'false', invoice_now: 'false' }),
    );
    if (reply.ok) return { ok: true, error: null };
    const current = await stripeCall(client, 'GET', path);
    const status = asString(current.body.status);
    if (current.ok && (status === 'canceled' || status === 'incomplete_expired')) {
      return { ok: true, error: null };
    }
    return { ok: false, error: `Stripe no canceló la suscripción. ${stripeFailureLine(reply)}` };
  } catch (error) {
    const kind = error instanceof Error ? error.name : typeof error;
    return { ok: false, error: `Sin red hacia Stripe al cancelar. ${kind}` };
  }
}

/** Ejecuta una acción que decidió la base. Hoy solo hay cancelar */
export function runStripeAction(
  client: StripeClient,
  action: BillingAction,
): Promise<{ ok: boolean; error: string | null }> {
  return cancelStripeSubscription(client, action.target);
}

// ---------------------------------------------------------------------------------------------
// De un evento a los avisos

export const unixToIso = (seconds: unknown): string | null => {
  const value = asNumber(seconds);
  return value === null ? null : new Date(value * 1000).toISOString();
};

/** Centavos a pesos. null si la moneda no es peso mexicano */
export function mxnFromCents(amount: unknown, currency: unknown): number | null {
  const cents = asNumber(amount);
  if (cents === null || String(currency).toLowerCase() !== 'mxn') return null;
  return Math.round(cents) / 100;
}

/** El id de algo que llega como texto o como objeto expandido */
export const idOf = (value: unknown): string | null =>
  asString(value) ?? asString(asRecord(value).id);

/** El id del alumno que esta misma función puso en la metadata. Un id que no es de usuario no cuenta */
export function ownUserId(...sources: unknown[]): string | null {
  for (const source of sources) {
    const userId = asRecord(source).user_id;
    if (isUuid(userId)) return userId;
  }
  return null;
}

/** El primer código de descuento expandido que aparezca, en mayúsculas */
export function promotionCodeOf(...discountLists: unknown[]): string | null {
  for (const list of discountLists) {
    for (const entry of asArray(list)) {
      const code = asString(asRecord(asRecord(entry).promotion_code).code);
      if (code) return code.toUpperCase();
    }
  }
  return null;
}

/**
 * El estado de Stripe en el de la base (1.3). past_due, unpaid y paused quedan past_due. canceled e
 * incomplete_expired terminaron (ended). incomplete y lo que no se conozca se ignoran
 */
export function stripeSubscriptionStatus(status: unknown): SubscriptionStatus | null {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'ended';
    default:
      return null;
  }
}

export interface NoticeContext {
  eventId: string;
  /** Hora del evento, o de la lectura a Stripe */
  eventAt: string;
  payload: Json;
  env: FunctionEnv;
  log: (line: string) => void;
}

/**
 * El aviso de estado de una suscripción de Stripe. ended es customer.subscription.deleted. El plan sale
 * del Price ID, y un Price ID que no es de ningún secreto deja una línea en el registro y llega como null
 */
export function subscriptionNotice(
  subscription: unknown,
  context: NoticeContext & { ended?: boolean },
): SubscriptionNotice | null {
  const sub = asRecord(subscription);
  const id = asString(sub.id);
  if (!id) return null;
  const status = context.ended ? 'ended' : stripeSubscriptionStatus(sub.status);
  if (!status) return null;
  const item = asRecord(asArray(asRecord(sub.items).data)[0]);
  const priceId = idOf(item.price) ?? idOf(item.plan);
  const plan = planOfPrice(priceId, context.env);
  if (priceId && !plan) {
    context.log(
      `Price ID desconocido ${priceId} en la suscripción ${id}. Revisa los secretos STRIPE_PRICE_. No cambia el plan`,
    );
  }
  let periodEnd = unixToIso(item.current_period_end) ?? unixToIso(sub.current_period_end);
  const endedAt = unixToIso(sub.ended_at);
  if (status === 'ended' && endedAt && (!periodEnd || endedAt < periodEnd)) periodEnd = endedAt;
  const cancelAt = asNumber(sub.cancel_at);
  return {
    provider: 'stripe',
    eventId: context.eventId,
    eventAt: context.eventAt,
    payload: context.payload,
    userId: ownUserId(sub.metadata),
    subscriptionId: id,
    plan,
    status,
    periodEnd,
    trialEnd: unixToIso(sub.trial_end),
    // Cancelar al final del periodo, o una cancelación ya agendada para una fecha
    cancelAtPeriodEnd:
      sub.cancel_at_period_end === true || (cancelAt !== null && status !== 'ended'),
    // El portal agenda la bajada de plan con un subscription schedule
    scheduledChange: sub.schedule !== null && sub.schedule !== undefined,
    priceId,
    promotionCode: promotionCodeOf(sub.discounts),
  };
}

/** El aviso de fin de prueba de customer.subscription.trial_will_end */
export function trialEndingNotice(
  subscription: unknown,
  context: Pick<NoticeContext, 'eventId' | 'payload'>,
): TrialEndingNotice | null {
  const sub = asRecord(subscription);
  const id = asString(sub.id);
  if (!id) return null;
  return {
    provider: 'stripe',
    eventId: context.eventId,
    payload: context.payload,
    userId: ownUserId(sub.metadata),
    subscriptionId: id,
    trialEnd: unixToIso(sub.trial_end),
  };
}

const emptyCharge = (
  context: Pick<NoticeContext, 'eventId' | 'payload'>,
): Omit<ChargeNotice, 'kind' | 'purpose'> => ({
  provider: 'stripe',
  eventId: context.eventId,
  payload: context.payload,
  userId: null,
  plan: null,
  method: null,
  providerPaymentId: null,
  paymentIntentId: null,
  providerSubscriptionId: null,
  amountMxn: null,
  discountMxn: null,
  promotionCode: null,
  periodEnd: null,
  expiresAt: null,
});

/**
 * El cobro de una factura de suscripción (invoice.paid o invoice.payment_failed). Entiende la forma de
 * parent.subscription_details y la anterior. Una factura pagada de 0, como la de la prueba, no es un
 * cobro y devuelve null. El fin del periodo es el mayor de sus líneas, así el cobro de subir de plan
 * alarga hasta el nuevo periodo
 */
export function invoiceChargeNotice(
  invoice: unknown,
  kind: 'paid' | 'failed',
  context: NoticeContext,
): ChargeNotice | null {
  const object = asRecord(invoice);
  const id = asString(object.id);
  if (!id) return null;
  const parent = asRecord(asRecord(object.parent).subscription_details);
  const legacy = asRecord(object.subscription_details);
  const lines = asArray(asRecord(object.lines).data).map(asRecord);
  const firstLine = lines[0] ?? {};
  const linePrice =
    asString(asRecord(asRecord(firstLine.pricing).price_details).price) ?? idOf(firstLine.price);
  const metadataPlan = [parent.metadata, legacy.metadata, firstLine.metadata]
    .map((source) => asRecord(source).plan)
    .find(isPaidPlan);
  const amount = kind === 'paid' ? mxnFromCents(object.amount_paid, object.currency) : null;
  if (kind === 'paid' && (amount === null || amount <= 0)) return null;
  const ends = lines
    .map((line) => asNumber(asRecord(line.period).end))
    .filter((end): end is number => end !== null);
  const discountCents = asArray(object.total_discount_amounts).reduce<number>(
    (sum, entry) => sum + (asNumber(asRecord(entry).amount) ?? 0),
    0,
  );
  return {
    ...emptyCharge(context),
    kind,
    purpose: 'subscription',
    userId: ownUserId(
      parent.metadata,
      legacy.metadata,
      firstLine.metadata,
      asRecord(firstLine.parent).subscription_item_details,
    ),
    plan: planOfPrice(linePrice, context.env) ?? metadataPlan ?? null,
    method: 'card',
    providerPaymentId: id,
    providerSubscriptionId: idOf(parent.subscription) ?? idOf(object.subscription),
    amountMxn: amount,
    discountMxn: kind === 'paid' && discountCents > 0 ? discountCents / 100 : null,
    periodEnd: ends.length > 0 ? unixToIso(Math.max(...ends)) : null,
  };
}

/**
 * El vencimiento de una ficha OXXO. Vence a las 23:59 de Ciudad de México del último día, que no tiene
 * horario de verano desde 2022, así que es UTC menos 6 horas
 */
export function oxxoExpiresAt(createdMs: number, days: number): string {
  const local = new Date(createdMs - 6 * 3_600_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days + 1, 5, 59, 59),
  ).toISOString();
}

export type SessionEventType =
  | 'checkout.session.completed'
  | 'checkout.session.async_payment_succeeded'
  | 'checkout.session.async_payment_failed';

/** Lo que hay que hacer con una sesión de pago terminada */
export interface SessionSteps {
  link: { userId: string; customerId: string } | null;
  state: SubscriptionNotice | null;
  charge: ChargeNotice | null;
}

/** Si la sesión hay que leerla de Stripe antes de aplicarla, para su suscripción y su código */
export function sessionNeedsRead(session: unknown): boolean {
  const object = asRecord(session);
  if (object.mode === 'subscription') return true;
  return (asNumber(asRecord(object.total_details).amount_discount) ?? 0) > 0;
}

/**
 * Los avisos de una sesión de pago (2.4). En suscripción, el estado de la suscripción leída y, si se
 * cobró al momento, su cobro. En pase, la ficha o la transferencia pendiente, el pago o el vencimiento.
 * Quién pagó sale de lo que puso create-checkout, nunca del navegador
 */
export function checkoutSessionSteps(
  type: SessionEventType,
  session: unknown,
  context: NoticeContext,
): SessionSteps | null {
  const object = asRecord(session);
  const sessionId = asString(object.id);
  if (!sessionId) return null;
  const metadata = asRecord(object.metadata);
  const userId = ownUserId({ user_id: object.client_reference_id }, metadata);
  const customerId = idOf(object.customer);
  const link = userId && customerId ? { userId, customerId } : null;
  const discountCents = asNumber(asRecord(object.total_details).amount_discount) ?? 0;
  const promotionCode = promotionCodeOf(object.discounts);
  const amountMxn = mxnFromCents(object.amount_total, object.currency);

  if (object.mode === 'subscription') {
    if (type !== 'checkout.session.completed') return null;
    const subscription = asRecord(object.subscription);
    const state = asString(subscription.id) ? subscriptionNotice(subscription, context) : null;
    if (state) {
      state.userId ??= userId;
      state.promotionCode ??= promotionCode;
    }
    let charge: ChargeNotice | null = null;
    // Con prueba la sesión llega sin pago (no_payment_required) y no es un cobro
    if (object.payment_status === 'paid' && amountMxn !== null && amountMxn > 0) {
      charge = {
        ...emptyCharge(context),
        eventId: `${context.eventId}:charge`,
        kind: 'paid',
        purpose: 'subscription',
        userId,
        plan: state?.plan ?? (isPaidPlan(metadata.plan) ? metadata.plan : null),
        method: 'card',
        // La factura es el mismo id que traerá invoice.paid, así el cobro no se cuenta dos veces
        providerPaymentId: idOf(object.invoice) ?? idOf(object.payment_intent) ?? sessionId,
        providerSubscriptionId: idOf(object.subscription),
        amountMxn,
        discountMxn: discountCents > 0 ? discountCents / 100 : null,
        promotionCode: promotionCode ?? state?.promotionCode ?? null,
        periodEnd: state?.periodEnd ?? null,
      };
    }
    return { link, state, charge };
  }

  if (object.mode !== 'payment') return null;
  // Las líneas no vienen en el aviso. El pase es el que puso create-checkout en la metadata
  const plan = isPassPlan(metadata.plan) ? metadata.plan : null;
  const method = metadata.method === 'oxxo' || metadata.method === 'spei' ? metadata.method : null;
  const intent = idOf(object.payment_intent);
  const base: ChargeNotice = {
    ...emptyCharge(context),
    kind: 'paid',
    purpose: 'pass',
    userId,
    plan,
    method,
    providerPaymentId: intent ?? sessionId,
    paymentIntentId: intent,
    amountMxn,
    discountMxn: discountCents > 0 ? discountCents / 100 : null,
    promotionCode,
  };
  if (type === 'checkout.session.async_payment_failed') {
    return { link, state: null, charge: { ...base, kind: 'expired' } };
  }
  if (type === 'checkout.session.async_payment_succeeded' || object.payment_status === 'paid') {
    return { link, state: null, charge: base };
  }
  // Ficha OXXO o datos de SPEI generados. Todavía no da acceso
  const created = asNumber(object.created);
  const days = Number(metadata.oxxo_days);
  const expiresAt =
    method === 'oxxo' && created !== null
      ? oxxoExpiresAt(created * 1000, Number.isInteger(days) && days > 0 ? days : 3)
      : null;
  return { link, state: null, charge: { ...base, kind: 'pending', expiresAt } };
}

/**
 * Un cargo devuelto por completo (charge.refunded). Stripe no dice a qué alumno ni a qué factura
 * corresponde, solo el cliente, el PaymentIntent y el monto, y de ahí la base encuentra el cobro. Los
 * reembolsos parciales se ignoran, porque quitar el plan por una devolución chica sería injusto
 */
export function refundedCharge(
  charge: unknown,
  context: Pick<NoticeContext, 'eventId' | 'payload'>,
): { customerId: string; notice: ChargeNotice } | null {
  const object = asRecord(charge);
  if (object.refunded !== true) return null;
  const customerId = idOf(object.customer);
  const amountMxn = mxnFromCents(object.amount, object.currency);
  if (customerId === null || amountMxn === null || amountMxn <= 0) return null;
  return {
    customerId,
    notice: {
      ...emptyCharge(context),
      kind: 'refunded',
      // La base usa el propósito del cobro que encuentra
      purpose: 'subscription',
      paymentIntentId: idOf(object.payment_intent),
      amountMxn,
    },
  };
}
