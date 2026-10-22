// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyAppearance, DEFAULT_APPEARANCE, FONT_FAMILIES } from './appearance';

function applied(font: keyof typeof FONT_FAMILIES) {
  const root = document.createElement('html');
  applyAppearance(root, { ...DEFAULT_APPEARANCE, font });
  return root;
}

describe('fuente de títulos (V4-B2)', () => {
  it('con la fuente de siempre o la serif, los títulos van en serif', () => {
    for (const font of ['jakarta', 'serif'] as const) {
      expect(applied(font).style.getPropertyValue('--enarm-font-heading')).toBe(
        FONT_FAMILIES.serif,
      );
    }
  });

  it('con Atkinson o Lexend, los títulos siguen a la fuente del texto', () => {
    for (const font of ['atkinson', 'lexend'] as const) {
      const root = applied(font);
      expect(root.style.getPropertyValue('--enarm-font-heading')).toBe(FONT_FAMILIES[font]);
      expect(root.style.getPropertyValue('--enarm-font-body')).toBe(FONT_FAMILIES[font]);
    }
  });
});
