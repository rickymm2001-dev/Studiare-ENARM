import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config.ts';
import {
  addUsage,
  approximateTokens,
  BATCH_DISCOUNT,
  EMPTY_USAGE,
  estimateBatchCostUsd,
  estimateCostUsd,
  worstBatchCostUsd,
} from './cost.ts';

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

describe('costo por lote (3.4)', () => {
  const haiku55 = { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 };

  it('es la mitad de todo, también la caché', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    };
    expect(estimateCostUsd(haiku55, usage)).toBe(0.735);
    expect(estimateBatchCostUsd(haiku55, usage)).toBe(0.3675);
    expect(BATCH_DISCOUNT).toBe(0.5);
  });

  it('el peor costo cuenta 3 caracteres por token de entrada y toda la salida', () => {
    // 3,000 caracteres son 1,000 tokens de entrada y la salida es max_tokens completo
    expect(worstBatchCostUsd(haiku55, 'a'.repeat(3000), 2000)).toBe(
      estimateBatchCostUsd(haiku55, {
        inputTokens: 1000,
        outputTokens: 2000,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
      }),
    );
  });
});
