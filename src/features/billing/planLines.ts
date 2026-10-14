// Los textos del estado del plan y del pago pendiente en Suscripción (B10, 3.1.3). Qué estado tiene el
// plan lo decide planStateOf. Aquí solo se elige su línea.
import { PLANS } from '@/config/billing';
import type { Subscription } from '@/data/schemas/people';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import { longDate, type PlanState } from './planState';

const status = billingCloudText.status;
const pendingText = billingCloudText.pending;

/** La línea principal del estado del plan */
export function planStateLine(state: PlanState): string {
  switch (state.kind) {
    case 'trialing':
      return status.trialing(longDate(state.end), t.billing.price(PLANS[state.plan].priceMxn));
    case 'trialCanceled':
      return status.trialCanceled(longDate(state.end));
    case 'renews':
      return status.renews(longDate(state.date), t.billing.price(PLANS[state.plan].priceMxn));
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

/** El texto del pago pendiente o de la ficha vencida. null si no hay ninguno */
export function pendingPaymentText(subscription: Subscription | null | undefined): string | null {
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
  return subscription?.issue === 'voucher_expired' ? pendingText.voucherExpired : null;
}
