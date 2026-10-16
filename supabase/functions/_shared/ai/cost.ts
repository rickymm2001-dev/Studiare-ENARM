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

/** Message Batches cobra la mitad de todo, también la caché (B12, 0.5) */
export const BATCH_DISCOUNT = 0.5;

/** Lo que cuesta un resultado de un lote */
export function estimateBatchCostUsd(price: ModelPrice, usage: Usage): number {
  return Math.round(estimateCostUsd(price, usage) * BATCH_DISCOUNT * 1e6) / 1e6;
}

/**
 * El peor costo de una petición de un lote, antes de mandarla. La entrada estimada por su texto y la
 * salida completa hasta max_tokens, al precio de lote (3.4). Sirve para no mandar más de lo que cabe
 * en el presupuesto del día
 */
export function worstBatchCostUsd(price: ModelPrice, text: string, maxTokens: number): number {
  return estimateBatchCostUsd(price, {
    // Unos 3 caracteres por token en español con el tokenizador nuevo, que es el caso caro (3.3)
    inputTokens: Math.ceil(text.length / 3),
    outputTokens: maxTokens,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  });
}

/** Lo que el mensaje del reintento suma al del primer intento: lo que falló, hasta 8 líneas (run.ts) */
const RETRY_EXTRA_CHARS = 1_500;

/**
 * El peor costo de una llamada al momento antes de hacerla. Es lo que se reserva al admitirla para que
 * varias a la vez no se salten el tope en dólares (B12, ai_admit_v2). Cuenta todos los intentos que puede
 * hacer, cada uno con la entrada completa a 3 caracteres por token y a la tarifa más cara de entrada
 * (escribir la caché), y la salida llena hasta max_tokens. Es una cota y no un cálculo: casi siempre la
 * llamada cuesta mucho menos, y lo que sobra se devuelve al asentar o al liberar
 */
export function worstCallCostUsd(
  price: ModelPrice,
  text: string,
  maxTokens: number,
  attempts: number,
): number {
  const inputRate = Math.max(price.input, price.cacheWrite);
  let dollars = 0;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const chars = text.length + (attempt > 0 ? RETRY_EXTRA_CHARS : 0);
    dollars += (Math.ceil(chars / 3) * inputRate + maxTokens * price.output) / 1_000_000;
  }
  return Math.round(dollars * 1e6) / 1e6;
}
