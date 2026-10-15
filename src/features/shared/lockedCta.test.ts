// @vitest-environment jsdom
// El botón de los candados de Gratis (respuesta 20). Promete la prueba de 7 días solo si al alumno
// todavía le toca, con la bandera freeTrial y la nube configurada, porque la prueba existe solo con la
// cuenta en la nube (B10), y entonces abre la forma de pago del Mensual. La portada la anuncia con la
// bandera y la nube, porque quien todavía no tiene cuenta puede tenerla.
import { afterEach, describe, expect, it } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';
import { t } from '@/i18n/es-MX';
import { lockedCtaLabel, lockedCtaOffersTrial, lockedCtaPath, trialAdvertised } from './lockedCta';

afterEach(() => {
  localStorage.clear();
});

describe('botón de los candados de Gratis', () => {
  it('sin la nube dice Ver planes y abre los planes, aunque la bandera esté prendida', () => {
    expect(lockedCtaLabel(true, true, false)).toBe('Ver planes');
    expect(lockedCtaPath(true, true, false)).toBe('/suscripcion');
    expect(lockedCtaOffersTrial(true, true, false)).toBe(false);
    // En las pruebas no hay nube configurada, así que por omisión también dice Ver planes
    expect(lockedCtaLabel(true)).toBe(t.billing.featureSeePlans);
    expect(lockedCtaPath(true)).toBe('/suscripcion');
  });

  it('con la nube, la bandera y la prueba disponible dice Prueba 7 días gratis y abre el Mensual', () => {
    expect(lockedCtaLabel(true, true, true)).toBe('Prueba 7 días gratis');
    expect(lockedCtaPath(true, true, true)).toBe('/suscripcion?plan=mensual');
  });

  it('a quien ya no le toca la prueba le dice Ver planes, aunque estén la nube y la bandera', () => {
    expect(lockedCtaOffersTrial(false, true, true)).toBe(false);
    expect(lockedCtaLabel(false, true, true)).toBe(t.billing.featureSeePlans);
    expect(lockedCtaPath(false, true, true)).toBe('/suscripcion');
  });

  it('con la nube y la bandera apagada desde el servidor dice Ver planes', () => {
    writeStoredFlags({ freeTrial: false });
    expect(lockedCtaLabel(true, undefined, true)).toBe(t.billing.featureSeePlans);
    expect(lockedCtaPath(true, undefined, true)).toBe('/suscripcion');
    writeStoredFlags({ freeTrial: true });
    expect(lockedCtaLabel(true, undefined, true)).toBe(t.billing.freeTrialCta);
    expect(lockedCtaPath(true, undefined, true)).toBe('/suscripcion?plan=mensual');
  });

  it('la portada anuncia la prueba con la bandera y la nube, sin cuenta que revisar', () => {
    expect(trialAdvertised(true, true)).toBe(true);
    expect(trialAdvertised(false, true)).toBe(false);
    expect(trialAdvertised(true, false)).toBe(false);
  });
});
