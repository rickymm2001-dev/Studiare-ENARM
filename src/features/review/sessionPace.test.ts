import { describe, expect, it } from 'vitest';
import { estimateRemainingMinutes, MIN_REVIEWS_TO_ESTIMATE } from './sessionPace';

describe('ritmo de la sesión de repaso', () => {
  it('no estima nada con menos repasos que el umbral, para no decir una cifra de ruido', () => {
    expect(
      estimateRemainingMinutes({
        activeMs: 5 * 60_000,
        reviewed: MIN_REVIEWS_TO_ESTIMATE - 1,
        remaining: 20,
      }),
    ).toBeNull();
    expect(estimateRemainingMinutes({ activeMs: 0, reviewed: 0, remaining: 20 })).toBeNull();
  });

  it('con repasos suficientes proyecta lo que falta al ritmo medido', () => {
    // 3 tarjetas en 3 minutos, un minuto por tarjeta, y faltan 15
    expect(estimateRemainingMinutes({ activeMs: 3 * 60_000, reviewed: 3, remaining: 15 })).toBe(15);
    // 4 tarjetas en 2 minutos, media por tarjeta, y faltan 9. Se redondea a minutos enteros
    expect(estimateRemainingMinutes({ activeMs: 2 * 60_000, reviewed: 4, remaining: 9 })).toBe(5);
  });

  it('sin tarjetas por delante faltan cero minutos', () => {
    expect(estimateRemainingMinutes({ activeMs: 3 * 60_000, reviewed: 3, remaining: 0 })).toBe(0);
  });
});
