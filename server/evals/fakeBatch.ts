// Message Batches simulado para las evaluaciones (B12, 4.7 del plan). Cumple el puerto BatchApi del
// núcleo sin red. Contesta cada petición con lo que diga respond, termina después de unas cuantas
// revisiones y recuerda qué se creó, se canceló y se borró. Lo usan las pruebas y el modo simulado de
// --batch y del juez. Cuando el paquete A deje su fakeAnthropic, este puede cambiarse por aquél.
import type {
  Message,
  MessageBatch,
  MessageBatchIndividualResponse,
} from '@anthropic-ai/sdk/resources/messages';
import type { BatchApi, BatchRequest } from '../../supabase/functions/_shared/ai/ports.ts';

export type BatchResult = MessageBatchIndividualResponse['result'];

export interface FakeBatchApi extends BatchApi {
  created: BatchRequest[][];
  canceled: string[];
  deleted: string[];
  polls: number;
}

export interface FakeBatchOptions {
  respond: (request: BatchRequest) => BatchResult;
  /** Revisiones con retrieve antes de terminar. 1 por omisión */
  pollsUntilEnded?: number;
}

export const succeeded = (message: Message): BatchResult => ({ type: 'succeeded', message });
export const errored = (type: 'invalid_request_error' | 'api_error'): BatchResult =>
  ({
    type: 'errored',
    error: { type: 'error', error: { type, message: 'falla simulada' } },
  }) as unknown as BatchResult;
export const expired = (): BatchResult => ({ type: 'expired' });

function batchOf(
  id: string,
  status: MessageBatch['processing_status'],
  size: number,
): MessageBatch {
  return {
    id,
    type: 'message_batch',
    processing_status: status,
    request_counts: {
      processing: status === 'ended' ? 0 : size,
      succeeded: status === 'ended' ? size : 0,
      errored: 0,
      canceled: 0,
      expired: 0,
    },
    created_at: '2026-10-15T00:00:00Z',
    ended_at: status === 'ended' ? '2026-10-15T00:10:00Z' : null,
    expires_at: '2026-10-16T00:00:00Z',
    archived_at: null,
    cancel_initiated_at: null,
    results_url: status === 'ended' ? `https://example.invalid/${id}/results` : null,
  };
}

export function createFakeBatchApi(options: FakeBatchOptions): FakeBatchApi {
  const batches = new Map<string, { requests: BatchRequest[]; polls: number; canceled: boolean }>();
  const api: FakeBatchApi = {
    created: [],
    canceled: [],
    deleted: [],
    polls: 0,
    create(requests) {
      const id = `msgbatch_fake_${batches.size + 1}`;
      batches.set(id, { requests: [...requests], polls: 0, canceled: false });
      api.created.push([...requests]);
      return Promise.resolve(batchOf(id, 'in_progress', requests.length));
    },
    retrieve(batchId) {
      const batch = batches.get(batchId);
      if (!batch) return Promise.reject(new Error('Lote desconocido'));
      batch.polls += 1;
      api.polls += 1;
      const ended = batch.canceled || batch.polls >= (options.pollsUntilEnded ?? 1);
      return Promise.resolve(
        batchOf(batchId, ended ? 'ended' : 'in_progress', batch.requests.length),
      );
    },
    results(batchId) {
      const batch = batches.get(batchId);
      if (!batch) return Promise.reject(new Error('Lote desconocido'));
      const responses: MessageBatchIndividualResponse[] = batch.requests.map((request) => ({
        custom_id: request.custom_id,
        result: batch.canceled ? { type: 'canceled' } : options.respond(request),
      }));
      // En cualquier orden, como la API real
      responses.reverse();
      return Promise.resolve(
        (async function* () {
          for (const response of responses) {
            await Promise.resolve();
            yield response;
          }
        })(),
      );
    },
    cancel(batchId) {
      const batch = batches.get(batchId);
      if (!batch) return Promise.reject(new Error('Lote desconocido'));
      batch.canceled = true;
      api.canceled.push(batchId);
      return Promise.resolve(batchOf(batchId, 'canceling', batch.requests.length));
    },
    delete(batchId) {
      api.deleted.push(batchId);
      return Promise.resolve();
    },
    recent() {
      return Promise.resolve(
        [...batches.entries()].map(([id, batch]) => batchOf(id, 'ended', batch.requests.length)),
      );
    },
  };
  return api;
}
