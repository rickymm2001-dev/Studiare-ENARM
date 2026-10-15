import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from './config.ts';
import { PgLedger } from './pgLedger.ts';
import type { AdmitV2Input } from './ports.ts';
import { createRestRpc } from './rest.ts';
import { createFakeSupabaseRest } from './testing/fakeSupabaseRest.ts';
import { createMemoryAi } from './testing/memory.ts';

const USER = 'f0000000-0000-4000-8000-000000000001';
const admit = (overrides: Partial<AdmitV2Input> = {}): AdmitV2Input => ({
  userId: USER,
  engine: 'flashcards',
  staff: false,
  perStudentPerDay: 240,
  dailyBudgetUsd: 5,
  engineShare: 0.55,
  perUserDailyUsd: 0.3,
  generationRef: 'generacion-0001',
  maxGenerations: DEFAULT_CONFIG.limits.cardGenerationsPerDay,
  maxSections: DEFAULT_CONFIG.limits.sectionsPerGeneration,
  ...overrides,
});

describe('libro del día en Postgres', () => {
  it('manda cada campo con su nombre a las funciones v2', async () => {
    const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<unknown>>();
    const ledger = new PgLedger(rpc);
    rpc.mockResolvedValueOnce('generation_limit');
    expect(await ledger.admit(admit())).toEqual({ ok: false, reason: 'generation_limit' });
    expect(rpc).toHaveBeenLastCalledWith('ai_admit_v2', {
      p_user: USER,
      p_engine: 'flashcards',
      p_staff: false,
      p_per_student: 240,
      p_budget: 5,
      p_engine_share: 0.55,
      p_user_budget: 0.3,
      p_generation: 'generacion-0001',
      p_max_generations: 20,
      p_max_sections: 12,
    });
    rpc.mockResolvedValueOnce(null);
    await ledger.settle({
      userId: USER,
      engine: 'forgetting',
      model: 'claude-haiku-5-5',
      real: true,
      ok: false,
      costUsd: 0.0002,
      inputTokens: 1700,
      outputTokens: 10,
      cacheReadTokens: 5,
      cacheWriteTokens: 6,
      latencyMs: 812.6,
      mode: 'batch',
      outcome: 'refused',
      promptVersion: 'forgetting.base.v1',
      refusalCategory: 'bio',
      jobId: 'f0000000-0000-4000-8000-0000000000aa',
    });
    expect(rpc).toHaveBeenLastCalledWith('ai_settle_v2', {
      p_user: USER,
      p_engine: 'forgetting',
      p_model: 'claude-haiku-5-5',
      p_real: true,
      p_ok: false,
      p_cost: 0.0002,
      p_input: 1700,
      p_output: 10,
      p_cache_read: 5,
      p_cache_write: 6,
      p_latency: 813,
      p_mode: 'batch',
      p_outcome: 'refused',
      p_prompt_version: 'forgetting.base.v1',
      p_refusal: 'bio',
      p_job: 'f0000000-0000-4000-8000-0000000000aa',
    });
  });

  it('va y vuelve por la API REST con las mismas reglas que la memoria', async () => {
    const memory = createMemoryAi();
    const rest = createFakeSupabaseRest({ memory });
    const ledger = new PgLedger(
      createRestRpc({ url: rest.url, serviceKey: rest.serviceKey, fetchImpl: rest.fetch }),
    );
    expect(await ledger.admit(admit())).toEqual({ ok: true });
    await ledger.release({ userId: USER, engine: 'flashcards', generationRef: 'generacion-0001' });
    expect(await ledger.summary()).toMatchObject({ calls: 0, pendingJobs: 0, inFlightUsd: {} });
  });

  it('rechaza un alumno que no es un id de cuenta y una respuesta que no entiende', async () => {
    const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<unknown>>();
    const ledger = new PgLedger(rpc);
    await expect(ledger.admit(admit({ userId: '01HZX0000000000000000000AA' }))).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce('quién sabe');
    await expect(ledger.admit(admit())).rejects.toThrow();
  });
});
