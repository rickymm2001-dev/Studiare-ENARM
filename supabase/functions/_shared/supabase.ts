// Llamadas de las funciones a Supabase con fetch, sin librerías (Fase P bloque 5, D-096). La llave
// de servicio solo existe en el entorno de la función y jamás sale de ella ni llega al navegador.
import type { PaymentNotice } from './payments.ts';

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

/** Llama a apply_payment_notice con la llave de servicio. Devuelve applied, duplicate y los demás */
export async function applyNoticeViaRest(
  env: SupabaseEnv,
  notice: PaymentNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const reply = await fetchImpl(`${env.url}/rest/v1/rpc/apply_payment_notice`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      authorization: `Bearer ${env.serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_provider: notice.provider,
      p_event_id: notice.eventId,
      p_payload: notice.payload,
      p_kind: notice.kind,
      p_user: notice.userId,
      p_plan: notice.plan,
      p_provider_payment_id: notice.providerPaymentId,
      p_provider_subscription_id: notice.providerSubscriptionId,
      p_amount_mxn: notice.amountMxn,
      p_period_end: notice.periodEnd,
    }),
  });
  if (!reply.ok) throw new Error(`apply_payment_notice respondió ${reply.status}`);
  const result: unknown = await reply.json();
  if (typeof result !== 'string') throw new Error('apply_payment_notice no devolvió un texto');
  return result;
}

/** Quién es el dueño del token que mandó el navegador. null si Supabase no lo reconoce */
export async function authenticateUser(
  env: SupabaseEnv,
  authorization: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; email: string | null } | null> {
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

/** Lugares de Fundador que quedan. null si no se pudo saber, y entonces decide el servidor al cobrar */
export async function founderSeatsLeftViaRest(
  env: SupabaseEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const headers = { apikey: env.serviceKey, authorization: `Bearer ${env.serviceKey}` };
  try {
    const settings = await fetchImpl(
      `${env.url}/rest/v1/platform_settings?key=eq.founder_seats&select=value`,
      { headers },
    );
    const taken = await fetchImpl(
      `${env.url}/rest/v1/subscriptions?plan=eq.founder&select=user_id`,
      {
        headers: { ...headers, prefer: 'count=exact', range: '0-0' },
      },
    );
    if (!settings.ok || !taken.ok) return null;
    const rows: unknown = await settings.json();
    const total = Array.isArray(rows)
      ? Number((rows[0] as { value?: { total?: unknown } } | undefined)?.value?.total)
      : Number.NaN;
    const range = taken.headers.get('content-range') ?? '';
    const count = Number(range.split('/')[1]);
    return Number.isFinite(total) && Number.isFinite(count) ? total - count : null;
  } catch {
    return null;
  }
}
