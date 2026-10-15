// Tope de costo de las evaluaciones (--max-cost, B12 4.4). Antes de cada llamada se reserva su peor
// costo posible (entrada estimada más max_tokens) y la llamada solo sale si cabe en lo que queda. Al
// volver se cambia la reserva por el costo real. Así una corrida nunca pasa del tope, ni con varias
// llamadas a la vez. Cada llamada deja su registro en una sonda, que dice cómo terminó (negativa del
// modelo o corte por max_tokens) y cuánto costó, aunque el proveedor haya lanzado un error.
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import type { ModelPrice } from '../../supabase/functions/_shared/ai/config.ts';
import { estimateCostUsd, type Usage } from '../../supabase/functions/_shared/ai/cost.ts';
import type { AiProvider, MessagesApi } from '../../supabase/functions/_shared/ai/provider.ts';

/** Descuento de Message Batches sobre todo el uso, también la caché */
export const BATCH_DISCOUNT = 0.5;

/** Tokens que suma el esquema de salida a la entrada (3.3) */
const SCHEMA_TOKENS = 400;
/** Caracteres por token para estimar la entrada. Menos que los 3 del español, para quedar del lado seguro */
const CHARS_PER_TOKEN = 2.5;

/** El peor costo de una llamada. La entrada se estima por caracteres y la salida es max_tokens */
export function worstCaseUsd(
  price: ModelPrice,
  inputChars: number,
  maxTokens: number,
  batch = false,
): number {
  const inputTokens = Math.ceil(inputChars / CHARS_PER_TOKEN) + SCHEMA_TOKENS;
  const dollars = (inputTokens * price.input + maxTokens * price.output) / 1_000_000;
  return dollars * (batch ? BATCH_DISCOUNT : 1);
}

export class Budget {
  readonly maxUsd: number;
  private spent = 0;
  private reserved = 0;
  /** Alguna llamada ya no cupo. La corrida se detiene y lo dice */
  exhausted = false;

  constructor(maxUsd: number) {
    this.maxUsd = maxUsd;
  }

  get spentUsd(): number {
    return Math.round(this.spent * 1e6) / 1e6;
  }

  /** Aparta el peor costo de una llamada. false si ya no cabe, y entonces la corrida se detiene */
  reserve(worstUsd: number): boolean {
    if (this.exhausted || this.spent + this.reserved + worstUsd > this.maxUsd) {
      this.exhausted = true;
      return false;
    }
    this.reserved += worstUsd;
    return true;
  }

  /** Cambia la reserva por lo que costó de verdad */
  settle(reservedUsd: number, actualUsd: number): void {
    this.reserved = Math.max(0, this.reserved - reservedUsd);
    this.spent += actualUsd;
  }
}

/** La llamada no salió porque ya no cabía en el tope de costo */
export class BudgetExceededError extends Error {
  constructor() {
    super('Se llegó al tope de costo de la evaluación');
    this.name = 'BudgetExceededError';
  }
}

// ---------------------------------------------------------------------------------------------
// Sonda de llamadas

export interface CallRecord {
  /** end_turn, max_tokens, refusal o el equivalente de otro proveedor */
  stopReason: string | null;
  /** La categoría de la negativa, si el modelo se negó */
  refusalCategory: string | null;
  usage: Usage;
  costUsd: number;
}

/** Lo que pasó en las llamadas de un caso */
export interface CallProbe {
  calls: CallRecord[];
  /** Alguna llamada de este caso no salió por el tope de costo */
  budgetStopped: boolean;
}

export const newProbe = (): CallProbe => ({ calls: [], budgetStopped: false });

export const probeCost = (probe: CallProbe): number =>
  probe.calls.reduce((sum, call) => sum + call.costUsd, 0);

export type PriceOf = (modelId: string) => ModelPrice | undefined;

function usageOfMessage(message: Message): Usage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
  };
}

/** Registra en la sonda cómo terminó cada mensaje y cuánto costó, con el precio del modelo pedido */
export function recordMessage(
  probe: CallProbe,
  message: Message,
  price: ModelPrice | undefined,
  discount = 1,
): void {
  const usage = usageOfMessage(message);
  probe.calls.push({
    stopReason: message.stop_reason,
    refusalCategory: message.stop_details?.category ?? null,
    usage,
    costUsd: price ? estimateCostUsd(price, usage) * discount : 0,
  });
}

/** El cliente del SDK con su sonda. Cada respuesta deja su registro antes de que el proveedor la lea */
export function probedMessagesApi(
  api: MessagesApi,
  probe: CallProbe,
  priceOf: PriceOf,
): MessagesApi {
  return {
    async create(params, options) {
      const message = await api.create(params, options);
      recordMessage(probe, message, priceOf(params.model));
      return message;
    },
  };
}

/**
 * El proveedor con el tope de costo. Reserva el peor costo antes de cada llamada y al volver asienta
 * lo que registró la sonda, o lo que dice el uso del resultado si el proveedor no deja registro, como
 * el simulado
 */
export function budgetedProvider(
  provider: AiProvider,
  budget: Budget,
  probe: CallProbe,
  priceOf: PriceOf,
): AiProvider {
  return {
    mode: provider.mode,
    async call(call) {
      const price = priceOf(call.model.id);
      const worst = price
        ? worstCaseUsd(price, call.system.length + call.user.length, call.model.maxTokens)
        : 0;
      if (!budget.reserve(worst)) {
        probe.budgetStopped = true;
        throw new BudgetExceededError();
      }
      const before = probe.calls.length;
      const recorded = () =>
        probe.calls.slice(before).reduce((sum, record) => sum + record.costUsd, 0);
      try {
        const result = await provider.call(call);
        const actual =
          probe.calls.length > before
            ? recorded()
            : price
              ? estimateCostUsd(price, result.usage)
              : 0;
        budget.settle(worst, actual);
        return result;
      } catch (error) {
        budget.settle(worst, recorded());
        throw error;
      }
    },
  };
}
