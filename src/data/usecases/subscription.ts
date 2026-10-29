// Suscripción simulada (pantalla 16). Cambiar de plan guarda la suscripción y un evento con su
// recibo simulado. Nunca hay cobro real ni datos de tarjeta (3.2). Cancelar deja el plan hasta el fin
// de su periodo simulado, como con la nube, y planOf lo vuelve Gratis al llegar esa fecha (V5-B0).
import { PLANS, planOf, type PaidPlanKey, type PlanKey } from '@/config/billing';
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import { newId } from '../ids';
import { SubscriptionSchema, type User } from '../schemas/people';

/** Un mes o un año desde from, lo que dura un periodo del pago simulado. ISO UTC */
export function simulatedPeriodEnd(plan: PaidPlanKey, from: Date): string {
  const end = new Date(from);
  if (plan === 'annual' || plan === 'founder_annual') {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end.toISOString();
}

export async function changePlan(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  plan: PlanKey,
  now: Date = new Date(),
) {
  const status = plan === 'free' ? 'canceled' : 'active';
  await api.repos.subscriptions.put(
    SubscriptionSchema.parse({
      userId: user.id,
      plan,
      status,
      isSimulated: true,
      // Un periodo desde hoy, para que cancelar deje el plan hasta su fin como con la nube
      ...(plan === 'free' ? {} : { periodEnd: simulatedPeriodEnd(plan, now) }),
      updatedAt: now.toISOString(),
    }),
  );
  return api.recordEvent(
    createEvent(
      'subscription_changed',
      {
        plan,
        status,
        amountMxn: PLANS[plan].priceMxn,
        receiptId: plan === 'free' ? null : newId(),
        simulated: true,
      },
      { userId: user.id, tz: user.timeZone },
    ),
  );
}

/**
 * Cancela el pago simulado. El plan sigue vigente hasta el fin de su periodo, con cancelAtPeriodEnd
 * como lo refleja la nube, y planOf lo vuelve Gratis al llegar esa fecha. Devuelve hasta cuándo vale,
 * o null si no había un plan de pago simulado vigente
 */
export async function cancelSimulatedPlan(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  now: Date = new Date(),
): Promise<string | null> {
  const current = await api.repos.subscriptions.get(user.id);
  if (!current?.isSimulated || current.plan === 'free') return null;
  if (planOf(current, now.getTime()) === 'free') return null;
  // Un plan simulado de antes de V5-B0 no tiene fecha. Se le da un periodo desde hoy
  const periodEnd = current.periodEnd ?? simulatedPeriodEnd(current.plan, now);
  await api.repos.subscriptions.put(
    SubscriptionSchema.parse({
      ...current,
      periodEnd,
      cancelAtPeriodEnd: true,
      updatedAt: now.toISOString(),
    }),
  );
  await api.recordEvent(
    createEvent(
      'subscription_changed',
      { plan: current.plan, status: 'canceled', amountMxn: 0, receiptId: null, simulated: true },
      { userId: user.id, tz: user.timeZone },
    ),
  );
  return periodEnd;
}
