// Llamadas de las funciones a Supabase con fetch, sin librerías (Fase P bloque 5, D-096). La llave
// de servicio solo existe en el entorno de la función y jamás sale de ella ni llega al navegador.
// Desde B10 los nombres de los parámetros de cada llamada son el contrato con las funciones de la base
// (migraciones 20261022000001 a 20261022000003, 6.5 del diseño).
import {
  isProvider,
  type AuthenticatedUser,
  type BillingAction,
  type ChargeNotice,
  type CheckoutContext,
  type CheckoutSubscription,
  type Provider,
  type SubscriptionNotice,
  type TrialEndingNotice,
} from './billingTypes.ts';
import { asArray, asRecord, asString } from './http.ts';

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

/** Quién es el dueño del token que mandó el navegador. null si Supabase no lo reconoce */
export async function authenticateUser(
  env: SupabaseEnv,
  authorization: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthenticatedUser | null> {
  if (!authorization?.toLowerCase().startsWith('bearer ')) return null;
  const reply = await fetchImpl(`${env.url}/auth/v1/user`, {
    headers: { apikey: env.anonKey, authorization },
  });
  if (!reply.ok) return null;
  const user: unknown = await reply.json();
  if (user === null || typeof user !== 'object') return null;
  const { id, email } = user as { id?: unknown; email?: unknown };
  return typeof id === 'string' && id !== ''
    ? { id, email: typeof email === 'string' ? email : null }
    : null;
}

const serviceHeaders = (env: SupabaseEnv) => ({
  apikey: env.serviceKey,
  authorization: `Bearer ${env.serviceKey}`,
  'content-type': 'application/json',
});

/** Llama a una función de la base con la llave de servicio. Lanza si la base no contesta bien */
async function callRpc(
  env: SupabaseEnv,
  name: string,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const reply = await fetchImpl(`${env.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify(args),
  });
  if (!reply.ok) throw new Error(`${name} respondió ${reply.status}`);
  return reply.json();
}

/** Guarda con qué cliente de Stripe pagó el alumno. Lanza si la base falla */
export async function linkCustomerViaRest(
  env: SupabaseEnv,
  link: { userId: string; customerId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await callRpc(
    env,
    'record_billing_customer',
    { p_provider: 'stripe', p_customer_id: link.customerId, p_user: link.userId },
    fetchImpl,
  );
}

/** El alumno de un cliente de Stripe. null si no se ligó. Lanza si la base falla */
export async function userOfCustomerViaRest(
  env: SupabaseEnv,
  customerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const result = await callRpc(
    env,
    'billing_user_of_customer',
    { p_provider: 'stripe', p_customer_id: customerId },
    fetchImpl,
  );
  return typeof result === 'string' && result !== '' ? result : null;
}

/** Llama a una función de la base que no devuelve nada. Lanza si la base no contesta bien */
async function callRpcVoid(
  env: SupabaseEnv,
  name: string,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<void> {
  const reply = await fetchImpl(`${env.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify(args),
  });
  if (!reply.ok) throw new Error(`${name} respondió ${reply.status}`);
}

/** Una función de la base que devuelve un texto, como applied o duplicate */
async function callRpcText(
  env: SupabaseEnv,
  name: string,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<string> {
  const result = await callRpc(env, name, args, fetchImpl);
  if (typeof result !== 'string') throw new Error(`${name} no devolvió un texto`);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Pagos de B10

/**
 * Lo que la base sabe del alumno antes de abrir un pago o el portal (checkout_context). Lanza si la
 * base falla o devuelve algo que no tiene la forma esperada, y entonces no se abre nada (D-118)
 */
export async function checkoutContextViaRest(
  env: SupabaseEnv,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutContext> {
  return parseCheckoutContext(
    await callRpc(env, 'checkout_context', { p_user: userId }, fetchImpl),
  );
}

const isoOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('checkout_context devolvió una fecha que no se lee');
  }
  return value;
};

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`checkout_context no trae ${name}`);
  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`checkout_context no trae ${name}`);
  }
  return value;
}

/** Revisa la forma de checkout_context. Exportada para probarla sin red */
export function parseCheckoutContext(value: unknown): CheckoutContext {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('checkout_context no devolvió un objeto');
  }
  const root = value as Record<string, unknown>;
  const inForce = root.inForce ?? null;
  if (inForce !== null && inForce !== 'subscription' && inForce !== 'pass') {
    throw new Error('checkout_context trae un inForce desconocido');
  }
  let subscription: CheckoutSubscription | null = null;
  if (root.subscription !== null && root.subscription !== undefined) {
    const row = asRecord(root.subscription);
    const plan = asString(row.plan);
    const status = asString(row.status);
    if (!plan || !status) throw new Error('checkout_context trae una suscripción incompleta');
    subscription = {
      plan,
      status,
      provider: isProvider(row.provider) ? row.provider : null,
      subscriptionId: asString(row.subscriptionId),
      periodEnd: isoOrNull(row.periodEnd),
      cancelAtPeriodEnd: row.cancelAtPeriodEnd === true,
    };
  }
  return {
    inForce,
    subscription,
    passEnd: isoOrNull(root.passEnd),
    trialAvailable: requireBoolean(root.trialAvailable, 'trialAvailable'),
    trialDays: requireNumber(root.trialDays, 'trialDays'),
    founderOpen: requireBoolean(root.founderOpen, 'founderOpen'),
    founderSeatsLeft: requireNumber(root.founderSeatsLeft, 'founderSeatsLeft'),
    founderLost: requireBoolean(root.founderLost, 'founderLost'),
    oxxoExpiresDays: requireNumber(root.oxxoExpiresDays, 'oxxoExpiresDays'),
    customerId: asString(root.customerId),
    // Solo true las prende. Sin el campo o con otro valor quedan apagadas, y la tarjeta sigue igual
    flags: {
      cashPasses: asRecord(root.flags).cashPasses === true,
      mercadoPago: asRecord(root.flags).mercadoPago === true,
    },
  };
}

/** Aplica un cobro con apply_charge. Devuelve applied, duplicate, ignored, unknown_user o founder_full */
export async function applyChargeViaRest(
  env: SupabaseEnv,
  notice: ChargeNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  return callRpcText(
    env,
    'apply_charge',
    {
      p_provider: notice.provider,
      p_event_id: notice.eventId,
      p_payload: notice.payload,
      p_kind: notice.kind,
      p_user: notice.userId,
      p_purpose: notice.purpose,
      p_plan: notice.plan,
      p_method: notice.method,
      p_provider_payment_id: notice.providerPaymentId,
      p_payment_intent_id: notice.paymentIntentId,
      p_provider_subscription_id: notice.providerSubscriptionId,
      p_amount_mxn: notice.amountMxn,
      p_discount_mxn: notice.discountMxn,
      p_promotion_code: notice.promotionCode,
      p_period_end: notice.periodEnd,
      p_expires_at: notice.expiresAt,
    },
    fetchImpl,
  );
}

/** Aplica el estado de una suscripción con apply_subscription_state */
export async function applySubscriptionStateViaRest(
  env: SupabaseEnv,
  notice: SubscriptionNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  return callRpcText(
    env,
    'apply_subscription_state',
    {
      p_provider: notice.provider,
      p_event_id: notice.eventId,
      p_event_at: notice.eventAt,
      p_payload: notice.payload,
      p_user: notice.userId,
      p_subscription_id: notice.subscriptionId,
      p_plan: notice.plan,
      p_status: notice.status,
      p_period_end: notice.periodEnd,
      p_trial_end: notice.trialEnd,
      p_cancel_at_period_end: notice.cancelAtPeriodEnd,
      p_scheduled_change: notice.scheduledChange,
      p_price_id: notice.priceId,
      p_promotion_code: notice.promotionCode,
    },
    fetchImpl,
  );
}

/** Encola el correo de fin de la prueba con note_trial_will_end */
export async function noteTrialWillEndViaRest(
  env: SupabaseEnv,
  notice: TrialEndingNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  return callRpcText(
    env,
    'note_trial_will_end',
    {
      p_provider: notice.provider,
      p_event_id: notice.eventId,
      p_payload: notice.payload,
      p_user: notice.userId,
      p_subscription_id: notice.subscriptionId,
      p_trial_end: notice.trialEnd,
    },
    fetchImpl,
  );
}

const ACTION_REASONS = new Set([
  'trial_duplicate',
  'second_subscription',
  'founder_full',
  'refund',
]);

/**
 * Toma hasta limit acciones pendientes con la pasarela (claim_billing_actions). Con provider solo las
 * de esa pasarela. Lanza si la base falla
 */
export async function claimBillingActionsViaRest(
  env: SupabaseEnv,
  options: { limit: number; provider: Provider | null },
  fetchImpl: typeof fetch = fetch,
): Promise<BillingAction[]> {
  const rows = await callRpc(
    env,
    'claim_billing_actions',
    { p_limit: options.limit, p_provider: options.provider },
    fetchImpl,
  );
  if (!Array.isArray(rows)) throw new Error('claim_billing_actions no devolvió una lista');
  const actions: BillingAction[] = [];
  for (const value of asArray(rows)) {
    const row = asRecord(value);
    const id = asString(row.id);
    const target = asString(row.target);
    const reason = asString(row.reason);
    if (
      !id ||
      !target ||
      !isProvider(row.provider) ||
      row.kind !== 'cancel_subscription' ||
      !reason ||
      !ACTION_REASONS.has(reason)
    ) {
      continue;
    }
    actions.push({
      id,
      provider: row.provider,
      kind: 'cancel_subscription',
      target,
      reason: reason as BillingAction['reason'],
      attempts: typeof row.attempts === 'number' ? row.attempts : 0,
    });
  }
  return actions;
}

/** Cierra una acción con la pasarela. ok en false la deja fallida con su motivo, sin llaves */
export async function finishBillingActionViaRest(
  env: SupabaseEnv,
  result: { id: string; ok: boolean; error: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await callRpcVoid(
    env,
    'finish_billing_action',
    { p_id: result.id, p_ok: result.ok, p_error: result.error },
    fetchImpl,
  );
}

// ---------------------------------------------------------------------------------------------
// Banco en la nube (B11). Las funciones de la base de 20261023000004_bank_sync.sql. Devuelven el JSON
// tal cual y bank/sync.ts lo revisa

/**
 * El admin que pidió Sincronizar ahora, con su propia sesión y la llave pública. La base revisa que sea
 * admin (con segundo factor desde B9). null si no lo es o si el token no sirve
 */
export async function bankSyncAuthorizeViaRest(
  env: SupabaseEnv,
  authorization: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!authorization?.toLowerCase().startsWith('bearer ')) return null;
  const reply = await fetchImpl(`${env.url}/rest/v1/rpc/admin_bank_sync_authorize`, {
    method: 'POST',
    headers: { apikey: env.anonKey, authorization, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!reply.ok) return null;
  return asString(asRecord(await reply.json()).actorId);
}

/** Si la ficha de Cron es la que vive en Vault. false ante cualquier falla */
export async function bankSyncCronOkViaRest(
  env: SupabaseEnv,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    return (await callRpc(env, 'bank_sync_cron_ok', { p_token: token }, fetchImpl)) === true;
  } catch {
    return false;
  }
}

/** Empieza una corrida, o la deja en skipped con su motivo */
export function bankSyncBeginViaRest(
  env: SupabaseEnv,
  args: { trigger: string; target: string; actorId: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  return callRpc(
    env,
    'bank_sync_begin',
    { p_trigger: args.trigger, p_target: args.target, p_actor: args.actorId },
    fetchImpl,
  );
}

/** El contenido de versiones de la app, para compararlas con su renglón */
export function bankSyncVersionsContentViaRest(
  env: SupabaseEnv,
  versionIds: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  return callRpc(env, 'bank_sync_versions_content', { p_version_ids: versionIds }, fetchImpl);
}

/** Aplica una tanda de renglones ya planeados */
export function bankSyncApplyViaRest(
  env: SupabaseEnv,
  args: { runId: string; rows: readonly unknown[]; forceDryRun: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  return callRpc(
    env,
    'bank_sync_apply',
    { p_run: args.runId, p_rows: args.rows, p_force_dry_run: args.forceDryRun },
    fetchImpl,
  );
}

/** Termina una corrida con sus conteos */
export function bankSyncFinishViaRest(
  env: SupabaseEnv,
  args: {
    runId: string;
    seenKeys: readonly string[] | null;
    summary: Record<string, unknown>;
    status: string;
    reason: string | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  return callRpc(
    env,
    'bank_sync_finish',
    {
      p_run: args.runId,
      p_seen_keys: args.seenKeys,
      p_summary: args.summary,
      p_status: args.status,
      p_reason: args.reason,
    },
    fetchImpl,
  );
}

// ---------------------------------------------------------------------------------------------
// Correos, analítica y alertas de B15. Las funciones de la base de 20261029000001_email_reminders.sql y
// 20261029000002_product_analytics.sql. Todas con la llave de servicio, menos la comprobación del admin, que
// usa la sesión de quien llama. Los nombres de los parámetros son el contrato con esas migraciones

/** Un correo de la cola como lo devuelve claim_email_batch, con lo que necesita el envío y nada más */
export interface QueuedEmail {
  id: string;
  kind: string;
  /** Los datos del correo: fechas, montos, plan, conteos. Sin correos, porque la cola lo rechaza */
  data: Record<string, unknown>;
  dedupeKey: string;
  attempts: number;
}

/** A quién va un correo, como lo devuelve email_recipients */
export interface EmailRecipient {
  /** Vacío si la cuenta no tiene el correo confirmado */
  emails: string[];
  alias: string | null;
  /** Solo el recordatorio, y solo de quien lo tiene prendido y sin baja */
  unsubscribeToken: string | null;
}

/** Si la ficha de Cron es la de Vault. false ante cualquier falla */
async function tickOkViaRest(
  env: SupabaseEnv,
  rpc: 'email_tick_ok' | 'analytics_tick_ok',
  token: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  try {
    return (await callRpc(env, rpc, { p_token: token }, fetchImpl)) === true;
  } catch {
    return false;
  }
}

export const emailTickOkViaRest = (
  env: SupabaseEnv,
  token: string,
  fetchImpl: typeof fetch = fetch,
) => tickOkViaRest(env, 'email_tick_ok', token, fetchImpl);

export const analyticsTickOkViaRest = (
  env: SupabaseEnv,
  token: string,
  fetchImpl: typeof fetch = fetch,
) => tickOkViaRest(env, 'analytics_tick_ok', token, fetchImpl);

/** Toma hasta limit correos listos con claim_email_batch. Lanza si la base falla. Salta una fila sin forma */
export async function claimEmailBatchViaRest(
  env: SupabaseEnv,
  limit: number,
  fetchImpl: typeof fetch = fetch,
): Promise<QueuedEmail[]> {
  const rows = await callRpc(env, 'claim_email_batch', { p_limit: limit }, fetchImpl);
  if (!Array.isArray(rows)) throw new Error('claim_email_batch no devolvió una lista');
  const emails: QueuedEmail[] = [];
  for (const value of asArray(rows)) {
    const row = asRecord(value);
    const id = asString(row.id);
    const kind = asString(row.kind);
    const dedupeKey = asString(row.dedupe_key);
    if (!id || !kind || !dedupeKey) continue;
    emails.push({
      id,
      kind,
      data: asRecord(row.data),
      dedupeKey,
      attempts: typeof row.attempts === 'number' ? row.attempts : 0,
    });
  }
  return emails;
}

/** A quién va cada correo reclamado, con email_recipients. Lanza si la base falla */
export async function emailRecipientsViaRest(
  env: SupabaseEnv,
  ids: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, EmailRecipient>> {
  const rows = await callRpc(env, 'email_recipients', { p_ids: ids }, fetchImpl);
  if (!Array.isArray(rows)) throw new Error('email_recipients no devolvió una lista');
  const recipients = new Map<string, EmailRecipient>();
  for (const value of asArray(rows)) {
    const row = asRecord(value);
    const id = asString(row.id);
    if (!id) continue;
    recipients.set(id, {
      emails: asArray(row.emails).filter(
        (item): item is string => typeof item === 'string' && item !== '',
      ),
      alias: asString(row.alias),
      unsubscribeToken: asString(row.unsubscribe_token),
    });
  }
  return recipients;
}

/** Cierra un correo con finish_email. error nunca lleva datos del correo ni del alumno */
export async function finishEmailViaRest(
  env: SupabaseEnv,
  result: { id: string; status: 'sent' | 'skipped' | 'failed'; error: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await callRpcVoid(
    env,
    'finish_email',
    { p_id: result.id, p_status: result.status, p_error: result.error },
    fetchImpl,
  );
}

/** Devuelve a la cola, sin gastar el intento, un correo que no se alcanzó a mandar */
export async function releaseEmailViaRest(
  env: SupabaseEnv,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await callRpcVoid(env, 'release_email', { p_id: id }, fetchImpl);
}

/** La baja de un recordatorio con su ficha. done, already o invalid. Lanza si la base falla */
export async function emailUnsubscribeViaRest(
  env: SupabaseEnv,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<'done' | 'already' | 'invalid'> {
  const result = await callRpcText(env, 'email_unsubscribe', { p_token: token }, fetchImpl);
  return result === 'done' || result === 'already' ? result : 'invalid';
}

/** Un evento de dinero de la cola de analítica, como lo devuelve claim_analytics_batch */
export interface QueuedAnalyticsEvent {
  id: string;
  analyticsId: string;
  event: string;
  properties: Record<string, unknown>;
  occurredAt: string;
}

/** Toma hasta limit eventos con claim_analytics_batch. Lanza si la base falla. Salta una fila sin forma */
export async function claimAnalyticsBatchViaRest(
  env: SupabaseEnv,
  limit: number,
  fetchImpl: typeof fetch = fetch,
): Promise<QueuedAnalyticsEvent[]> {
  const rows = await callRpc(env, 'claim_analytics_batch', { p_limit: limit }, fetchImpl);
  if (!Array.isArray(rows)) throw new Error('claim_analytics_batch no devolvió una lista');
  const events: QueuedAnalyticsEvent[] = [];
  for (const value of asArray(rows)) {
    const row = asRecord(value);
    const id = asString(row.id);
    const analyticsId = asString(row.analyticsId);
    const event = asString(row.event);
    const occurredAt = asString(row.occurredAt);
    if (!id || !analyticsId || !event || !occurredAt) continue;
    events.push({ id, analyticsId, event, properties: asRecord(row.properties), occurredAt });
  }
  return events;
}

/** Cierra eventos de analítica con finish_analytics_batch */
export async function finishAnalyticsBatchViaRest(
  env: SupabaseEnv,
  ids: readonly string[],
  status: 'sent' | 'dropped' | 'failed' | 'queued',
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await callRpcVoid(env, 'finish_analytics_batch', { p_ids: ids, p_status: status }, fetchImpl);
}

/**
 * Si quien llama es un admin con su segundo factor, con su propia sesión y la llave pública. Pregunta a
 * admin_email_overview, que solo contesta a un admin. false ante cualquier falla o rechazo
 */
export async function adminSessionOkViaRest(
  env: SupabaseEnv,
  authorization: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!authorization?.toLowerCase().startsWith('bearer ')) return false;
  try {
    const reply = await fetchImpl(`${env.url}/rest/v1/rpc/admin_email_overview`, {
      method: 'POST',
      headers: { apikey: env.anonKey, authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ p_days: 1 }),
    });
    return reply.ok;
  } catch {
    return false;
  }
}
