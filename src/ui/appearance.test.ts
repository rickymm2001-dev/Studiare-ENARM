// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyAppearance, DEFAULT_APPEARANCE, FONT_CHOICES, FONT_FAMILIES } from './appearance';

function applied(font: keyof typeof FONT_FAMILIES) {
  const root = document.createElement('html');
  applyAppearance(root, { ...DEFAULT_APPEARANCE, font });
  return root;
}

describe('fuente de títulos (D-150)', () => {
  it('los títulos siguen siempre a la fuente del texto, como en la portada', () => {
    for (const font of FONT_CHOICES) {
      const root = applied(font);
      expect(root.style.getPropertyValue('--enarm-font-heading')).toBe(FONT_FAMILIES[font]);
      expect(root.style.getPropertyValue('--enarm-font-body')).toBe(FONT_FAMILIES[font]);
    }
  });
});
