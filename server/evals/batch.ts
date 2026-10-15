// Camino por lotes de npm run eval-ai --batch (B12, 3.4 y 4.7 del plan). Manda los casos de un motor
// como un lote de Message Batches, lo sondea hasta que termina, valida cada resultado con el mismo
// runEngine del camino al momento (esquema, guardas y reintento) y borra el lote al terminar (10.17).
//
// Cada petición del lote es exactamente la que mandaría el camino al momento, porque se captura del
// mismo proveedor del núcleo. El reintento por validación va en un segundo lote con lo que falló,
// como hace la cola de producción. Usa el puerto BatchApi del núcleo, así el SDK real, el lote simulado
// de fakeBatch.ts o el fakeAnthropic del paquete A sirven igual. Cuando A deje jobs.ts con su ciclo y
// su JobStore en memoria, este camino puede pasar por ahí sin cambiar lo que mide.
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages';
import type { AiEngine } from '../../src/engines/aiContracts.ts';
import { mockOutput, MOCK_MODEL } from '../../src/engines/aiMock.ts';
import { approximateTokens } from '../../supabase/functions/_shared/ai/cost.ts';
import type { BatchApi } from '../../supabase/functions/_shared/ai/ports.ts';
import {
  createAnthropicProvider,
  type MessagesApi,
} from '../../supabase/functions/_shared/ai/provider.ts';
import { VALIDATION_RETRIES, type RunDeps } from '../../supabase/functions/_shared/ai/run.ts';
import { BATCH_DISCOUNT, newProbe, recordMessage, worstCaseUsd, type Budget } from './budget.ts';
import type { GoldenCase } from './cases.ts';
import type { BatchResult } from './fakeBatch.ts';
import { evaluateCase, type CaseResult } from './run.ts';

/** El caso todavía necesita una respuesta del modelo. No es una falla */
class AwaitingBatch extends Error {
  constructor() {
    super('Esperando el lote');
    this.name = 'AwaitingBatch';
  }
}

/** Lo que el lote contestó a un intento de un caso */
type Reply = { message: Message } | { failure: Exclude<BatchResult['type'], 'succeeded'> };

export interface BatchRound {
  batchId: string;
  requests: number;
  /** Del alta del lote a processing_status ended */
  waitedMs: number;
  canceled: boolean;
  deleted: boolean;
}

export interface BatchEvalResult {
  results: CaseResult[];
  rounds: BatchRound[];
  /** Fallas del lote por tipo, como errored o expired */
  failures: Partial<Record<string, number>>;
  costUsd: number;
  stoppedByBudget: boolean;
}

export interface BatchEvalOptions {
  deps: RunDeps;
  cases: readonly GoldenCase[];
  api: BatchApi;
  budget: Budget;
  /** Cada cuánto se revisa el lote. 60 s por omisión */
  pollMs?: number;
  /** Cuánto se espera antes de cancelar. Una hora por omisión */
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  onProgress?: (line: string) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Reproduce un caso con lo que ya contestó el lote. Si le falta una respuesta, devuelve la petición
 * que haría el camino al momento, que es la que va en el siguiente lote
 */
async function replay(
  deps: RunDeps,
  golden: GoldenCase,
  replies: readonly Reply[],
): Promise<{ result: CaseResult } | { params: MessageCreateParamsNonStreaming }> {
  const probe = newProbe();
  let next = 0;
  const captured: { params: MessageCreateParamsNonStreaming | null } = { params: null };
  const api: MessagesApi = {
    create(params) {
      const reply = replies[next];
      next += 1;
      if (!reply) {
        captured.params = params;
        return Promise.reject(new AwaitingBatch());
      }
      if ('failure' in reply) {
        probe.calls.push({
          stopReason: reply.failure,
          refusalCategory: null,
          usage: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
          costUsd: 0,
        });
        return Promise.reject(new Error(`El lote dio ${reply.failure}`));
      }
      recordMessage(probe, reply.message, deps.config.prices[params.model], BATCH_DISCOUNT);
      return Promise.resolve(reply.message);
    },
  };
  const provider = createAnthropicProvider(api, () => deps.config.limits);
  const result = await evaluateCase({ ...deps, provider }, golden, { probe });
  return captured.params ? { params: captured.params } : { result };
}

/** Manda un lote y espera a que termine, o lo cancela si pasa del tiempo */
async function sendBatch(
  options: BatchEvalOptions,
  requests: { customId: string; params: MessageCreateParamsNonStreaming }[],
): Promise<{ round: BatchRound; replies: Map<string, Reply> }> {
  const sleep = options.sleep ?? defaultSleep;
  const clock = options.clock ?? (() => Date.now());
  const pollMs = options.pollMs ?? 60_000;
  const maxWaitMs = options.maxWaitMs ?? 3_600_000;
  const created = await options.api.create(
    requests.map((request) => ({ custom_id: request.customId, params: request.params })),
  );
  options.onProgress?.(`Lote ${created.id} con ${requests.length} peticiones`);
  const started = clock();
  let batch = created;
  let canceled = false;
  while (batch.processing_status !== 'ended') {
    if (!canceled && clock() - started > maxWaitMs) {
      batch = await options.api.cancel(created.id);
      canceled = true;
      continue;
    }
    await sleep(pollMs);
    batch = await options.api.retrieve(created.id);
  }
  const waitedMs = Math.max(0, clock() - started);
  const replies = new Map<string, Reply>();
  for await (const response of await options.api.results(created.id)) {
    replies.set(
      response.custom_id,
      response.result.type === 'succeeded'
        ? { message: response.result.message }
        : { failure: response.result.type },
    );
  }
  let deleted = true;
  await options.api.delete(created.id).catch(() => {
    deleted = false;
  });
  return {
    round: { batchId: created.id, requests: requests.length, waitedMs, canceled, deleted },
    replies,
  };
}

export async function runBatchEvaluation(options: BatchEvalOptions): Promise<BatchEvalResult> {
  const replies = new Map<string, Reply[]>(options.cases.map((golden) => [golden.id, []]));
  const done = new Map<string, CaseResult>();
  const waited = new Map<string, number>();
  const rounds: BatchRound[] = [];
  const failures: Partial<Record<string, number>> = {};
  const state = { stoppedByBudget: false };
  for (let round = 1; round <= VALIDATION_RETRIES + 1 && !state.stoppedByBudget; round += 1) {
    const pending: {
      golden: GoldenCase;
      customId: string;
      params: MessageCreateParamsNonStreaming;
    }[] = [];
    for (const [index, golden] of options.cases.entries()) {
      if (done.has(golden.id)) continue;
      const outcome = await replay(options.deps, golden, replies.get(golden.id) ?? []);
      if ('result' in outcome) done.set(golden.id, outcome.result);
      else pending.push({ golden, customId: `r${round}_c${index}`, params: outcome.params });
    }
    if (pending.length === 0) break;
    // Solo sale lo que cabe en el tope, con el peor costo al precio de lote
    let reserved = 0;
    const fits = pending.filter((entry) => {
      const price = options.deps.config.prices[entry.params.model];
      const chars =
        JSON.stringify(entry.params.system).length + JSON.stringify(entry.params.messages).length;
      const worst = price ? worstCaseUsd(price, chars, entry.params.max_tokens, true) : 0;
      if (state.stoppedByBudget || !options.budget.reserve(worst)) {
        state.stoppedByBudget = true;
        return false;
      }
      reserved += worst;
      return true;
    });
    if (fits.length === 0) break;
    let spent = 0;
    try {
      const sent = await sendBatch(options, fits);
      rounds.push(sent.round);
      for (const entry of fits) {
        const reply = sent.replies.get(entry.customId) ?? { failure: 'expired' as const };
        if ('failure' in reply) failures[reply.failure] = (failures[reply.failure] ?? 0) + 1;
        else spent += batchCost(options.deps, entry.params.model, reply.message);
        replies.get(entry.golden.id)?.push(reply);
        waited.set(entry.golden.id, (waited.get(entry.golden.id) ?? 0) + sent.round.waitedMs);
      }
    } finally {
      options.budget.settle(reserved, spent);
    }
  }
  // Lo que ya tiene todas sus respuestas se cierra. Lo que quedó sin lote por el tope no se cuenta
  for (const golden of options.cases) {
    if (done.has(golden.id)) continue;
    const outcome = await replay(options.deps, golden, replies.get(golden.id) ?? []);
    if ('result' in outcome) done.set(golden.id, outcome.result);
  }
  const results = options.cases.flatMap((golden) => {
    const result = done.get(golden.id);
    return result ? [{ ...result, latencyMs: waited.get(golden.id) ?? result.latencyMs }] : [];
  });
  return {
    results,
    rounds,
    failures,
    costUsd: Math.round(results.reduce((sum, result) => sum + result.costUsd, 0) * 1e6) / 1e6,
    stoppedByBudget: state.stoppedByBudget,
  };
}

/** Lo que costó un mensaje del lote, con el precio del modelo que se pidió y el descuento de lote */
function batchCost(deps: RunDeps, model: string, message: Message): number {
  const probe = newProbe();
  recordMessage(probe, message, deps.config.prices[model], BATCH_DISCOUNT);
  return probe.calls[0]?.costUsd ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Lote simulado con las respuestas fijas

/** Un mensaje de la API con el texto dado, para el lote simulado */
export function simulatedMessage(model: string, text: string, inputChars: number): Message {
  return {
    id: 'msg_simulado',
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: Math.ceil(inputChars / 4),
      output_tokens: approximateTokens(text),
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as unknown as Message;
}

/**
 * El contestador del lote simulado. Lee la entrada del caso de su mensaje y contesta con la respuesta
 * fija del motor, como el proveedor simulado del camino al momento
 */
export function simulatedReply(engine: AiEngine) {
  return (request: { params: MessageCreateParamsNonStreaming }): BatchResult => {
    const content = request.params.messages[0]?.content;
    const text = typeof content === 'string' ? content : '';
    const data = /<datos>\n([\s\S]*?)\n<\/datos>/.exec(text)?.[1] ?? 'null';
    const input = JSON.parse(data.replace(/\\u003c/g, '<')) as never;
    const answer = JSON.stringify(mockOutput(engine, input));
    return {
      type: 'succeeded',
      message: simulatedMessage(MOCK_MODEL, answer, JSON.stringify(request.params).length),
    };
  };
}
