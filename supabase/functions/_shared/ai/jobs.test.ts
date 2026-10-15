// El ciclo de lotes y la función ai-batch con Anthropic simulado y la cola en memoria (B12, 3.4 y 7.1)
import type { MessageBatchResult } from '@anthropic-ai/sdk/resources/messages';
import { describe, expect, it } from 'vitest';
import { hypothesisInput } from '../../../../src/ai/testing/aiSamples.ts';
import { DEFAULT_CONFIG, type AiConfig } from './config.ts';
import { estimateBatchCostUsd, worstBatchCostUsd } from './cost.ts';
import { ACADEMIC_SOURCE_KEYS } from './engines/academicSources.ts';
import { ENGINE_CONTRACTS } from './engines/aiContracts.ts';
import { mockHypothesis } from './engines/aiMock.ts';
import { buildAiBatch, structuredLog } from './edge.ts';
import { batchRequestFor, runBatchTick, type BatchTickDeps } from './jobs.ts';
import type { StoredJob } from './ports.ts';
import { buildUserMessage, bundledPromptSets } from './prompts.ts';
import { createAnthropicProvider } from './provider.ts';
import {
  anthropicClientsOf,
  createFakeAnthropic,
  erroredResult,
  fakeApi,
  fakeMessage,
  rateLimitError,
  refusalMessage,
  succeededResult,
} from './testing/fakeAnthropic.ts';
import { createFakeSupabaseRest } from './testing/fakeSupabaseRest.ts';
import { createMemoryAi } from './testing/memory.ts';

const prompts = bundledPromptSets();
const input = hypothesisInput();
const user = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const key = (n: number) => `fgt_${String(n).padStart(32, '0')}`;

function cycle(options: { config?: AiConfig; mode?: 'real' | 'mock' } = {}) {
  let now = Date.parse('2026-10-15T15:00:00Z');
  const memory = createMemoryAi({ clock: () => now });
  const anthropic = createFakeAnthropic({ prompts, now: () => now });
  let config = options.config ?? DEFAULT_CONFIG;
  const deps: BatchTickDeps = {
    jobs: memory.jobs,
    batches: anthropic.batches,
    ledger: memory.ledger,
    gate: memory.gate,
    config: () => config,
    prompts,
    sourceKeys: new Set<string>(ACADEMIC_SOURCE_KEYS),
    mode: options.mode ?? 'real',
    clock: () => now,
    log: () => undefined,
    deadlineMs: 100_000,
    pollMinutes: 0,
  };
  const enqueue = async (n: number, userN = n) =>
    memory.jobs.enqueue({
      userId: user(userN),
      engine: 'forgetting',
      jobKey: key(n),
      input,
      inputHash: String(n).padStart(64, '0'),
      promptVersion: prompts.forgetting.version,
      model: config.models.forgetting.id,
      maxPending: 12,
    });
  return {
    memory,
    anthropic,
    deps,
    enqueue,
    tick: () => runBatchTick(deps),
    rows: () => memory.jobs.rows,
    setConfig: (next: AiConfig) => {
      config = next;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const lastBatch = (c: ReturnType<typeof cycle>) => {
  const created = c.anthropic.batches.created.at(-1);
  if (!created) throw new Error('no se creó ningún lote');
  return created;
};

describe('mandar', () => {
  it('cada petición es igual a la del camino al momento y su custom_id es el id del trabajo', async () => {
    const c = cycle();
    await c.enqueue(1);
    const report = await c.tick();
    expect(report).toMatchObject({ took: true, sent: 1 });
    const [request] = lastBatch(c).requests;
    const job = c.rows()[0];
    expect(request?.custom_id).toBe(job?.id);

    const api = fakeApi([fakeMessage(JSON.stringify(mockHypothesis(input)))]);
    await createAnthropicProvider(api, () => DEFAULT_CONFIG.limits).call({
      engine: 'forgetting',
      model: DEFAULT_CONFIG.models.forgetting,
      system: prompts.forgetting.text,
      user: buildUserMessage(input),
      input,
      schema: ENGINE_CONTRACTS.forgetting.output,
    });
    // Iguales en todo lo que viaja a la API
    expect(JSON.stringify(request?.params)).toBe(JSON.stringify(api.calls[0]?.params));
    expect(c.rows()[0]).toMatchObject({ status: 'submitted', attempts: 1 });
    expect((await c.memory.ledger.summary()).inFlightUsd.forgetting).toBeGreaterThan(0);
  });

  it('manda solo lo que cabe en la cuota del motor y deja lo demás en cola sin contar intento', async () => {
    const job: StoredJob = {
      id: 'x',
      userId: user(1),
      engine: 'forgetting',
      jobKey: key(1),
      input,
      model: DEFAULT_CONFIG.models.forgetting.id,
      promptVersion: prompts.forgetting.version,
      attempts: 0,
      issues: [],
    };
    const price = DEFAULT_CONFIG.prices['claude-haiku-4-5'];
    if (!price) throw new Error('falta el precio');
    const worst = worstBatchCostUsd(
      price,
      `${prompts.forgetting.text}${buildUserMessage(job.input, [])}`,
      DEFAULT_CONFIG.models.forgetting.maxTokens,
    );
    // La cuota de hipótesis es 10% del presupuesto. Así cabe uno y medio
    const c = cycle({
      config: {
        ...DEFAULT_CONFIG,
        limits: { ...DEFAULT_CONFIG.limits, dailyBudgetUsd: (worst * 1.5) / 0.1 },
      },
    });
    for (const n of [1, 2, 3]) await c.enqueue(n);
    expect(await c.tick()).toMatchObject({ sent: 1 });
    expect(c.rows().map((row) => [row.status, row.attempts])).toEqual([
      ['submitted', 1],
      ['queued', 0],
      ['queued', 0],
    ]);
    // Lo que está en vuelo cuenta, así el siguiente ciclo no manda otro
    expect(await c.tick()).toMatchObject({ sent: 0 });
    expect(c.anthropic.batches.created).toHaveLength(1);
  });

  it('con la pausa no manda lotes nuevos pero recoge los que ya iban', async () => {
    const c = cycle();
    await c.enqueue(1);
    await c.tick();
    await c.enqueue(2);
    c.anthropic.batches.end(lastBatch(c).id);
    c.memory.gate.pause(true);
    expect(await c.tick()).toMatchObject({ sent: 0, ready: 1 });
    expect(c.rows()[1]?.status).toBe('queued');
  });

  it('si crear el lote falla, todo vuelve a la cola sin contar intento', async () => {
    const c = cycle();
    await c.enqueue(1);
    c.anthropic.batches.failNextCreate(rateLimitError());
    expect(await c.tick()).toMatchObject({ sent: 0 });
    expect(c.rows()[0]).toMatchObject({ status: 'queued', attempts: 0, claimId: null });
    expect(await c.tick()).toMatchObject({ sent: 1 });
  });
});

describe('recoger', () => {
  const invalid = fakeMessage(JSON.stringify({ hypothesis: 'x', confidence: 'alta' }));
  const cut = fakeMessage('{"hypo', { stop: 'max_tokens' });

  it('cada tipo de resultado tiene su reintento o su falla, y el lote se borra', async () => {
    const c = cycle();
    for (let n = 1; n <= 8; n += 1) await c.enqueue(n);
    await c.tick();
    const batch = lastBatch(c);
    const id = (n: number) => c.rows()[n - 1]?.id ?? '';
    const overrides: Record<string, MessageBatchResult> = {
      [id(2)]: succeededResult(invalid),
      [id(3)]: succeededResult(cut),
      [id(4)]: succeededResult(refusalMessage('bio')),
      [id(5)]: erroredResult('invalid_request_error'),
      [id(6)]: erroredResult('overloaded_error'),
      [id(7)]: { type: 'expired' },
      [id(8)]: { type: 'canceled' },
    };
    c.anthropic.batches.end(batch.id, overrides);
    const report = await c.tick();
    // Lo que volvió a la cola sale en un lote nuevo en el mismo ciclo
    expect(report).toMatchObject({
      ready: 1,
      failed: 2,
      requeued: 5,
      processedBatches: 1,
      sent: 5,
    });
    expect(c.rows().map((row) => [row.status, row.error, row.attempts])).toEqual([
      ['ready', null, 1],
      ['submitted', null, 2],
      ['submitted', null, 2],
      ['failed', 'refused', 1],
      ['failed', 'provider_error', 1],
      ['submitted', null, 2],
      ['submitted', null, 2],
      ['submitted', null, 2],
    ]);
    expect(lastBatch(c).requests.map((request) => request.custom_id)).toEqual(
      [2, 3, 6, 7, 8].map(id),
    );
    // Lo que falló va como issues al siguiente intento
    expect(c.rows()[1]?.issues.join(' ')).toContain('confidence');
    expect(c.rows()[2]?.issues).toEqual(['La respuesta se cortó por tamaño']);
    expect(c.anthropic.batches.deleted).toEqual([batch.id]);
    expect(c.memory.jobs.batches.get(batch.id)?.status).toBe('processed');
    // Las salidas buenas no guardan la entrada
    expect(c.rows()[0]).toMatchObject({ input: null });
    // Lo que no sirvió también se cobró y quedó en la bitácora con mode batch
    expect(
      c.memory.ledger.log.map((entry) => [entry.outcome, entry.mode, entry.jobId === null]),
    ).toEqual([
      ['ok', 'batch', false],
      ['invalid_output', 'batch', false],
      ['invalid_output', 'batch', false],
      ['refused', 'batch', false],
      ['provider_error', 'batch', false],
    ]);
  });

  it('el costo es el 50% del de la llamada al momento', async () => {
    const c = cycle();
    await c.enqueue(1);
    await c.tick();
    c.anthropic.batches.end(lastBatch(c).id);
    await c.tick();
    const ready = c.rows()[0];
    const usage = {
      inputTokens: ready?.meta?.inputTokens ?? 0,
      outputTokens: ready?.meta?.outputTokens ?? 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const price = DEFAULT_CONFIG.prices['claude-haiku-4-5'];
    if (!price) throw new Error('falta el precio');
    const expected = estimateBatchCostUsd(price, usage);
    expect(expected).toBeGreaterThan(0);
    expect(ready?.meta).toMatchObject({
      mode: 'real',
      model: 'claude-haiku-4-5',
      estimatedCostUsd: expected,
      outcome: 'ok',
    });
    expect(c.memory.ledger.log[0]).toMatchObject({ mode: 'batch', costUsd: expected, real: true });
    expect((await c.memory.ledger.summary()).spentUsd).toBe(expected);
  });

  it('con el lote simulado no gasta y la salida dice simulado', async () => {
    const c = cycle({ mode: 'mock' });
    await c.enqueue(1);
    await c.tick();
    c.anthropic.batches.end(lastBatch(c).id);
    await c.tick();
    expect(c.rows()[0]?.meta).toMatchObject({
      mode: 'mock',
      model: 'respuestas-fijas-v1',
      estimatedCostUsd: 0,
    });
    expect((await c.memory.ledger.summary()).spentUsd).toBe(0);
  });

  it('un reintento que sale bien queda como retried_ok y dos inválidos dejan el trabajo fallido', async () => {
    const c = cycle();
    await c.enqueue(1);
    await c.enqueue(2);
    await c.tick();
    const first = lastBatch(c);
    const [one, two] = c.rows();
    c.anthropic.batches.end(first.id, {
      [one?.id ?? '']: succeededResult(invalid),
      [two?.id ?? '']: succeededResult(invalid),
    });
    await c.tick();
    // El segundo lote lleva lo que falló en el mensaje
    const second = lastBatch(c);
    expect(second.id).not.toBe(first.id);
    expect(JSON.stringify(second.requests[0]?.params.messages)).toContain('Tu respuesta anterior');
    c.anthropic.batches.end(second.id, { [two?.id ?? '']: succeededResult(invalid) });
    await c.tick();
    expect(c.rows().map((row) => [row.status, row.meta?.outcome ?? row.error])).toEqual([
      ['ready', 'retried_ok'],
      ['failed', 'invalid_output'],
    ]);
  });

  it('hasta 150 resultados por ciclo y el siguiente sigue sin repetir', async () => {
    const c = cycle({
      config: { ...DEFAULT_CONFIG, limits: { ...DEFAULT_CONFIG.limits, dailyBudgetUsd: 1000 } },
    });
    for (let n = 1; n <= 160; n += 1) await c.enqueue(n);
    expect(await c.tick()).toMatchObject({ sent: 160 });
    c.anthropic.batches.end(lastBatch(c).id);
    expect(await c.tick()).toMatchObject({ ready: 150, processedBatches: 0 });
    expect(c.anthropic.batches.deleted).toEqual([]);
    expect(await c.tick()).toMatchObject({ ready: 10, processedBatches: 1 });
    expect(c.memory.ledger.log).toHaveLength(160);
    expect(new Set(c.memory.ledger.log.map((entry) => entry.jobId)).size).toBe(160);
  });

  it('un lote que se creó y no se registró se reconoce por custom_id', async () => {
    const c = cycle();
    await c.enqueue(1);
    // El ciclo se cortó entre crear el lote y registrarlo
    const claim = await c.memory.jobs.claim(10);
    const config = c.deps.config();
    const orphan = await c.anthropic.batches.create(
      claim.jobs.map((job) => batchRequestFor(job, config, prompts)),
    );
    c.anthropic.batches.end(orphan.id);
    expect(await c.tick()).toMatchObject({ ready: 0 });
    c.advance(16 * 60_000);
    const report = await c.tick();
    expect(report).toMatchObject({ ready: 1, sent: 0 });
    expect(c.rows()[0]).toMatchObject({ status: 'ready', batchId: orphan.id });
    expect(c.anthropic.batches.created).toHaveLength(1);
    expect(c.anthropic.batches.deleted).toEqual([orphan.id]);
  });

  it('limpia las salidas viejas al final del ciclo', async () => {
    const c = cycle();
    await c.enqueue(1);
    await c.tick();
    c.anthropic.batches.end(lastBatch(c).id);
    await c.tick();
    c.advance(15 * 86_400_000);
    expect(await c.tick()).toMatchObject({ scrubbed: 1 });
    expect(c.rows()[0]?.output).toBeNull();
  });

  it('un ciclo que no toma el candado no hace nada', async () => {
    const c = cycle();
    await c.enqueue(1);
    expect(await c.memory.jobs.lease('otro-ciclo', 120)).toBe(true);
    expect(await c.tick()).toMatchObject({ took: false, sent: 0 });
    expect(c.anthropic.batches.created).toHaveLength(0);
  });
});

describe('función ai-batch', () => {
  function batchFunction() {
    const memory = createMemoryAi();
    const rest = createFakeSupabaseRest({ memory, tickSecret: 'secreto-del-ciclo' });
    const anthropic = createFakeAnthropic({ prompts });
    const work: Promise<unknown>[] = [];
    const logs: string[] = [];
    const handler = buildAiBatch(
      {
        supabaseUrl: rest.url,
        anonKey: rest.anonKey,
        serviceKey: rest.serviceKey,
        anthropicKey: 'clave-de-prueba',
        allowMock: false,
        tickDeadlineMs: 100_000,
      },
      {
        fetch: rest.fetch,
        anthropic: () => anthropicClientsOf(anthropic),
        clock: () => Date.now(),
        log: structuredLog((line) => logs.push(line)),
        waitUntil: (promise) => work.push(promise),
      },
    );
    return { memory, rest, anthropic, handler, work, logs };
  }
  const tickRequest = (headers: Record<string, string>) =>
    new Request('https://simulado.supabase.co/functions/v1/ai-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: '{}',
    });
  const queueOne = (memory: ReturnType<typeof createMemoryAi>) =>
    memory.jobs.enqueue({
      userId: user(1),
      engine: 'forgetting',
      jobKey: key(1),
      input,
      inputHash: 'a'.repeat(64),
      promptVersion: prompts.forgetting.version,
      model: DEFAULT_CONFIG.models.forgetting.id,
      maxPending: 12,
    });

  it('sin encabezado o con uno equivocado contesta 401 y no toca nada', async () => {
    const f = batchFunction();
    await queueOne(f.memory);
    expect((await f.handler(tickRequest({}))).status).toBe(401);
    expect((await f.handler(tickRequest({ 'x-ai-tick': 'otro' }))).status).toBe(401);
    expect(f.work).toHaveLength(0);
    expect(f.memory.jobs.rows[0]?.status).toBe('queued');
    expect(f.rest.calls.map((call) => call.path)).toEqual(['/rest/v1/rpc/ai_tick_secret_ok']);
  });

  it('con Origin contesta 403 aunque traiga el secreto, y solo acepta POST', async () => {
    const f = batchFunction();
    const browser = await f.handler(
      tickRequest({
        'x-ai-tick': 'secreto-del-ciclo',
        origin: 'https://rickymm2001-dev.github.io',
      }),
    );
    expect(browser.status).toBe(403);
    const get = await f.handler(
      new Request('https://simulado.supabase.co/functions/v1/ai-batch', {
        headers: { 'x-ai-tick': 'secreto-del-ciclo' },
      }),
    );
    expect(get.status).toBe(405);
    expect(f.rest.calls).toHaveLength(0);
  });

  it('con el secreto contesta 202 y trabaja en segundo plano', async () => {
    const f = batchFunction();
    await queueOne(f.memory);
    const response = await f.handler(tickRequest({ 'x-ai-tick': 'secreto-del-ciclo' }));
    expect(response.status).toBe(202);
    expect(f.work).toHaveLength(1);
    await Promise.all(f.work);
    expect(f.anthropic.batches.created).toHaveLength(1);
    expect(f.memory.jobs.rows[0]?.status).toBe('submitted');
    expect(f.logs.some((line) => line.includes('"ai.batch.tick"'))).toBe(true);
  });

  it('dos ciclos a la vez, uno solo trabaja', async () => {
    const f = batchFunction();
    await queueOne(f.memory);
    await f.handler(tickRequest({ 'x-ai-tick': 'secreto-del-ciclo' }));
    await f.handler(tickRequest({ 'x-ai-tick': 'secreto-del-ciclo' }));
    const reports = (await Promise.all(f.work)) as { took: boolean }[];
    expect(reports.map((report) => report.took).sort()).toEqual([false, true]);
    expect(f.anthropic.batches.created).toHaveLength(1);
  });

  it('si no se puede revisar el secreto contesta 503 sin trabajar', async () => {
    const f = batchFunction();
    f.rest.down = true;
    expect((await f.handler(tickRequest({ 'x-ai-tick': 'secreto-del-ciclo' }))).status).toBe(503);
    expect(f.work).toHaveLength(0);
  });
});
