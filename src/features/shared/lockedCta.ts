// El botón de los candados del plan Gratis, que lleva a Suscripción (respuesta 20 del plan del cambio).
// Dice Prueba 7 días gratis solo si al alumno todavía le toca la prueba, según trialAvailable de my_plan
// con la cuenta conectada, y además están la bandera freeTrial y la nube configurada, porque la prueba
// solo existe con la cuenta en la nube y la cobra Stripe (B10). Entonces lleva a Suscripción ya con la
// forma de pago del plan Mensual, que es el de la promoción Fundador y el de la prueba. Si no, dice Ver
// planes y abre los planes. Así el candado nunca promete una prueba que Suscripción no ofrece. Lo usan
// LockedPreview y LockedNote (con useLockedCta), que son los candados de Apuntes, Party, Subir mazos,
// el catálogo de mazos y el aviso corto de FeatureGate (B8), así todos los candados dicen lo mismo.
import { screenPath } from '@/app/screens';
import { isFeatureEnabled } from '@/config/featureFlags';
import { cloudConfigured } from '@/data/cloud/client';
import { t } from '@/i18n/es-MX';

/** El valor de ?plan= que abre en Suscripción la forma de pago del plan Mensual */
export const TRIAL_PLAN_PARAM = 'mensual';

/**
 * Si se anuncia la prueba a quien todavía no tiene cuenta, como en la portada. Las pruebas pasan la
 * bandera y la nube
 */
export function trialAdvertised(
  freeTrial: boolean = isFeatureEnabled('freeTrial'),
  cloud: boolean = cloudConfigured(),
): boolean {
  return freeTrial && cloud;
}

/** Si el candado ofrece la prueba. trialAvailable es si al alumno todavía le toca */
export function lockedCtaOffersTrial(
  trialAvailable: boolean,
  freeTrial: boolean = isFeatureEnabled('freeTrial'),
  cloud: boolean = cloudConfigured(),
): boolean {
  return trialAvailable && trialAdvertised(freeTrial, cloud);
}

/** El texto del botón */
export function lockedCtaLabel(
  trialAvailable: boolean,
  freeTrial: boolean = isFeatureEnabled('freeTrial'),
  cloud: boolean = cloudConfigured(),
): string {
  return lockedCtaOffersTrial(trialAvailable, freeTrial, cloud)
    ? t.billing.freeTrialCta
    : t.billing.featureSeePlans;
}

/** A dónde lleva el botón. Con la prueba, a la forma de pago del Mensual */
export function lockedCtaPath(
  trialAvailable: boolean,
  freeTrial: boolean = isFeatureEnabled('freeTrial'),
  cloud: boolean = cloudConfigured(),
): string {
  const path = screenPath('subscription');
  return lockedCtaOffersTrial(trialAvailable, freeTrial, cloud)
    ? `${path}?plan=${TRIAL_PLAN_PARAM}`
    : path;
}
