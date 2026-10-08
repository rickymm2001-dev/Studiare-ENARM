// Costo estimado de una llamada (8.1). Los precios vienen de la configuración, en dólares por
// millón de tokens. Los tokens de entrada que devuelve la API ya no incluyen los de caché.
import type { ModelPrice } from './config.ts';

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}

export function estimateCostUsd(price: ModelPrice, usage: Usage): number {
  const dollars =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheWriteTokens * price.cacheWrite +
      usage.cacheReadTokens * price.cacheRead) /
    1_000_000;
  // Seis decimales bastan para llamadas de fracciones de centavo
  return Math.round(dollars * 1e6) / 1e6;
}

/** Tokens aproximados de un texto, para el modo simulado. Unos 4 caracteres por token en español */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
