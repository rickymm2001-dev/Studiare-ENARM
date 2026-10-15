// Las formas de pago que ofrece Suscripción según las banderas de B10 (3.5). La tarjeta siempre, salvo
// al sumar otro pase. OXXO y SPEI con cashPasses y Mercado Pago con mercadoPago. El aviso de modo prueba
// con paymentsTestMode. Lo comparten la forma de pago y las tarjetas de planes.
import { isFeatureEnabled } from '@/config/featureFlags';
import type { PaymentOption } from '@/data/payments/checkout';

export interface PaymentFlags {
  cashPasses: boolean;
  mercadoPago: boolean;
  testMode: boolean;
}

export const readPaymentFlags = (): PaymentFlags => ({
  cashPasses: isFeatureEnabled('cashPasses'),
  mercadoPago: isFeatureEnabled('mercadoPago'),
  testMode: isFeatureEnabled('paymentsTestMode'),
});

/** Las formas de pago que se ofrecen. Con un pase vigente solo las de pase, que se suman (8.10) */
export function paymentOptionsFor(flags: PaymentFlags, passOnly: boolean): PaymentOption[] {
  const options: PaymentOption[] = [];
  if (!passOnly) options.push('card');
  if (flags.cashPasses) options.push('oxxo', 'spei');
  if (flags.mercadoPago) {
    if (!passOnly) options.push('mercadopago');
    options.push('mercadopago_pass');
  }
  return options;
}
