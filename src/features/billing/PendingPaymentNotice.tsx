// Un pago que espera, como una ficha OXXO, una transferencia SPEI o un pago de Mercado Pago, o la ficha
// que venció sin pago (B10 del plan del cambio, 3.1.3). Sale de pendingPayment y de issue de my_plan v2.
// Mientras espera, el plan no cambia, así que el alumno sabe que su pago está en camino.
import type { Subscription } from '@/data/schemas/people';
import { pendingPaymentText } from './planLines';

export function PendingPaymentNotice({
  subscription,
}: {
  subscription: Subscription | null | undefined;
}) {
  const message = pendingPaymentText(subscription);
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
      {message}
    </p>
  );
}
