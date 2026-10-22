// Cuándo Suscripción ofrece los botones de Apple Pay y Google Pay (B17, 6.5 y 6.6). Dos cosas a la vez. La bandera
// expressWallets, que está apagada en los tres entornos y se prende con el SQL de docs/STRIPE.md, y una llave
// publicable de Stripe con forma buena en VITE_STRIPE_PUBLISHABLE_KEY. Sin cualquiera de las dos la sección no
// aparece, no se descarga Stripe.js y la política de seguridad ni siquiera lo permite. Esta es una de las dos
// únicas lecturas de la llave, junto con vite.config.ts (architecture.test.ts).
import { stripePublishableKeyOf } from '@/config/csp';
import { isFeatureEnabled } from '@/config/featureFlags';

export interface WalletSetup {
  /** La llave publicable (pk_test_ o pk_live_). Es pública por diseño */
  publishableKey: string;
}

export function readWalletSetup(
  flagOn: boolean = isFeatureEnabled('expressWallets'),
  rawKey: string | undefined = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
): WalletSetup | null {
  if (!flagOn) return null;
  const publishableKey = stripePublishableKeyOf(rawKey);
  return publishableKey ? { publishableKey } : null;
}
