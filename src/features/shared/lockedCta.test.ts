// @vitest-environment jsdom
// El botón de los candados de Gratis (respuesta 20). No promete la prueba de 7 días hasta que B10 la
// crea y prende la bandera freeTrial.
import { afterEach, describe, expect, it } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';
import { t } from '@/i18n/es-MX';
import { lockedCtaLabel } from './lockedCta';

afterEach(() => {
  localStorage.clear();
});

describe('botón de los candados de Gratis', () => {
  it('dice Ver planes mientras la prueba gratis no existe', () => {
    expect(lockedCtaLabel()).toBe(t.billing.featureSeePlans);
    expect(lockedCtaLabel(false)).toBe('Ver planes');
  });

  it('dice Prueba 7 días gratis cuando la bandera está prendida, también desde el servidor', () => {
    expect(lockedCtaLabel(true)).toBe('Prueba 7 días gratis');
    writeStoredFlags({ freeTrial: true });
    expect(lockedCtaLabel()).toBe(t.billing.freeTrialCta);
    writeStoredFlags({ freeTrial: false });
    expect(lockedCtaLabel()).toBe(t.billing.featureSeePlans);
  });
});
