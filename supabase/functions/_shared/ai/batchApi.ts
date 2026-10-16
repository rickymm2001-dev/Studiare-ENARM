// Message Batches de Anthropic (B12, 3.4). El adaptador del SDK oficial para producción y un lote
// simulado para el proxy de desarrollo sin clave, para la función en modo simulado y para las
// pruebas. El simulado calcula la respuesta fija de cada petición con la entrada que lleva su
// mensaje y reconoce el motor por su prompt, así que no necesita ningún dato aparte de la petición.
import type {
  Message,
  MessageBatch,
  MessageBatchIndividualResponse,
  MessageBatchResult,
} from '@anthropic-ai/sdk/resources/messages';
import { APIConnectionError, NotFoundError } from '@anthropic-ai/sdk';
import { AI_ENGINES, type AiEngine, type EngineInputs } from './engines/aiContracts.ts';
import { MOCK_MODEL, mockOutput } from './engines/aiMock.ts';
import { approximateTokens } from './cost.ts';
import {
  BatchCreateUncertainError,
  BatchNotFoundError,
  type BatchApi,
  type BatchRequest,
} from './ports.ts';
import { inputFromUserMessage, type PromptSets } from './prompts.ts';

// ---------------------------------------------------------------------------------------------
// SDK

/** Lo único que se usa de client.messages.batches. Las pruebas ponen uno falso */
export interface BatchesClient {
  create(
    params: { requests: BatchRequest[] },
    options?: { timeout?: number; maxRetries?: number },
  ): Promise<MessageBatch>;
  retrieve(batchId: string): Promise<MessageBatch>;
  results(batchId: string): Promise<AsyncIterable<MessageBatchIndividualResponse>>;
  cancel(batchId: string): Promise<MessageBatch>;
  delete(batchId: string): Promise<unknown>;
  list(params: { limit: number }): AsyncIterable<MessageBatch>;
}

/** Un 404 del SDK es un lote que ya no existe. Cualquier otro error sigue su camino */
function asLost(error: unknown): never {
  if (error instanceof NotFoundError) throw new BatchNotFoundError();
  throw error;
}

export function createSdkBatchApi(batches: BatchesClient): BatchApi {
  return {
    async create(requests) {
      try {
        // Sin reintentos del SDK (revisión del hallazgo 10). Crear un lote no es idempotente y Anthropic no
        // ofrece una llave de idempotencia para los lotes: si el primer POST tarda más del plazo pero el lote
        // se creó, un reintento crearía otro con los mismos custom_id y solo se registraría el segundo. El
        // primero se cobraría sin que nadie lo recoja y dejaría texto de alumnos en Anthropic hasta 29
        // días. Quien reintenta es el ciclo, que sí reconoce un lote que se creó y no se registró
        return await batches.create(
          { requests: [...requests] },
          { timeout: 60_000, maxRetries: 0 },
        );
      } catch (error) {
        // Sin respuesta de la API el lote pudo haberse creado, y los trabajos no se regresan a la cola
        if (error instanceof APIConnectionError) throw new BatchCreateUncertainError();
        throw error;
      }
    },
    async retrieve(batchId) {
      try {
        return await batches.retrieve(batchId);
      } catch (error) {
        return asLost(error);
      }
    },
    async results(batchId) {
      try {
        return await batches.results(batchId);
      } catch (error) {
        return asLost(error);
      }
    },
    cancel: (batchId) => batches.cancel(batchId),
    async delete(batchId) {
      try {
        await batches.delete(batchId);
      } catch (error) {
        // Ya no existe. Para lo que importa, que no queden ahí textos de alumnos, es lo mismo
        if (error instanceof NotFoundError) return;
        throw error;
      }
    },
    async recent(limit) {
      const found: MessageBatch[] = [];
      for await (const batch of batches.list({ limit })) {
        found.push(batch);
        if (found.length >= limit) break;
      }
      return found;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Lote simulado

/** Un mensaje como los de la API, para el lote simulado y las pruebas */
export function simulatedMessage(
  text: string,
  options: { model: string; inputTokens: number; outputTokens: number },
): Message {
  return {
    id: 'msg_simulado',
    type: 'message',
    role: 'assistant',
    model: options.model,
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: options.inputTokens,
      output_tokens: options.outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as unknown as Message;
}

const systemText = (request: BatchRequest): string => {
  const system = request.params.system;
  if (typeof system === 'string') return system;
  return (system ?? []).map((block) => block.text).join('\n');
};

const userText = (request: BatchRequest): string => {
  const content = request.params.messages[0]?.content;
  if (typeof content === 'string') return content;
  return (content ?? []).flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n');
};

/**
 * Contesta cada petición con la respuesta fija de su motor. Una petición que no se reconoce sale
 * como errored invalid_request, igual que la API con una petición mal armada
 */
export function mockBatchResolver(
  prompts: PromptSets,
): (request: BatchRequest) => MessageBatchResult {
  return (request) => {
    const system = systemText(request);
    const engine: AiEngine | undefined = AI_ENGINES.find((name) => prompts[name].text === system);
    const user = userText(request);
    const input = inputFromUserMessage(user);
    if (!engine || input === undefined) {
      return {
        type: 'errored',
        error: {
          type: 'error',
          request_id: null,
          error: { type: 'invalid_request_error', message: 'Petición simulada no reconocida' },
        },
      };
    }
    const text = JSON.stringify(mockOutput(engine, input as EngineInputs[typeof engine]));
    return {
      type: 'succeeded',
      message: simulatedMessage(text, {
        model: MOCK_MODEL,
        inputTokens: approximateTokens(`${system}${user}`),
        outputTokens: approximateTokens(text),
      }),
    };
  };
}

interface SimulatedBatch {
  batch: MessageBatch;
  requests: BatchRequest[];
  retrieves: number;
  results: Map<string, MessageBatchResult> | null;
}

export interface SimulatedBatchOptions {
  resolve: (request: BatchRequest) => MessageBatchResult;
  /**
   * Consultas con retrieve que un lote pasa en curso antes de terminar solo. Con 0 termina en la
   * primera consulta, que es el ciclo siguiente al que lo mandó. Con Infinity solo termina con end()
   */
  retrievesBeforeEnd?: number;
  now?: () => number;
  /**
   * Un lote que este simulador no conoce, como uno de otra copia de la función, se da por
   * terminado y sin resultados, así sus trabajos vuelven a la cola. Sin esto, retrieve falla
   */
  unknownAsEnded?: boolean;
}

/** Un lote en memoria con la misma forma que la API. También guarda lo que se le pidió */
export class SimulatedBatchApi implements BatchApi {
  readonly batches = new Map<string, SimulatedBatch>();
  readonly deleted: string[] = [];
  readonly canceled: string[] = [];
  private readonly options: SimulatedBatchOptions;
  private next = 0;

  constructor(options: SimulatedBatchOptions) {
    this.options = options;
  }

  private now(): string {
    return new Date(this.options.now?.() ?? Date.now()).toISOString();
  }

  private counts(batch: SimulatedBatch): MessageBatch['request_counts'] {
    const counts = { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 };
    if (!batch.results) return { ...counts, processing: batch.requests.length };
    for (const result of batch.results.values()) counts[result.type] += 1;
    return counts;
  }

  create(requests: readonly BatchRequest[]): Promise<MessageBatch> {
    this.next += 1;
    const id = `msgbatch_simulado_${String(this.next).padStart(4, '0')}`;
    const created = this.now();
    const batch: MessageBatch = {
      id,
      type: 'message_batch',
      archived_at: null,
      cancel_initiated_at: null,
      created_at: created,
      ended_at: null,
      expires_at: new Date(Date.parse(created) + 24 * 3_600_000).toISOString(),
      processing_status: 'in_progress',
      request_counts: {
        processing: requests.length,
        succeeded: 0,
        errored: 0,
        canceled: 0,
        expired: 0,
      },
      results_url: null,
    };
    this.batches.set(id, { batch, requests: [...requests], retrieves: 0, results: null });
    return Promise.resolve(structuredClone(batch));
  }

  /** Termina un lote. Lo que no venga en overrides se contesta con resolve */
  end(batchId: string, overrides: Readonly<Record<string, MessageBatchResult>> = {}): void {
    const found = this.batches.get(batchId);
    if (!found) throw new Error(`Lote simulado desconocido ${batchId}`);
    if (found.results) return;
    found.results = new Map(
      found.requests.map((request) => [
        request.custom_id,
        overrides[request.custom_id] ?? this.options.resolve(request),
      ]),
    );
    found.batch = {
      ...found.batch,
      processing_status: 'ended',
      ended_at: this.now(),
      results_url: `simulado://${batchId}`,
      request_counts: this.counts(found),
    };
  }

  /** Termina todos los lotes en curso */
  endAll(): void {
    for (const [id, found] of this.batches) if (!found.results) this.end(id);
  }

  private unknown(batchId: string): MessageBatch {
    const at = this.now();
    return {
      id: batchId,
      type: 'message_batch',
      archived_at: null,
      cancel_initiated_at: null,
      created_at: at,
      ended_at: at,
      expires_at: at,
      processing_status: 'ended',
      request_counts: { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
      results_url: null,
    };
  }

  retrieve(batchId: string): Promise<MessageBatch> {
    const found = this.batches.get(batchId);
    if (!found) {
      if (this.options.unknownAsEnded) return Promise.resolve(this.unknown(batchId));
      return Promise.reject(new BatchNotFoundError());
    }
    if (!found.results && found.retrieves >= (this.options.retrievesBeforeEnd ?? 0)) {
      this.end(batchId);
    }
    found.retrieves += 1;
    return Promise.resolve(structuredClone(found.batch));
  }

  results(batchId: string): Promise<AsyncIterable<MessageBatchIndividualResponse>> {
    const found = this.batches.get(batchId);
    if (!found?.results) {
      if (!found && this.options.unknownAsEnded) return Promise.resolve(iterate([]));
      if (!found) return Promise.reject(new BatchNotFoundError());
      return Promise.reject(new Error(`El lote simulado ${batchId} no tiene resultados`));
    }
    const lines = [...found.results].map(([custom_id, result]) => ({ custom_id, result }));
    return Promise.resolve(iterate(lines));
  }

  cancel(batchId: string): Promise<MessageBatch> {
    this.canceled.push(batchId);
    const found = this.batches.get(batchId);
    if (!found) return Promise.reject(new Error(`Lote simulado desconocido ${batchId}`));
    found.batch = {
      ...found.batch,
      processing_status: 'canceling',
      cancel_initiated_at: this.now(),
    };
    return Promise.resolve(structuredClone(found.batch));
  }

  delete(batchId: string): Promise<void> {
    this.deleted.push(batchId);
    this.batches.delete(batchId);
    return Promise.resolve();
  }

  recent(limit: number): Promise<MessageBatch[]> {
    const all = [...this.batches.values()].map((found) => structuredClone(found.batch));
    return Promise.resolve(all.reverse().slice(0, limit));
  }
}

async function* iterate<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) yield await Promise.resolve(item);
}
