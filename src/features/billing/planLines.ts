// Los textos del estado del plan y del pago pendiente en Suscripción (B10, 3.1.3). Qué estado tiene el
// plan lo decide planStateOf. Aquí solo se elige su línea. También lo que se pierde al cancelar, para
// el diálogo de confirmación (V5-B0).
import { canUse, PLAN_HIGHLIGHTS, PLANS, type PlanKey } from '@/config/billing';
import type { PassMethod } from '@/data/payments/invoices';
import type { Subscription } from '@/data/schemas/people';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import { longDate, type PlanState } from './planState';

const status = billingCloudText.status;
const pendingText = billingCloudText.pending;
const cancelText = billingCloudText.cancelDialog;

/** Lo que el plan abre y Gratis no, con las palabras de la tabla de planes. Vacío en Gratis */
export function lostOnCancel(plan: PlanKey): string[] {
  const lines: string[] = [];
  const daily = PLANS[plan].access.dailyQuestions;
  const freeDaily = PLANS.free.access.dailyQuestions;
  if (daily !== freeDaily) {
    lines.push(
      cancelText.dailyQuestions(
        t.billing.access.dailyQuestions(daily),
        t.billing.access.dailyQuestions(freeDaily),
      ),
    );
  }
  for (const highlight of PLAN_HIGHLIGHTS) {
    if (canUse(plan, highlight) && !canUse('free', highlight)) {
      lines.push(t.billing.access[highlight]);
    }
  }
  return lines;
}

/** La línea principal del estado del plan */
export function planStateLine(state: PlanState): string {
  switch (state.kind) {
    case 'trialing':
      return status.trialing(longDate(state.end), t.billing.price(PLANS[state.plan].priceMxn));
    case 'trialCanceled':
      return status.trialCanceled(longDate(state.end));
    case 'renews': {
      const price = t.billing.price(PLANS[state.plan].priceMxn);
      return state.scheduled
        ? status.renewsAs(longDate(state.date), t.billing.plans[state.plan], price)
        : status.renews(longDate(state.date), price);
    }
    case 'canceled':
      return status.canceled(longDate(state.until));
    case 'pastDue':
      return state.provider === 'mercadopago' ? status.pastDueMercadoPago : status.pastDue;
    case 'pass':
      return status.pass(longDate(state.until));
    case 'referral':
      return status.referral(longDate(state.until));
    case 'paidUntil':
      return billingCloudText.validUntil(longDate(state.until));
  }
}

/**
 * El texto del pago pendiente o del pase que venció sin pago. null si no hay ninguno. expiredMethod es
 * el método del que venció, que my_plan no trae (useExpiredPassMethod). Sin él se dice sin método
 */
export function pendingPaymentText(
  subscription: Subscription | null | undefined,
  expiredMethod: PassMethod | null = null,
): string | null {
  const pending = subscription?.pendingPayment;
  if (pending) {
    const price = t.billing.price(pending.amountMxn);
    switch (pending.method) {
      case 'oxxo':
        return pending.expiresAt
          ? pendingText.oxxoUntil(price, longDate(pending.expiresAt))
          : pendingText.oxxo(price);
      case 'spei':
        return pendingText.spei(price);
      case 'mercadopago':
        return pendingText.mercadopago;
    }
  }
  return subscription?.issue === 'voucher_expired'
    ? pendingText.voucherExpired[expiredMethod ?? 'unknown']
    : null;
}
