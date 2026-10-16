import { describe, expect, it } from 'vitest';
import { adaptiveTexts } from './adaptive';

const all = [
  adaptiveTexts.label,
  adaptiveTexts.hint,
  adaptiveTexts.unit,
  adaptiveTexts.calibrating(50),
  adaptiveTexts.loading,
  adaptiveTexts.difficultyLocked,
];

describe('textos del modo adaptativo', () => {
  it('van en español de México con trato de tú, sin signos de exclamación ni dos puntos', () => {
    for (const text of all) {
      expect(text).not.toMatch(/[!¡:]/);
      expect(text.length).toBeGreaterThan(5);
    }
    expect(adaptiveTexts.hint).toMatch(/\btu\b|\btus\b/);
    expect(adaptiveTexts.label).toContain('tu nivel');
  });

  it('nunca hablan de puntaje estimado, probabilidad, plaza ni ranking', () => {
    const forbidden = /puntaje estimado|probabilidad|plaza|ranking|lugar n[uú]mero/i;
    for (const text of all) expect(text).not.toMatch(forbidden);
  });

  it('dicen cuántas preguntas hacen falta con el formato de México', () => {
    expect(adaptiveTexts.calibrating(1200)).toContain('1,200');
    expect(adaptiveTexts.calibrating(50)).toContain('50');
  });
});
