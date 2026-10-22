import { describe, expect, it } from 'vitest';
import { walletTexts } from './wallet';

/** Todos los textos de walletTexts, en una lista plana */
function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
}

describe('textos de las billeteras (B17, 6.5)', () => {
  const all = texts(walletTexts);

  it('hay textos y ninguno está vacío', () => {
    expect(all.length).toBeGreaterThan(8);
    for (const text of all) expect(text.trim().length).toBeGreaterThan(10);
  });

  it('van en español de México con trato de tú, sin dos puntos ni signos de exclamación', () => {
    for (const text of all) {
      expect(text, text).not.toContain(':');
      expect(text, text).not.toMatch(/[!¡]/);
      expect(text, text).not.toMatch(/\b(usted|ustedes|vosotros)\b/i);
      expect(text, text).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it('cada frase cierra con punto, salvo el título y el estado de carga', () => {
    for (const [name, text] of Object.entries({
      intro: walletTexts.intro,
      noWallet: walletTexts.noWallet,
      unavailable: walletTexts.unavailable,
      noCode: walletTexts.noCode,
      ...walletTexts.errors,
    })) {
      expect(text, name).toMatch(/\.$/);
    }
  });

  it('no prometen resultados médicos, de puntaje ni garantías que Stripe no da', () => {
    for (const text of all) {
      expect(text, text).not.toMatch(/puntaje|plaza|garantiz|100 ?%|aprob/i);
    }
  });

  it('solo el rechazo del banco o la billetera dice que no se cobró nada', () => {
    expect(walletTexts.errors.declined).toContain('no se cobró nada');
    // Un error que no es el rechazo (un fallo de red de Stripe.js, una excepción) no permite asegurarlo, así que
    // pide revisar el plan antes de reintentar para no pagar dos veces
    for (const text of [walletTexts.errors.failed, walletTexts.errors.unknown]) {
      expect(text).not.toMatch(/no se cobr/i);
      expect(text).toContain('Revisa tu plan');
      expect(text).toContain('antes de volver a intentarlo');
    }
  });

  it('el aviso de la prueba remite al resumen de arriba, que es el que dice la fecha del primer cobro', () => {
    expect(walletTexts.consentTrial).toContain('resumen de arriba');
    expect(walletTexts.consentTrial).toContain('prueba gratis');
    expect(walletTexts.consentCharge).toContain('resumen de arriba');
  });
});
