// En qué estado está el plan del alumno según lo que reflejó la nube con my_plan v2 (B10 del plan del
// cambio, 3.1.3). Es una función pura que clasifica la suscripción, y Suscripción, Perfil e Inicio
// eligen cada uno su texto. Así la regla de qué línea toca vive en un solo lugar.
import { planOf, scheduledPlanOf, type PaidPlanKey } from '@/config/billing';
import type { Subscription } from '@/data/schemas/people';

/** Fecha larga en español de México, como 21 de octubre de 2026 */
export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

export type PlanState =
  /** Prueba gratis vigente. Al terminar se cobra el plan */
  | { kind: 'trialing'; end: string; plan: PaidPlanKey }
  /** Canceló dentro de la prueba. Termina sin cobro */
  | { kind: 'trialCanceled'; end: string }
  /**
   * Suscripción activa que se renueva sola. plan es el que se cobra al renovar, que con un cambio
   * programado (scheduled) es el nuevo y no el de ahora
   */
  | { kind: 'renews'; date: string; plan: PaidPlanKey; scheduled: boolean }
  /** Cancelada, vale hasta el fin del periodo pagado */
  | { kind: 'canceled'; until: string }
  /** No se pudo cobrar la renovación */
  | { kind: 'pastDue'; provider: 'stripe' | 'mercadopago' }
  /** Pase de un solo pago, no se renueva */
  | { kind: 'pass'; until: string }
  /** Mes regalado por referido */
  | { kind: 'referral'; until: string }
  /** Un plan de la nube sin más detalle, como el de un servidor de antes de B10 */
  | { kind: 'paidUntil'; until: string };

/** El estado del plan vigente que dio la nube. null en Gratis, en el pago simulado o sin datos */
export function planStateOf(subscription: Subscription | null | undefined): PlanState | null {
  if (!subscription || subscription.isSimulated) return null;
  const plan = planOf(subscription);
  if (plan === 'free') return null;
  const periodEnd = subscription.periodEnd ?? null;
  if (subscription.source === 'pass') {
    const until = subscription.passEnd ?? periodEnd;
    return until ? { kind: 'pass', until } : null;
  }
  if (subscription.source === 'referral') {
    return periodEnd ? { kind: 'referral', until: periodEnd } : null;
  }
  const provider = subscription.provider ?? 'stripe';
  switch (subscription.cloudStatus) {
    case 'trialing': {
      const end = subscription.trialEnd ?? periodEnd;
      if (!end) return null;
      return subscription.cancelAtPeriodEnd
        ? { kind: 'trialCanceled', end }
        : { kind: 'trialing', end, plan };
    }
    case 'past_due':
      return { kind: 'pastDue', provider };
    case 'canceled':
      return periodEnd ? { kind: 'canceled', until: periodEnd } : null;
    case 'active':
      if (!periodEnd) return null;
      if (subscription.cancelAtPeriodEnd) return { kind: 'canceled', until: periodEnd };
      return subscription.scheduledChange
        ? { kind: 'renews', date: periodEnd, plan: scheduledPlanOf(plan), scheduled: true }
        : { kind: 'renews', date: periodEnd, plan, scheduled: false };
    default:
      return periodEnd ? { kind: 'paidUntil', until: periodEnd } : null;
  }
}

/** Si la suscripción de pago vigente es de Stripe o de Mercado Pago. null con pase, mes o Gratis */
export function liveProviderOf(
  subscription: Subscription | null | undefined,
): 'stripe' | 'mercadopago' | null {
  if (!subscription || subscription.isSimulated || planOf(subscription) === 'free') return null;
  if (subscription.source !== 'payment') return null;
  return subscription.provider ?? 'stripe';
}
