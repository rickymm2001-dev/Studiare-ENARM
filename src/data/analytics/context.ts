// Lo que cambia con la sesión y viaja en cada evento (B15, 1.4). Funciones puras, sin leer nada del
// navegador, para que el plan y el rol se prueben aparte de AnalyticsGate
import type { AnalyticsContext } from './client';

/** Lo mínimo de la suscripción local, que refleja lo que dijo el servidor con my_plan */
interface SubscriptionLike {
  plan: string;
  status: string;
  cloudStatus?: string | undefined;
}

/**
 * free sin plan vigente, trial mientras dura la prueba gratis y paid con cualquier otro plan vigente. Un
 * pase, un mes de regalo por referido y una suscripción cancelada que vale hasta el fin del periodo cuentan
 * como paid, porque en los tres el alumno tiene acceso de pago
 */
export function planKindOf(
  subscription: SubscriptionLike | null | undefined,
): AnalyticsContext['plan_kind'] {
  if (subscription?.status !== 'active' || subscription.plan === 'free') return 'free';
  return subscription.cloudStatus === 'trialing' ? 'trial' : 'paid';
}
