// Un pago que espera, como una ficha OXXO, una transferencia SPEI o un pago de Mercado Pago, o el pase
// que venció sin pago (B10 del plan del cambio, 3.1.3). Sale de pendingPayment y de issue de my_plan v2.
// Mientras espera, el plan no cambia, así que el alumno sabe que su pago está en camino. El aviso del
// que venció dice su método, que se busca en los pagos del alumno, y se muestra cuando ya se sabe.
import type { Subscription } from '@/data/schemas/people';
import { pendingPaymentText } from './planLines';
import { useExpiredPassMethod } from './useExpiredPassMethod';

export function PendingPaymentNotice({
  subscription,
}: {
  subscription: Subscription | null | undefined;
}) {
  const expired = !subscription?.pendingPayment && subscription?.issue === 'voucher_expired';
  const expiredMethod = useExpiredPassMethod(expired);
  if (expired && expiredMethod === undefined) return null;
  const message = pendingPaymentText(subscription, expiredMethod ?? null);
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
      {message}
    </p>
  );
}
