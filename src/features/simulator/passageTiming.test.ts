import { describe, expect, it } from 'vitest';
import {
  secondsOnText,
  secondsOverSuggested,
  suggestedMsForText,
  textStartAfterPause,
} from './passageTiming';

describe('tiempo sugerido de un texto', () => {
  it('es el número de preguntas por los segundos sugeridos de cada reactivo', () => {
    expect(suggestedMsForText(3, 90)).toBe(270_000);
    expect(suggestedMsForText(1, 90)).toBe(90_000);
    expect(suggestedMsForText(0, 90)).toBe(0);
    expect(suggestedMsForText(2, -5)).toBe(0);
  });

  it('avisa cuántos segundos se pasó y nada mientras no se pasa', () => {
    const base = { startedAt: 1_000_000, suggestedMs: 270_000 };
    expect(secondsOverSuggested({ ...base, now: 1_000_000 })).toBe(0);
    expect(secondsOverSuggested({ ...base, now: 1_270_000 })).toBe(0);
    expect(secondsOverSuggested({ ...base, now: 1_270_999 })).toBe(0);
    expect(secondsOverSuggested({ ...base, now: 1_271_000 })).toBe(1);
    expect(secondsOverSuggested({ ...base, now: 1_310_400 })).toBe(40);
  });

  it('sin hora de inicio o sin tiempo sugerido no hay con qué medir', () => {
    expect(secondsOverSuggested({ startedAt: 0, now: 5_000_000, suggestedMs: 270_000 })).toBe(0);
    expect(secondsOverSuggested({ startedAt: 1, now: 5_000_000, suggestedMs: 0 })).toBe(0);
    expect(secondsOnText({ startedAt: 0, now: 5_000_000 })).toBe(0);
  });

  it('cuenta los segundos que lleva en el texto y no baja de cero', () => {
    expect(secondsOnText({ startedAt: 10_000, now: 75_900 })).toBe(65);
    expect(secondsOnText({ startedAt: 10_000, now: 5_000 })).toBe(0);
  });
});

describe('pausa por la retroalimentación', () => {
  it('recorre el inicio del texto lo que duró la pausa, así el tiempo del texto no la cuenta', () => {
    const startedAt = 1_000_000;
    // Estuvo 40 segundos en la retroalimentación. A los 100 segundos del inicio lleva 60 en el texto
    const moved = textStartAfterPause(startedAt, 40_000);
    expect(moved).toBe(1_040_000);
    expect(secondsOnText({ startedAt: moved, now: startedAt + 100_000 })).toBe(60);
    expect(
      secondsOverSuggested({ startedAt: moved, now: startedAt + 100_000, suggestedMs: 50_000 }),
    ).toBe(10);
  });

  it('sin inicio o con una pausa negativa no mueve nada', () => {
    expect(textStartAfterPause(0, 40_000)).toBe(0);
    expect(textStartAfterPause(1_000_000, -5_000)).toBe(1_000_000);
    expect(textStartAfterPause(1_000_000, 0)).toBe(1_000_000);
  });
});
