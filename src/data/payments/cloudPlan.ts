// El plan del alumno según el servidor (Fase P bloque 5, D-096). En la nube el plan lo decide la base
// de datos con el aviso de pago verificado o con un mes regalado por referido, y el navegador solo lo
// refleja. Sin nube, el pago simulado local sigue como siempre.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { PLANS } from '@/config/billing';
import type { DataApi } from '../context';
import { SubscriptionSchema, type Subscription } from '../schemas/people';

export const CloudPlanSchema = z.object({
  plan: z.enum(['free', 'founder', 'monthly', 'annual']),
  source: z.enum(['none', 'payment', 'referral']),
  status: z.string(),
  provider: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
});
export type CloudPlan = z.infer<typeof CloudPlanSchema>;

/** Pregunta su plan a la nube. null si no responde o si la migración todavía no está aplicada */
export async function fetchCloudPlan(cloud: SupabaseClient): Promise<CloudPlan | null> {
  try {
    const reply = await cloud.rpc('my_plan');
    if (reply.error) return null;
    const parsed = CloudPlanSchema.safeParse(reply.data as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** La suscripción local que corresponde al plan de la nube */
export function subscriptionFromCloud(
  userId: string,
  cloudPlan: CloudPlan,
  now: Date = new Date(),
): Subscription {
  const periodEnd = cloudPlan.periodEnd ? new Date(cloudPlan.periodEnd) : null;
  return SubscriptionSchema.parse({
    userId,
    plan: cloudPlan.plan,
    status: cloudPlan.plan === 'free' ? 'none' : 'active',
    isSimulated: false,
    periodEnd: periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd.toISOString() : null,
    updatedAt: now.toISOString(),
  });
}

/** Refleja el plan de la nube en este navegador. Devuelve true si algo cambió */
export async function mirrorCloudPlan(
  api: Pick<DataApi, 'repos'>,
  userId: string,
  cloudPlan: CloudPlan,
  now: Date = new Date(),
): Promise<boolean> {
  if (!(cloudPlan.plan in PLANS)) return false;
  const next = subscriptionFromCloud(userId, cloudPlan, now);
  const current = await api.repos.subscriptions.get(userId);
  if (
    current &&
    !current.isSimulated &&
    current.plan === next.plan &&
    current.status === next.status &&
    (current.periodEnd ?? null) === (next.periodEnd ?? null)
  ) {
    return false;
  }
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
