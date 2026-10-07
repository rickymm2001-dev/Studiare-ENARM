import { describe, expect, it } from 'vitest';
import { CardQualityConfigSchema, DEFAULT_CARD_QUALITY } from './cardQuality';
import { DEFAULT_THRESHOLDS } from './thresholds';

describe('umbrales de calidad de tarjetas', () => {
  it('los valores por defecto son los documentados', () => {
    expect(DEFAULT_CARD_QUALITY).toEqual({
      frontWords: { max: 30, hardMax: 60 },
      backWords: { max: 25, hardMax: 50 },
      clozeTextWords: { max: 35, hardMax: 70 },
      listItems: { max: 3, hardMax: 7 },
      clozeHoles: { max: 3, hardMax: 6 },
      holeAnswerWords: { max: 5, hardMax: 12 },
      sentences: { max: 2, hardMax: 4 },
      lines: { max: 3, hardMax: 6 },
      context: { min: 3, hardMin: 1, wordChars: 3 },
      leakMinChars: 3,
      listLineWords: 8,
      inlineItemWords: 5,
      duplicates: { nearSimilarity: 0.85, maxMatches: 5 },
    });
  });

  it('la sugerencia de lista empieza donde el tutor llama tarjeta de lista (7.9)', () => {
    // El tutor marca desde listCardItems elementos. Aquí se permiten uno menos
    expect(DEFAULT_CARD_QUALITY.listItems.max + 1).toBe(
      DEFAULT_THRESHOLDS.forgetting.listCardItems,
    );
  });

  it('acepta un cambio parcial de admin y deja los demás valores', () => {
    const edited = CardQualityConfigSchema.parse({
      ...DEFAULT_CARD_QUALITY,
      frontWords: { max: 20, hardMax: 40 },
      duplicates: { nearSimilarity: 0.9 },
    });
    expect(edited.frontWords).toEqual({ max: 20, hardMax: 40 });
    expect(edited.duplicates).toEqual({ nearSimilarity: 0.9, maxMatches: 5 });
    expect(edited.backWords).toEqual(DEFAULT_CARD_QUALITY.backWords);
  });

  it('rechaza un aviso más tolerante que la sugerencia', () => {
    const base = { ...DEFAULT_CARD_QUALITY };
    expect(
      CardQualityConfigSchema.safeParse({ ...base, backWords: { max: 30, hardMax: 20 } }).success,
    ).toBe(false);
    expect(
      CardQualityConfigSchema.safeParse({
        ...base,
        context: { min: 2, hardMin: 3, wordChars: 3 },
      }).success,
    ).toBe(false);
  });

  it('rechaza claves desconocidas y similitudes fuera de rango', () => {
    const base = { ...DEFAULT_CARD_QUALITY };
    expect(CardQualityConfigSchema.safeParse({ ...base, inventado: 1 }).success).toBe(false);
    for (const nearSimilarity of [0, -0.1, 1.1]) {
      expect(
        CardQualityConfigSchema.safeParse({ ...base, duplicates: { nearSimilarity } }).success,
      ).toBe(false);
    }
    expect(
      CardQualityConfigSchema.safeParse({ ...base, duplicates: { nearSimilarity: 1 } }).success,
    ).toBe(true);
  });
});
