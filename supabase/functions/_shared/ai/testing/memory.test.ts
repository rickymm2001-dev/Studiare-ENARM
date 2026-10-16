import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config.ts';
import { createMemoryAi, memoryConfigStore, memoryWhoAmI } from './memory.ts';

const USER = 'f0000000-0000-4000-8000-000000000001';

describe('dobles en memoria', () => {
  it('quién llama sale de los tokens, y uno desconocido es una sesión vencida', async () => {
    const whoami = memoryWhoAmI({
      'token-carla': { userId: USER, role: 'student', paid: true },
      'token-otro': 'other_device',
    });
    expect(await whoami('token-carla')).toEqual({
      ok: true,
      caller: { userId: USER, role: 'student', paid: true },
    });
    expect(await whoami('token-otro')).toEqual({ ok: false, failure: 'other_device' });
    expect(await whoami('token-nadie')).toEqual({ ok: false, failure: 'unauthenticated' });
    expect(whoami.calls).toEqual(['token-carla', 'token-otro', 'token-nadie']);
  });

  it('la configuración guarda copias y cuenta las lecturas', async () => {
    const store = memoryConfigStore();
    const loaded = await store.load();
    loaded.limits.dailyBudgetUsd = 99;
    expect((await store.load()).limits.dailyBudgetUsd).toBe(DEFAULT_CONFIG.limits.dailyBudgetUsd);
    await store.save({
      ...DEFAULT_CONFIG,
      limits: { ...DEFAULT_CONFIG.limits, dailyBudgetUsd: 7 },
    });
    expect(store.saved).toHaveLength(1);
    expect(store.loads).toBe(2);
    expect((await store.load()).limits.dailyBudgetUsd).toBe(7);
  });

  it('el libro y la cola quedan conectados, como ai_job_finish con ai_settle_v2', async () => {
    const memory = createMemoryAi();
    await memory.jobs.enqueue({
      userId: USER,
      engine: 'forgetting',
      jobKey: 'fgt_conectados-0001',
      input: {},
      inputHash: 'c'.repeat(64),
      promptVersion: 'forgetting.base.v1',
      model: 'claude-haiku-5-5',
      maxPending: 12,
    });
    const claim = await memory.jobs.claim(1);
    const id = claim.jobs[0]?.id ?? '';
    await memory.jobs.submitted(claim.claimId, 'msgbatch_c', { [id]: 0.01 });
    expect((await memory.ledger.summary()).inFlightUsd).toEqual({ forgetting: 0.01 });
    await memory.jobs.finish(id, { status: 'failed', error: 'provider_error', costUsd: 0 });
    expect(memory.ledger.log).toHaveLength(1);
    expect(await memory.ledger.summary()).toMatchObject({ pendingJobs: 0, inFlightUsd: {} });
  });
});
