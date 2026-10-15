// El plan del alumno según el servidor (Fase P bloque 5, D-096, y my_plan v2 de B10). En la nube el plan
// lo decide la base de datos con el aviso de pago verificado, un pase pagado o un mes regalado por
// referido, y el navegador solo lo refleja. Sin nube, el pago simulado local sigue como siempre.
//
// La lectura tolera valores que esta app no conoce (8.18). Un plan desconocido cuenta como Gratis, y un
// estado, un origen o un aviso desconocidos se ignoran, así un servidor más nuevo no deja a la app sin
// leer el plan.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { PLANS, type PlanKey } from '@/config/billing';
import type { DataApi } from '../context';
import { SubscriptionSchema, type PendingPayment, type Subscription } from '../schemas/people';

const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

/** Un valor de una lista conocida, o undefined si el servidor manda otro */
function knownValue<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}
/** Un campo que puede faltar, como en un servidor de antes de B10 que solo manda los cinco de v1 */
const field = () => z.unknown().optional();
const known = <T extends string>(values: readonly T[]) =>
  field().transform((value) => knownValue(values, value));

/** Una fecha del servidor en ISO UTC con milisegundos. undefined si no llegó o no se lee */
function instantOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}
const instant = field().transform(instantOf);

/** El cobro pendiente, o undefined si no hay o no se entiende */
function pendingOf(value: unknown): PendingPayment | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const createdAt = instantOf(raw.createdAt);
  const method = knownValue(['oxxo', 'spei', 'mercadopago'] as const, raw.method);
  const amount = typeof raw.amountMxn === 'number' ? raw.amountMxn : Number(raw.amountMxn);
  if (!method || !createdAt || !Number.isFinite(amount) || amount < 0) return undefined;
  return {
    method,
    plan: knownValue(['monthly', 'annual'] as const, raw.plan) ?? null,
    amountMxn: amount,
    expiresAt: instantOf(raw.expiresAt) ?? null,
    createdAt,
  };
}

export const CloudPlanSchema = z.object({
  plan: field().transform((value): PlanKey => knownValue(PLAN_KEYS, value) ?? 'free'),
  source: known(['none', 'payment', 'pass', 'referral'] as const),
  status: field().transform((value) => (typeof value === 'string' ? value : 'none')),
  provider: known(['stripe', 'mercadopago'] as const),
  periodEnd: instant,
  trialEnd: instant,
  cancelAtPeriodEnd: field().transform((value) => value === true),
  scheduledChange: field().transform((value) => value === true),
  passEnd: instant,
  trialAvailable: field().transform((value) => (typeof value === 'boolean' ? value : undefined)),
  guaranteeUntil: instant,
  pendingPayment: field().transform(pendingOf),
  issue: known([
    'founder_full',
    'trial_duplicate',
    'second_subscription',
    'voucher_expired',
  ] as const),
});
export type CloudPlan = z.infer<typeof CloudPlanSchema>;

/** Pregunta su plan a la nube. null si no responde o si la migración todavía no está aplicada */
export async function fetchCloudPlan(cloud: SupabaseClient): Promise<CloudPlan | null> {
  try {
    const reply = await cloud.rpc('my_plan');
    if (reply.error) return null;
    const data: unknown = reply.data;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
    const parsed = CloudPlanSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const CLOUD_STATUSES = ['trialing', 'active', 'past_due', 'canceled'] as const;

/**
 * La suscripción local que corresponde al plan de la nube. status sigue en active para todo plan
 * vigente, porque así lo leen planOf y los candados (B8). Lo demás de my_plan v2 va en sus campos
 * opcionales, solo cuando el servidor lo manda
 */
export function subscriptionFromCloud(
  userId: string,
  cloudPlan: CloudPlan,
  now: Date = new Date(),
): Subscription {
  const paid = cloudPlan.plan !== 'free';
  const cloudStatus = knownValue(CLOUD_STATUSES, cloudPlan.status);
  const source = paid && cloudPlan.source !== 'none' ? cloudPlan.source : undefined;
  return SubscriptionSchema.parse({
    userId,
    plan: cloudPlan.plan,
    status: paid ? 'active' : 'none',
    isSimulated: false,
    periodEnd: paid ? (cloudPlan.periodEnd ?? null) : null,
    // Con un pago vigente la pantalla Suscripción no ofrece otro (D-118)
    ...(source ? { source } : {}),
    ...(cloudStatus ? { cloudStatus } : {}),
    ...(cloudPlan.provider ? { provider: cloudPlan.provider } : {}),
    ...(cloudPlan.trialEnd ? { trialEnd: cloudPlan.trialEnd } : {}),
    ...(cloudPlan.cancelAtPeriodEnd ? { cancelAtPeriodEnd: true } : {}),
    ...(cloudPlan.scheduledChange ? { scheduledChange: true } : {}),
    ...(cloudPlan.passEnd ? { passEnd: cloudPlan.passEnd } : {}),
    ...(cloudPlan.trialAvailable === undefined ? {} : { trialAvailable: cloudPlan.trialAvailable }),
    ...(cloudPlan.guaranteeUntil ? { guaranteeUntil: cloudPlan.guaranteeUntil } : {}),
    ...(cloudPlan.pendingPayment ? { pendingPayment: cloudPlan.pendingPayment } : {}),
    ...(cloudPlan.issue ? { issue: cloudPlan.issue } : {}),
    updatedAt: now.toISOString(),
  });
}

/** Lo que la nube dice de la suscripción, sin la hora en que se guardó */
function cloudShape(subscription: Subscription): string {
  const { updatedAt: _updatedAt, ...rest } = subscription;
  const fields = rest as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(fields)
      .filter((key) => fields[key] !== undefined)
      .sort()
      .map((key) => [key, fields[key]]),
  );
}

/** Refleja el plan de la nube en este navegador. Devuelve true si algo cambió */
export async function mirrorCloudPlan(
  api: Pick<DataApi, 'repos'>,
  userId: string,
  cloudPlan: CloudPlan,
  now: Date = new Date(),
): Promise<boolean> {
  const next = subscriptionFromCloud(userId, cloudPlan, now);
  const current = await api.repos.subscriptions.get(userId);
  if (current && !current.isSimulated && cloudShape(current) === cloudShape(next)) return false;
  await api.repos.subscriptions.put(next);
  return true;
}

/** Pregunta el plan a la nube y lo refleja. No falla nunca */
export async function refreshCloudPlan(
  api: Pick<DataApi, 'repos'>,
  cloud: SupabaseClient,
  userId: string,
): Promise<CloudPlan | null> {
  const cloudPlan = await fetchCloudPlan(cloud);
  if (!cloudPlan) return null;
  try {
    await mirrorCloudPlan(api, userId, cloudPlan);
  } catch {
    // Un fallo local no debe tumbar la sincronización
  }
  return cloudPlan;
}
