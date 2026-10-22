// ai-proxy y ai-batch de punta a punta con las dos formas de llave de Supabase (B17, 4.2). Las mismas
// pruebas corren con las llaves de siempre (anon y service_role, JWT en apikey y en Bearer) y con las nuevas
// (sb_publishable_ y sb_secret_, solo en apikey). El Supabase simulado hace lo que la plataforma real, que es
// rechazar con 401 una llave nueva que llega como Bearer. Así, si algún lugar de las funciones arma su
// propio Bearer con la llave de servicio, estas pruebas lo ven.
import { describe, expect, it } from 'vitest';
import { hypothesisInput } from '../../../../src/ai/testing/aiSamples.ts';
import { DEFAULT_CONFIG } from './config.ts';
import { buildAiBatch, buildAiProxy, structuredLog } from './edge.ts';
import { readAiBatchEnv, readAiProxyEnv } from './env.ts';
import { bundledPromptSets } from './prompts.ts';
import {
  anthropicClientsOf,
  createFakeAnthropic,
  type FakeAnthropic,
} from './testing/fakeAnthropic.ts';
import {
  createFakeSupabaseRest,
  type FakeAccount,
  type FakeSupabaseRest,
} from './testing/fakeSupabaseRest.ts';
import { requestBody } from './testing/fakes.ts';
import { createMemoryAi } from './testing/memory.ts';

const ORIGIN = 'https://studiare.example.mx';
const PAID = 'f0000000-0000-4000-8000-000000000001';
const ADMIN = 'f0000000-0000-4000-8000-000000000004';
const ACCOUNTS: Record<string, FakeAccount | 'expired'> = {
  'token-pago': { userId: PAID, role: 'student', paid: true },
  'token-admin': { userId: ADMIN, role: 'admin', paid: false },
};
const prompts = bundledPromptSets();

type Form = 'legacy' | 'new';

/** Las variables como las pone Supabase en cada forma. La nueva, sin ninguna de las de siempre */
function supabaseSource(form: Form, rest: FakeSupabaseRest) {
  return form === 'new'
    ? {
        SUPABASE_URL: rest.url,
        SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: rest.anonKey }),
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: rest.serviceKey }),
        SUPABASE_ANON_KEY: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      }
    : {
        SUPABASE_URL: rest.url,
        SUPABASE_PUBLISHABLE_KEYS: undefined,
        SUPABASE_SECRET_KEYS: undefined,
        SUPABASE_ANON_KEY: rest.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: rest.serviceKey,
      };
}

function proxy(form: Form) {
  const memory = createMemoryAi();
  const rest = createFakeSupabaseRest({ memory, accounts: ACCOUNTS, keys: form });
  const anthropic: FakeAnthropic = createFakeAnthropic();
  // En modo simulado, como las demás pruebas de la función. Las llaves de Supabase son lo que se revisa aquí
  const parsed = readAiProxyEnv({
    ENARM_ANTHROPIC_KEY: undefined,
    APP_ORIGINS: ORIGIN,
    AI_ALLOW_MOCK: '1',
    ...supabaseSource(form, rest),
  });
  if (!parsed.ok) throw new Error(`El entorno de prueba no sirve. ${parsed.problems.join(' ')}`);
  const built = buildAiProxy(parsed.env, {
    fetch: rest.fetch,
    anthropic: () => anthropicClientsOf(anthropic),
    clock: () => Date.now(),
    log: structuredLog(() => undefined),
  });
  return { ...built, memory, rest, env: parsed.env };
}

const headers = (token: string) => ({
  'content-type': 'application/json',
  origin: ORIGIN,
  authorization: `Bearer ${token}`,
});

describe.each<Form>(['legacy', 'new'])('ai-proxy con las llaves en forma %s', (form) => {
  it('elige las llaves que Supabase puso en esa forma', () => {
    const { env, rest } = proxy(form);
    expect(env.anonKey).toBe(rest.anonKey);
    expect(env.serviceKey).toBe(rest.serviceKey);
    expect(form === 'new' ? env.serviceKey.startsWith('sb_secret_') : true).toBe(true);
  });

  it('contesta a un alumno de pago, con la sesión, el libro, la compuerta y la configuración', async () => {
    const p = proxy(form);
    await p.memory.gate.open('forgetting', { config: DEFAULT_CONFIG, prompts: p.deps.prompts });
    const health = await p.app.request('/ai-proxy/health', { headers: { origin: ORIGIN } });
    expect(await health.json()).toMatchObject({ engines: { forgetting: 'open' } });
    const reply = await p.app.request('/ai-proxy/ai/forgetting', {
      method: 'POST',
      headers: headers('token-pago'),
      body: JSON.stringify(requestBody(hypothesisInput())),
    });
    expect(reply.status).toBe(200);
    expect(p.memory.ledger.log.map((entry) => entry.userId)).toEqual([PAID]);
    // El admin guarda la configuración con la llave de servicio por la API de tablas
    const saved = await p.app.request('/ai-proxy/ai/config', {
      method: 'PUT',
      headers: headers('token-admin'),
      body: JSON.stringify({ limits: { dailyBudgetUsd: 12 } }),
    });
    expect(saved.status).toBe(200);
    expect(p.rest.configRow).toMatchObject({ limits: { dailyBudgetUsd: 12 } });
  });

  it('la llave de servicio nunca viaja como Bearer en la forma nueva, y la sesión nunca con la de servicio', async () => {
    const p = proxy(form);
    await p.memory.gate.open('forgetting', { config: DEFAULT_CONFIG, prompts: p.deps.prompts });
    await p.app.request('/ai-proxy/health');
    await p.app.request('/ai-proxy/ai/forgetting', {
      method: 'POST',
      headers: headers('token-pago'),
      body: JSON.stringify(requestBody(hypothesisInput())),
    });
    await p.app.request('/ai-proxy/ai/config', {
      method: 'PUT',
      headers: headers('token-admin'),
      body: JSON.stringify({ limits: { dailyBudgetUsd: 11 } }),
    });
    expect(p.rest.calls.length).toBeGreaterThan(5);
    for (const call of p.rest.calls) {
      const label = `${call.method} ${call.path}`;
      if (call.path.endsWith('/ai_whoami')) {
        // La sesión del alumno con la llave pública
        expect(call.key, label).toBe('anon');
        expect(call.bearer, label).toBe('user');
      } else {
        expect(call.key, label).toBe('service');
        expect(call.bearer, label).toBe(form === 'new' ? 'none' : 'service');
      }
    }
  });
});

describe.each<Form>(['legacy', 'new'])('ai-batch con las llaves en forma %s', (form) => {
  it('el ciclo de lotes lee la cola, manda el lote y asienta con esa llave', async () => {
    const memory = createMemoryAi();
    const rest = createFakeSupabaseRest({ memory, tickSecret: 'secreto-del-ciclo', keys: form });
    const anthropic = createFakeAnthropic({ prompts });
    const parsed = readAiBatchEnv({
      ENARM_ANTHROPIC_KEY: 'clave-de-prueba',
      AI_ALLOW_MOCK: undefined,
      AI_TICK_DEADLINE_MS: undefined,
      ...supabaseSource(form, rest),
    });
    if (!parsed.ok) throw new Error(`El entorno de prueba no sirve. ${parsed.problems.join(' ')}`);
    const work: Promise<unknown>[] = [];
    const handler = buildAiBatch(parsed.env, {
      fetch: rest.fetch,
      anthropic: () => anthropicClientsOf(anthropic),
      clock: () => Date.now(),
      log: structuredLog(() => undefined),
      waitUntil: (promise) => work.push(promise),
    });
    await memory.jobs.enqueue({
      userId: PAID,
      engine: 'forgetting',
      jobKey: `fgt_${'1'.padStart(32, '0')}`,
      input: hypothesisInput(),
      inputHash: 'a'.repeat(64),
      promptVersion: prompts.forgetting.version,
      model: DEFAULT_CONFIG.models.forgetting.id,
      maxPending: 12,
    });
    const reply = await handler(
      new Request('https://simulado.supabase.co/functions/v1/ai-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ai-tick': 'secreto-del-ciclo' },
        body: '{}',
      }),
    );
    expect(reply.status).toBe(202);
    await Promise.all(work);
    expect(anthropic.batches.created).toHaveLength(1);
    expect(memory.jobs.rows[0]?.status).toBe('submitted');
    expect(rest.calls.length).toBeGreaterThan(3);
    for (const call of rest.calls) {
      expect(call.key, call.path).toBe('service');
      expect(call.bearer, call.path).toBe(form === 'new' ? 'none' : 'service');
    }
  });
});
