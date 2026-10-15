import { describe, expect, it } from 'vitest';
import type { AiCallMeta } from './engines/aiContracts.ts';
import { createRestJobStore, jobStatusOf, REQUEUE_CAPS, type JobStatusRow } from './jobStore.ts';
import type { EnqueueInput, JobStore } from './ports.ts';
import { createRestRpc } from './rest.ts';
import { createFakeSupabaseRest } from './testing/fakeSupabaseRest.ts';
import { createMemoryAi, type MemoryAi } from './testing/memory.ts';

const USER = 'f0000000-0000-4000-8000-000000000001';
const OTHER = 'f0000000-0000-4000-8000-000000000002';
const DAY = 86_400_000;

const enqueue = (overrides: Partial<EnqueueInput> = {}): EnqueueInput => ({
  userId: USER,
  engine: 'forgetting',
  jobKey: 'fgt_0123456789abcdef0123456789abcdef',
  input: { rule: 'r' },
  inputHash: 'a'.repeat(64),
  promptVersion: 'forgetting.base.v1',
  model: 'claude-haiku-5-5',
  maxPending: 12,
  ...overrides,
});

const meta: AiCallMeta = {
  engine: 'forgetting',
  mode: 'real',
  model: 'claude-haiku-5-5',
  promptVersion: 'forgetting.base.v1',
  inputTokens: 1700,
  outputTokens: 400,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  estimatedCostUsd: 0.000185,
  latencyMs: 0,
  outcome: 'ok',
  validator: { passed: true, issues: [] },
};

interface Harness {
  store: JobStore;
  memory: MemoryAi;
  advance: (ms: number) => void;
}

function harness(kind: 'memoria' | 'rest'): Harness {
  let now = Date.parse('2026-10-15T15:00:00Z');
  let id = 0;
  const memory = createMemoryAi({
    clock: () => now,
    ids: () => `00000000-0000-4000-8000-${String((id += 1)).padStart(12, '0')}`,
  });
  const advance = (ms: number) => {
    now += ms;
  };
  if (kind === 'memoria') return { store: memory.jobs, memory, advance };
  const rest = createFakeSupabaseRest({ memory });
  const store = createRestJobStore(
    createRestRpc({ url: rest.url, serviceKey: rest.serviceKey, fetchImpl: rest.fetch }),
  );
  return { store, memory, advance };
}

describe.each(['memoria', 'rest'] as const)('cola de trabajos (%s)', (kind) => {
  it('encolar es idempotente por llave y respeta el tope de pendientes', async () => {
    const { store } = harness(kind);
    const first = await store.enqueue(enqueue());
    expect(first).toMatchObject({ outcome: 'queued', job: { status: 'queued', readyAt: null } });
    expect(await store.enqueue(enqueue())).toMatchObject({ outcome: 'existing' });
    expect(
      await store.enqueue(enqueue({ jobKey: 'fgt_otra-llave-0001', maxPending: 2 })),
    ).toMatchObject({ outcome: 'queued' });
    expect(await store.enqueue(enqueue({ jobKey: 'fgt_otra-llave-0002', maxPending: 2 }))).toEqual({
      outcome: 'too_many_pending',
    });
    // Otro alumno tiene su propio tope
    expect(await store.enqueue(enqueue({ userId: OTHER, maxPending: 2 }))).toMatchObject({
      outcome: 'queued',
    });
  });

  it('reclamar, mandar, terminar y entregar, con el costo asentado como lote', async () => {
    const { store, memory } = harness(kind);
    await store.enqueue(enqueue());
    const claim = await store.claim(500);
    expect(claim.jobs).toHaveLength(1);
    const job = claim.jobs[0];
    if (!job) throw new Error('sin trabajo');
    expect(job).toMatchObject({ userId: USER, attempts: 0, issues: [], input: { rule: 'r' } });
    expect((await store.status(USER, [job.jobKey]))[0]?.status).toBe('running');

    await store.submitted(claim.claimId, 'msgbatch_1', { [job.id]: 0.002 });
    expect(await memory.ledger.summary()).toMatchObject({
      pendingJobs: 1,
      inFlightUsd: { forgetting: 0.002 },
    });
    expect(await store.due(10)).toHaveLength(0);
    expect((await store.due(0)).map((batch) => batch.id)).toEqual(['msgbatch_1']);
    expect(await store.pending('msgbatch_1', [job.id, 'otro'])).toHaveLength(1);

    await store.finish(job.id, {
      status: 'ready',
      output: { hypothesis: null },
      meta,
      costUsd: 0.0001,
    });
    expect(await store.pending('msgbatch_1', [job.id])).toHaveLength(0);
    const [ready] = await store.status(USER, [job.jobKey]);
    expect(ready).toMatchObject({ status: 'ready', output: { hypothesis: null }, meta });
    expect(memory.jobs.rows[0]).toMatchObject({ input: null, costUsd: 0.0001 });
    expect(memory.jobs.rows[0]?.deliveredAt).not.toBeNull();
    expect(memory.ledger.log.at(-1)).toMatchObject({
      mode: 'batch',
      jobId: job.id,
      costUsd: 0.0001,
      outcome: 'ok',
      ok: true,
    });
    // Terminar dos veces no asienta dos veces
    await store.finish(job.id, { status: 'ready', output: {}, meta, costUsd: 1 });
    expect(memory.ledger.log).toHaveLength(1);
  });

  it('lo que no cupo en el presupuesto vuelve a la cola sin contar intento', async () => {
    const { store, memory } = harness(kind);
    await store.enqueue(enqueue());
    await store.enqueue(enqueue({ jobKey: 'fgt_segunda-llave-01' }));
    const claim = await store.claim(10);
    const [first, second] = claim.jobs;
    if (!first || !second) throw new Error('faltan trabajos');
    await store.submitted(claim.claimId, 'msgbatch_2', { [first.id]: 0.001 });
    expect(memory.jobs.rows.map((row) => [row.status, row.attempts])).toEqual([
      ['submitted', 1],
      ['queued', 0],
    ]);
    // Si crear el lote falla, el reclamo entero vuelve sin contar intento
    const again = await store.claim(10);
    await store.unclaim(again.claimId);
    expect(memory.jobs.rows[1]).toMatchObject({ status: 'queued', attempts: 0, claimId: null });
  });

  it('reencolar respeta el tope de cada falla y un lote procesado devuelve lo que faltó', async () => {
    const { store, memory } = harness(kind);
    await store.enqueue(enqueue());
    const send = async (batchId: string) => {
      const claim = await store.claim(10);
      const estimates = Object.fromEntries(claim.jobs.map((job) => [job.id, 0.001]));
      await store.submitted(claim.claimId, batchId, estimates);
      return claim.jobs[0]?.id ?? '';
    };
    const id = await send('msgbatch_a');
    expect(await store.requeue(id, ['La respuesta no cumplió el esquema'], 'invalid_output')).toBe(
      'requeued',
    );
    expect(memory.jobs.rows[0]).toMatchObject({
      status: 'queued',
      issues: ['La respuesta no cumplió el esquema'],
      batchId: null,
    });
    await send('msgbatch_b');
    expect(REQUEUE_CAPS.invalid_output).toBe(2);
    expect(await store.requeue(id, ['otra vez'], 'invalid_output')).toBe('failed');
    expect((await store.status(USER, [enqueue().jobKey]))[0]).toMatchObject({
      status: 'failed',
      error: 'invalid_output',
    });

    await store.enqueue(enqueue({ jobKey: 'fgt_tercera-llave-1' }));
    const lost = await send('msgbatch_c');
    await store.mark('msgbatch_c', 'processed');
    expect(memory.jobs.rows.find((row) => row.id === lost)).toMatchObject({
      status: 'queued',
      batchId: null,
    });
    expect(memory.jobs.batches.get('msgbatch_c')?.status).toBe('processed');
  });

  it('una falla asienta sus tokens y la de un lote simulado no gasta', async () => {
    const { store, memory } = harness(kind);
    await store.enqueue(enqueue());
    await store.enqueue(enqueue({ jobKey: 'fgt_simulado-llave1' }));
    const claim = await store.claim(10);
    await store.submitted(
      claim.claimId,
      'msgbatch_r',
      Object.fromEntries(claim.jobs.map((job) => [job.id, 0.001])),
    );
    const [refused, simulated] = claim.jobs;
    if (!refused || !simulated) throw new Error('faltan trabajos');
    await store.finish(refused.id, {
      status: 'failed',
      error: 'refused',
      costUsd: 0.0002,
      refusalCategory: 'bio',
      usage: {
        model: 'claude-haiku-5-5',
        real: true,
        inputTokens: 1500,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
    await store.finish(simulated.id, { status: 'failed', error: 'provider_error', costUsd: 0 });
    expect(
      memory.ledger.log.map((entry) => [
        entry.outcome,
        entry.refusalCategory,
        entry.costUsd,
        entry.model,
      ]),
    ).toEqual([
      ['refused', 'bio', 0.0002, 'claude-haiku-5-5'],
      ['provider_error', null, 0, 'claude-haiku-5-5'],
    ]);
  });

  it('reusa lo listo con la misma entrada, también con otra llave, y limpia lo viejo', async () => {
    const { store, memory, advance } = harness(kind);
    await store.enqueue(enqueue());
    const claim = await store.claim(10);
    const job = claim.jobs[0];
    if (!job) throw new Error('sin trabajo');
    await store.submitted(claim.claimId, 'msgbatch_x', { [job.id]: 0.001 });
    await store.finish(job.id, {
      status: 'ready',
      output: { hypothesis: 'h' },
      meta,
      costUsd: 0.0001,
    });

    expect(await store.enqueue(enqueue())).toMatchObject({
      outcome: 'reused',
      job: { status: 'ready', output: { hypothesis: 'h' } },
    });
    const other = await store.enqueue(enqueue({ jobKey: 'fgt_otro-dispositivo' }));
    expect(other).toMatchObject({
      outcome: 'reused',
      job: { jobKey: 'fgt_otro-dispositivo', status: 'ready' },
    });
    // Con otra entrada se crea uno nuevo
    expect(await store.enqueue(enqueue({ inputHash: 'b'.repeat(64) }))).toMatchObject({
      outcome: 'queued',
    });

    await store.status(USER, [enqueue().jobKey]);
    advance(15 * DAY);
    expect(await store.scrub()).toBeGreaterThan(0);
    expect(memory.jobs.rows[0]).toMatchObject({ input: null, output: null });
    // La llave apunta ahora al trabajo nuevo, en cola
    expect((await store.status(USER, [enqueue().jobKey]))[0]?.status).toBe('queued');
    // Pasados 7 días ya no se reusa
    expect(await store.enqueue(enqueue({ jobKey: 'fgt_tarde-llave-001' }))).toMatchObject({
      outcome: 'queued',
    });
  });

  it('un solo ciclo a la vez y los reclamos varados se encuentran', async () => {
    const { store, advance } = harness(kind);
    expect(await store.lease('ciclo-a', 120)).toBe(true);
    expect(await store.lease('ciclo-b', 120)).toBe(false);
    expect(await store.lease('ciclo-a', 0)).toBe(true);
    expect(await store.lease('ciclo-b', 120)).toBe(true);
    advance(121_000);
    expect(await store.lease('ciclo-c', 120)).toBe(true);

    await store.enqueue(enqueue());
    const claim = await store.claim(10);
    expect(await store.stale(15)).toEqual([]);
    advance(16 * 60_000);
    expect(await store.stale(15)).toEqual([
      expect.objectContaining({ claimId: claim.claimId, jobIds: claim.jobs.map((job) => job.id) }),
    ]);
  });
});

describe('cómo ve la app un trabajo', () => {
  const row = (overrides: Partial<JobStatusRow>): JobStatusRow => ({
    jobKey: 'fgt_llave-de-prueba',
    engine: 'forgetting',
    status: 'queued',
    output: null,
    meta: null,
    error: null,
    queuedAt: '2026-10-15T15:00:00.000Z',
    readyAt: null,
    ...overrides,
  });

  it('en cola, en curso, listo y fallido, con su mensaje', () => {
    expect(jobStatusOf(row({})).status).toBe('queued');
    expect(jobStatusOf(row({ status: 'submitting' })).status).toBe('running');
    expect(jobStatusOf(row({ status: 'submitted' })).status).toBe('running');
    expect(jobStatusOf(row({ status: 'ready', output: { a: 1 }, readyAt: 'x' }))).toMatchObject({
      status: 'ready',
      output: { a: 1 },
      readyAt: 'x',
    });
    expect(jobStatusOf(row({ status: 'failed', error: 'refused' }))).toMatchObject({
      status: 'failed',
      error: 'refused',
      message: expect.stringContaining('no atendió') as unknown,
    });
  });

  it('uno listo cuya salida ya se limpió cuenta como fallido', () => {
    expect(jobStatusOf(row({ status: 'ready', output: null }))).toMatchObject({
      status: 'failed',
      message: expect.stringContaining('ya no está disponible') as unknown,
    });
  });
});
