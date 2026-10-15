// Anthropic simulado para las pruebas y las e2e de nube (B12, 8.2). Mensajes al momento con respuestas
// en orden (fakeApi) y Message Batches en memoria con la misma forma que la API, que solo terminan
// cuando la prueba lo pide. Por omisión cada petición del lote se contesta con la respuesta fija de
// su motor, que pasa el esquema y las guardas. También arma los errores y mensajes especiales de la
// API (negativa, límite de gasto, razonamiento antes del texto) para probar cómo se leen.
// Nunca llama a la red.
import type {
  Message,
  MessageBatch,
  MessageBatchResult,
} from '@anthropic-ai/sdk/resources/messages';
import { APIError } from '@anthropic-ai/sdk';
import type { AnthropicClients } from '../anthropic.ts';
import { mockBatchResolver, SimulatedBatchApi, type BatchesClient } from '../batchApi.ts';
import type { BatchApi, BatchRequest } from '../ports.ts';
import { bundledPromptSets, type PromptSets } from '../prompts.ts';
import { fakeApi, fakeMessage, type FakeApi } from './fakes.ts';

export { fakeApi, fakeMessage, type FakeApi };

/** Lotes simulados que la prueba controla. Además puede hacer fallar el siguiente create */
export class FakeBatchApi extends SimulatedBatchApi {
  readonly created: { id: string; requests: BatchRequest[] }[] = [];
  private failures: Error[] = [];

  /** El siguiente create falla con este error, como un 429 o un 500 de la API */
  failNextCreate(error: Error): void {
    this.failures.push(error);
  }

  override async create(requests: readonly BatchRequest[]): Promise<MessageBatch> {
    const failure = this.failures.shift();
    if (failure) throw failure;
    const batch = await super.create(requests);
    this.created.push({ id: batch.id, requests: [...requests] });
    return batch;
  }
}

export interface FakeAnthropic {
  /** messages.create, que contesta en orden con replies */
  messages: FakeApi;
  batches: FakeBatchApi;
}

export function createFakeAnthropic(
  options: {
    replies?: readonly (Message | Error)[];
    /** Para reconocer el motor de cada petición del lote. Por omisión, los prompts del repositorio */
    prompts?: PromptSets;
    /** Cómo se contesta cada petición del lote que la prueba no fija con end() */
    resolve?: (request: BatchRequest) => MessageBatchResult;
    now?: () => number;
  } = {},
): FakeAnthropic {
  return {
    messages: fakeApi(options.replies ?? []),
    batches: new FakeBatchApi({
      resolve: options.resolve ?? mockBatchResolver(options.prompts ?? bundledPromptSets()),
      retrievesBeforeEnd: Number.POSITIVE_INFINITY,
      ...(options.now ? { now: options.now } : {}),
    }),
  };
}

/** El cliente de lotes con la forma del SDK, para armar la función con createSdkBatchApi */
export function batchesClientOf(api: BatchApi): BatchesClient {
  return {
    create: (params) => api.create(params.requests),
    retrieve: (batchId) => api.retrieve(batchId),
    results: (batchId) => api.results(batchId),
    cancel: (batchId) => api.cancel(batchId),
    delete: async (batchId) => {
      await api.delete(batchId);
      return { id: batchId, type: 'message_batch_deleted' };
    },
    list: async function* (params) {
      for (const batch of await api.recent(params.limit)) yield batch;
    },
  };
}

/** Los clientes que la función crea con la clave, pero simulados */
export const anthropicClientsOf = (fake: FakeAnthropic): AnthropicClients => ({
  messages: fake.messages,
  batches: batchesClientOf(fake.batches),
});

// ---------------------------------------------------------------------------------------------
// Respuestas especiales de la API

/** El modelo se negó (stop_reason refusal) con su categoría */
export function refusalMessage(category: string | null = 'bio'): Message {
  return {
    ...fakeMessage(null, { stop: 'refusal' }),
    stop_details: { type: 'refusal', category, explanation: null },
  } as unknown as Message;
}

/** Un mensaje que trae primero un bloque de razonamiento y luego el texto */
export function thinkingFirstMessage(text: string): Message {
  const message = fakeMessage(text);
  return {
    ...message,
    content: [{ type: 'thinking', thinking: '', signature: 'firma' }, ...message.content],
  } as unknown as Message;
}

/** Un error de la API como lo arma el SDK a partir del estado y el cuerpo */
export function apiError(
  status: number,
  body: object,
  headers: Record<string, string> = {},
): Error {
  return APIError.generate(status, body, undefined, new Headers(headers));
}

/** El tope mensual de la organización (429 sin retry-after y con enforced_spend_limit_reached) */
export const spendLimitError = (): Error =>
  apiError(429, {
    type: 'error',
    error: {
      type: 'rate_limit_error',
      message: 'You have reached your API usage limits.',
      details: { error_code: 'enforced_spend_limit_reached' },
    },
  });

/** El límite de gasto que pone la cuenta a un espacio de trabajo (400) */
export const workspaceLimitError = (): Error =>
  apiError(400, {
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message:
        'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01.',
    },
  });

/** Un 429 de límite por minuto, con retry-after */
export const rateLimitError = (): Error =>
  apiError(
    429,
    { type: 'error', error: { type: 'rate_limit_error', message: 'Too many requests' } },
    { 'retry-after': '20' },
  );

/** Un resultado errored del lote */
export const erroredResult = (
  type: 'invalid_request_error' | 'api_error' | 'overloaded_error',
): MessageBatchResult => ({
  type: 'errored',
  error: { type: 'error', request_id: null, error: { type, message: 'falla simulada' } },
});

/** Un resultado succeeded del lote con este mensaje */
export const succeededResult = (message: Message): MessageBatchResult => ({
  type: 'succeeded',
  message,
});
