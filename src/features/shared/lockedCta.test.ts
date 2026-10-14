// @vitest-environment jsdom
// El botón de los candados de Gratis (respuesta 20). Promete la prueba de 7 días solo con la bandera
// freeTrial y la nube configurada, porque la prueba existe solo con la cuenta en la nube (B10), y
// entonces abre la forma de pago del Mensual.
import { afterEach, describe, expect, it } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';
import { t } from '@/i18n/es-MX';
import { lockedCtaLabel, lockedCtaOffersTrial, lockedCtaPath } from './lockedCta';

afterEach(() => {
  localStorage.clear();
});

describe('botón de los candados de Gratis', () => {
  it('sin la nube dice Ver planes y abre los planes, aunque la bandera esté prendida', () => {
    expect(lockedCtaLabel(true, false)).toBe('Ver planes');
    expect(lockedCtaPath(true, false)).toBe('/suscripcion');
    expect(lockedCtaOffersTrial(true, false)).toBe(false);
    // En las pruebas no hay nube configurada, así que por omisión también dice Ver planes
    expect(lockedCtaLabel()).toBe(t.billing.featureSeePlans);
    expect(lockedCtaPath()).toBe('/suscripcion');
  });

  it('con la nube y la bandera dice Prueba 7 días gratis y abre la forma de pago del Mensual', () => {
    expect(lockedCtaLabel(true, true)).toBe('Prueba 7 días gratis');
    expect(lockedCtaPath(true, true)).toBe('/suscripcion?plan=mensual');
  });

  it('con la nube y la bandera apagada desde el servidor dice Ver planes', () => {
    writeStoredFlags({ freeTrial: false });
    expect(lockedCtaLabel(undefined, true)).toBe(t.billing.featureSeePlans);
    expect(lockedCtaPath(undefined, true)).toBe('/suscripcion');
    writeStoredFlags({ freeTrial: true });
    expect(lockedCtaLabel(undefined, true)).toBe(t.billing.freeTrialCta);
    expect(lockedCtaPath(undefined, true)).toBe('/suscripcion?plan=mensual');
  });
});
