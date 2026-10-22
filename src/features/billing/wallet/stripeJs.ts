// Stripe.js para los botones de Apple Pay y Google Pay (B17, 6.5). Es lo único que descarga el script de Stripe y
// solo lo llama WalletPay, así que el script no entra al JavaScript inicial ni se pide en ninguna otra pantalla.
// @stripe/stripe-js/pure no pone el script hasta llamar loadStripe, a diferencia de la entrada normal, que lo
// inyecta al importarse. Stripe recomienda cargarlo en todo el sitio para detectar fraude, y B17 lo acepta a
// cambio del presupuesto de JavaScript y de la privacidad (11.5).
import type { Stripe } from '@stripe/stripe-js';

/** Lo único de Stripe.js que usa la app. Las pruebas ponen un doble con solo esto */
export type WalletStripe = Pick<Stripe, 'initCheckoutElementsSdk'>;
export type LoadWalletStripe = (publishableKey: string) => Promise<WalletStripe | null>;

/** Descarga Stripe.js (la versión endive que fija @stripe/stripe-js 10.1.0) en español de América Latina */
export const loadWalletStripe: LoadWalletStripe = async (publishableKey) => {
  const { loadStripe } = await import('@stripe/stripe-js/pure');
  return loadStripe(publishableKey, { locale: 'es-419' });
};
