import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config.ts';
import { addUsage, approximateTokens, EMPTY_USAGE, estimateCostUsd } from './cost.ts';

const sonnet = DEFAULT_CONFIG.prices['claude-sonnet-5-5'];
const haiku = DEFAULT_CONFIG.prices['claude-haiku-4-5'];

describe('costo estimado', () => {
  it('cobra cada tipo de token a su precio por millón', () => {
    if (!sonnet || !haiku) throw new Error('Faltan precios');
    expect(estimateCostUsd(sonnet, { ...EMPTY_USAGE, inputTokens: 1_000_000 })).toBe(2);
    expect(estimateCostUsd(sonnet, { ...EMPTY_USAGE, outputTokens: 1_000_000 })).toBe(10);
    expect(estimateCostUsd(sonnet, { ...EMPTY_USAGE, cacheWriteTokens: 1_000_000 })).toBe(2.5);
    expect(estimateCostUsd(sonnet, { ...EMPTY_USAGE, cacheReadTokens: 1_000_000 })).toBe(0.2);
    expect(
      estimateCostUsd(haiku, {
        inputTokens: 2000,
        outputTokens: 500,
        cacheWriteTokens: 0,
        cacheReadTokens: 4000,
      }),
    ).toBe(0.0049);
  });

  it('una llamada sin tokens no cuesta', () => {
    if (!sonnet) throw new Error('Falta precio');
    expect(estimateCostUsd(sonnet, EMPTY_USAGE)).toBe(0);
  });

  it('suma los tokens de varios intentos', () => {
    const total = addUsage(
      { inputTokens: 1, outputTokens: 2, cacheWriteTokens: 3, cacheReadTokens: 4 },
      { inputTokens: 10, outputTokens: 20, cacheWriteTokens: 30, cacheReadTokens: 40 },
    );
    expect(total).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      cacheWriteTokens: 33,
      cacheReadTokens: 44,
    });
  });

  it('aproxima los tokens de un texto', () => {
    expect(approximateTokens('')).toBe(0);
    expect(approximateTokens('abcd')).toBe(1);
    expect(approximateTokens('abcde')).toBe(2);
  });
});
