// El texto del botón de los candados del plan Gratis, que lleva a Suscripción (respuesta 20 del plan
// del cambio). Dice Prueba 7 días gratis solo con la bandera freeTrial, que B10 prende cuando la prueba
// existe en Suscripción, y mientras tanto Ver planes, para no prometer lo que todavía no hay. Lo usan
// LockedPreview y LockedNote, que son los candados de Apuntes, Party, Subir mazos, el catálogo de
// mazos y el aviso corto de FeatureGate (B8), así todos los candados dicen lo mismo.
import { isFeatureEnabled } from '@/config/featureFlags';
import { t } from '@/i18n/es-MX';

/** El texto del botón. Las pruebas pasan si la prueba gratis está prendida */
export function lockedCtaLabel(freeTrial: boolean = isFeatureEnabled('freeTrial')): string {
  return freeTrial ? t.billing.freeTrialCta : t.billing.featureSeePlans;
}
