// Lo de los botones de Apple Pay y Google Pay que no es de React (B17, 6.5). Cómo se ven, qué texto toca a lo que
// dijo Stripe al confirmar y cómo se cierra la hoja de la billetera con error. Aparte de WalletPay.tsx para que
// ese archivo solo exporte el componente.
import type {
  StripeCheckoutExpressCheckoutElementOptions,
  StripeExpressCheckoutElementConfirmEvent,
} from '@stripe/stripe-js';
import type { WalletProblem } from '@/i18n/wallet';

/**
 * Cómo se ven los botones. Solo Apple Pay y Google Pay, a una columna y sin menú de más opciones, con el
 * texto de suscripción. En tema oscuro, los colores que Apple y Google piden para fondos oscuros
 */
export function walletElementOptions(dark: boolean): StripeCheckoutExpressCheckoutElementOptions {
  return {
    buttonHeight: 44,
    buttonTheme: dark
      ? { applePay: 'white-outline', googlePay: 'white' }
      : { applePay: 'black', googlePay: 'black' },
    buttonType: { applePay: 'subscribe', googlePay: 'subscribe' },
    layout: { maxColumns: 1, overflow: 'never' },
    paymentMethodOrder: undefined,
    paymentMethods: {
      applePay: 'auto',
      googlePay: 'auto',
      link: 'never',
      paypal: 'never',
      klarna: 'never',
      amazonPay: 'never',
    },
  };
}

/** Lo que dijo Stripe al confirmar, en uno de los tres textos de la app. El mensaje en crudo no se muestra */
export function problemOf(error: { code: string | null }): WalletProblem {
  return error.code === 'paymentFailed' ? 'declined' : 'failed';
}

/** Cierra la hoja de la billetera con error. Si el aparato ya la cerró no pasa nada */
export function failSheet(event: StripeExpressCheckoutElementConfirmEvent): void {
  try {
    event.paymentFailed({ reason: 'fail' });
  } catch {
    // La hoja ya estaba cerrada
  }
}
