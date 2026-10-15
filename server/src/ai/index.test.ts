// El proxy de desarrollo arma el núcleo con archivos locales (B12, 1.5 del plan)
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hypothesisInput } from '../../../src/ai/testing/aiSamples.ts';
import { bundledPromptSets } from '../../../supabase/functions/_shared/ai/prompts.ts';
import { requestBody } from '../../../supabase/functions/_shared/ai/testing/fakes.ts';
import { createApp } from '../app.ts';
import { createAiDeps } from './index.ts';

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
      studentRef: 'alumno-uno-0001',
      engine: 'forgetting',
      perStudentPerDay: 2,
      dailyBudgetUsd: 1,
    });
    expect(existsSync(ledger)).toBe(true);
  });
});
