import { describe, expect, it, vi } from 'vitest';
import {
  fetchAdminConfig,
  fetchAdminUsage,
  proxyAvailable,
  saveAdminConfig,
  type AdminConfig,
} from './admin';

const config: AdminConfig = {
  models: {
    forgetting: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
    weekly_report: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1500 },
    flashcards: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 6000 },
    bias_tips: { id: 'claude-haiku-4-5', effort: null, maxTokens: 1000 },
    restructure: { id: 'claude-sonnet-5-5', effort: 'low', maxTokens: 4000 },
  },
  prices: { 'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
  limits: {
    perStudentPerDay: {
      forgetting: 12,
      weekly_report: 4,
      flashcards: 240,
      bias_tips: 12,
      restructure: 20,
    },
    dailyBudgetUsd: 5,
    timeoutMs: 30000,
    maxRetries: 2,
  },
};
const usage = {
  mode: 'mock',
  limits: config.limits,
  usage: {
    day: '2026-10-08',
    calls: 3,
    students: 1,
    spentUsd: 0,
    byEngine: { forgetting: { calls: 3, costUsd: 0 } },
  },
};

const reply = (body: unknown, status = 200) =>
  vi.fn(() => Promise.resolve(Response.json(body, { status }))) as unknown as typeof fetch;

describe('proxy de IA para el admin', () => {
  it('solo hay proxy cuando responde, con o sin clave', () => {
    expect(proxyAvailable({ kind: 'real' })).toBe(true);
    expect(proxyAvailable({ kind: 'mock' })).toBe(true);
    for (const kind of ['no-proxy', 'offline', 'checking'] as const) {
      expect(proxyAvailable({ kind })).toBe(false);
    }
  });

  it('lee la configuración y el uso de hoy', async () => {
    const response = { mode: 'mock', config, prompts: { forgetting: 'forgetting.base.v1' } };
    expect(await fetchAdminConfig(reply(response))).toEqual(response);
    expect((await fetchAdminUsage(reply(usage)))?.usage.calls).toBe(3);
  });

  it('devuelve null con un error, con otro formato o sin red', async () => {
    expect(await fetchAdminConfig(reply({ error: 'x' }, 500))).toBeNull();
    expect(await fetchAdminConfig(reply({ nada: true }))).toBeNull();
    const down = vi.fn(() => Promise.reject(new TypeError('sin red'))) as unknown as typeof fetch;
    expect(await fetchAdminUsage(down)).toBeNull();
  });

  it('guarda cambios con PUT y vuelve a leer la configuración completa', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        ...(init?.body ? { body: init.body as string } : {}),
      });
      return Promise.resolve(
        init?.method === 'PUT'
          ? Response.json({ mode: 'mock', config })
          : Response.json({ mode: 'mock', config, prompts: {} }),
      );
    }) as unknown as typeof fetch;
    const result = await saveAdminConfig({ limits: { dailyBudgetUsd: 2 } }, fetchImpl);
    expect(result.ok).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'PUT /api/ai/config',
      'GET /api/ai/config',
    ]);
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ limits: { dailyBudgetUsd: 2 } });
  });

  it('dice por qué no se pudo guardar', async () => {
    expect(await saveAdminConfig({}, reply({ error: 'invalid_request' }, 400))).toMatchObject({
      ok: false,
      message: expect.stringContaining('no aceptó') as string,
    });
    const down = vi.fn(() => Promise.reject(new TypeError('sin red'))) as unknown as typeof fetch;
    expect(await saveAdminConfig({}, down)).toMatchObject({ ok: false });
    // Se guardó pero no se pudo volver a leer
    let first = true;
    const flaky = vi.fn(() => {
      if (first) {
        first = false;
        return Promise.resolve(Response.json({ mode: 'mock', config }));
      }
      return Promise.resolve(new Response('', { status: 500 }));
    }) as unknown as typeof fetch;
    expect(await saveAdminConfig({}, flaky)).toMatchObject({
      ok: false,
      message: expect.stringContaining('Se guardó') as string,
    });
  });
});
