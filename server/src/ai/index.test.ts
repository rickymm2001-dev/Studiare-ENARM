// El proxy de desarrollo arma el núcleo con archivos locales (B12, 1.5 del plan)
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hypothesisInput } from '../../../src/ai/testing/aiSamples.ts';
import { bundledPromptSets } from '../../../supabase/functions/_shared/ai/prompts.ts';
import { requestBody } from '../../../supabase/functions/_shared/ai/testing/fakes.ts';
import { createApp } from '../app.ts';
import { createAiDeps, DEV_CALLER, startDevBatchLoop } from './index.ts';

const HEADERS = {
  host: '127.0.0.1:8787',
  origin: 'http://127.0.0.1:5173',
  'content-type': 'application/json',
};
const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-deps-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('dependencias del proxy de desarrollo', () => {
  it('sin clave usa el simulado y los prompts de sus archivos', () => {
    const ai = createAiDeps({
      credentials: { mode: 'mock', apiKey: null },
      files: { config: null, ledger: null },
    });
    expect(ai.provider.mode).toBe('mock');
    expect(ai.prompts).toEqual(bundledPromptSets());
    expect(ai.saveConfig).toBeUndefined();
    expect(ai.sourceKeys.has('harrison')).toBe(true);
  });

  it('PUT /ai/config cambia los límites al instante y los guarda en el archivo', async () => {
    const dir = tempDir();
    const file = join(dir, 'ai-config.local.json');
    const ai = createAiDeps({
      credentials: { mode: 'mock', apiKey: null },
      files: { config: file, ledger: null },
    });
    const app = createApp({ mode: 'mock', ai });
    const put = await app.request('/ai/config', {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({ limits: { perStudentPerDay: { forgetting: 1 } } }),
    });
    expect(put.status).toBe(200);
    expect(ai.config().limits.perStudentPerDay.forgetting).toBe(1);
    expect(ai.config().limits.perStudentPerDay.flashcards).toBe(240);
    const saved = JSON.parse(readFileSync(file, 'utf8')) as {
      limits: { perStudentPerDay: Record<string, number> };
    };
    expect(saved.limits.perStudentPerDay.forgetting).toBe(1);
    const send = () =>
      app.request('/ai/forgetting', {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(requestBody(hypothesisInput())),
      });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
    // Al arrancar otra vez lee lo guardado
    const again = createAiDeps({
      credentials: { mode: 'mock', apiKey: null },
      files: { config: file, ledger: null },
    });
    expect(again.config().limits.perStudentPerDay.forgetting).toBe(1);
  });

  it('el libro del día queda en su archivo', async () => {
    const ledger = join(tempDir(), 'ledger.json');
    const ai = createAiDeps({
      credentials: { mode: 'mock', apiKey: null },
      files: { config: null, ledger },
    });
    await ai.ledger.admit({
      userId: DEV_CALLER.userId,
      engine: 'forgetting',
      staff: true,
      perStudentPerDay: 2,
      dailyBudgetUsd: 1,
      engineShare: 1,
      perUserDailyUsd: 1,
      generationRef: null,
      maxGenerations: 20,
      maxSections: 12,
    });
    expect(existsSync(ledger)).toBe(true);
  });
});

describe('lotes en el proxy de desarrollo (B12, 3.4)', () => {
  it('una hipótesis encolada sale lista con IA simulada después de dos ciclos', async () => {
    const ai = createAiDeps({
      credentials: { mode: 'mock', apiKey: null },
      files: { config: null, ledger: null },
    });
    const app = createApp({ mode: 'mock', ai });
    const jobKey = 'fgt_0123456789abcdef0123456789abcdef';
    const enqueue = await app.request('/ai/jobs/forgetting', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ ...requestBody(hypothesisInput()), jobKey }),
    });
    expect(enqueue.status).toBe(202);
    const status = async () =>
      (await (
        await app.request('/ai/jobs/status', {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ jobKeys: [jobKey] }),
        })
      ).json()) as { jobs: { status: string; meta?: { mode: string } }[] };
    expect((await status()).jobs[0]?.status).toBe('queued');
    expect(await ai.tick()).toMatchObject({ sent: 1 });
    expect((await status()).jobs[0]?.status).toBe('running');
    // El lote simulado termina en el ciclo siguiente
    expect(await ai.tick()).toMatchObject({ ready: 1 });
    expect((await status()).jobs[0]).toMatchObject({ status: 'ready', meta: { mode: 'mock' } });
  });

  it('el dueño local usa los cinco motores y el ciclo corre solo con su reloj', async () => {
    vi.useFakeTimers();
    try {
      const ai = createAiDeps({
        credentials: { mode: 'mock', apiKey: null },
        files: { config: null, ledger: null },
      });
      expect(DEV_CALLER.role).toBe('owner');
      let ticks = 0;
      const stop = startDevBatchLoop({
        ...ai,
        tick: () => {
          ticks += 1;
          return ai.tick();
        },
      });
      await vi.advanceTimersByTimeAsync(4_100);
      expect(ticks).toBe(2);
      stop();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(ticks).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
