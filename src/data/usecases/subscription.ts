// Suscripción simulada (pantalla 16). Cambiar de plan guarda la suscripción y un evento con su
// recibo simulado. Nunca hay cobro real ni datos de tarjeta (3.2).
import { PLANS, type PlanKey } from '@/config/billing';
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import { newId } from '../ids';
import { SubscriptionSchema, type User } from '../schemas/people';

export async function changePlan(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  plan: PlanKey,
) {
  const status = plan === 'free' ? 'canceled' : 'active';
  await api.repos.subscriptions.put(
    SubscriptionSchema.parse({
      userId: user.id,
      plan,
      status,
      isSimulated: true,
      updatedAt: new Date().toISOString(),
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
