// La Edge Function ai-proxy de punta a punta con Supabase y Anthropic simulados (B12, 7.1). Se arma
// con buildAiProxy, igual que su index.ts, así lo que se prueba es lo que se despliega.
import { describe, expect, it } from 'vitest';
import {
  flashcardsInput,
  hypothesisInput,
  restructureInput,
} from '../../../../src/ai/testing/aiSamples.ts';
import { DEFAULT_CONFIG } from './config.ts';
import { bundledPromptSets } from './prompts.ts';
import { AI_ENGINES, type AiEngine } from './engines/aiContracts.ts';
import { mockHypothesis, mockOutput } from './engines/aiMock.ts';
import { buildAiProxy, structuredLog } from './edge.ts';
import type { AiProxyEnv } from './env.ts';
import { worstCaseCostUsd } from './run.ts';
import {
  anthropicClientsOf,
  createFakeAnthropic,
  fakeMessage,
  refusalMessage,
  type FakeAnthropic,
} from './testing/fakeAnthropic.ts';
import { createFakeSupabaseRest, type FakeAccount } from './testing/fakeSupabaseRest.ts';
import { requestBody } from './testing/fakes.ts';
import { createMemoryAi } from './testing/memory.ts';

const ORIGIN = 'https://rickymm2001-dev.github.io';
const PAID = 'f0000000-0000-4000-8000-000000000001';
const FREE = 'f0000000-0000-4000-8000-000000000002';
const PHYSICIAN = 'f0000000-0000-4000-8000-000000000003';
const ADMIN = 'f0000000-0000-4000-8000-000000000004';

const ACCOUNTS: Record<string, FakeAccount | 'expired'> = {
  'token-pago': { userId: PAID, role: 'student', paid: true },
  'token-gratis': { userId: FREE, role: 'student', paid: false },
  'token-medico': { userId: PHYSICIAN, role: 'physician', paid: false },
  'token-admin': { userId: ADMIN, role: 'admin', paid: false },
  'token-dueno': { userId: ADMIN, role: 'owner', paid: false },
  'token-otro': { userId: PAID, role: 'student', paid: true, device: 'other' },
  'token-vencido': 'expired',
};

const good = JSON.stringify(mockHypothesis(hypothesisInput()));

function edge(
  options: {
    key?: 'real' | 'mock' | 'none';
    replies?: Parameters<typeof createFakeAnthropic>[0];
    /** Cuánto tarda el modelo en contestar, para que varias llamadas estén en vuelo a la vez */
    modelDelayMs?: number;
  } = {},
) {
  let now = Date.parse('2026-10-15T15:00:00Z');
  const memory = createMemoryAi({ clock: () => now });
  const rest = createFakeSupabaseRest({ memory, accounts: ACCOUNTS });
  const anthropic: FakeAnthropic = createFakeAnthropic(options.replies);
  const logs: string[] = [];
  const key = options.key ?? 'real';
  const env: AiProxyEnv = {
    supabaseUrl: rest.url,
    anonKey: rest.anonKey,
    serviceKey: rest.serviceKey,
    anthropicKey: key === 'real' ? 'clave-de-prueba' : null,
    allowMock: key === 'mock',
    origins: new Set([ORIGIN]),
  };
  const delayMs = options.modelDelayMs ?? 0;
  const clients = anthropicClientsOf(anthropic);
  const slowClients =
    delayMs === 0
      ? clients
      : {
          ...clients,
          messages: {
            create: async (...args: Parameters<typeof clients.messages.create>) => {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              return clients.messages.create(...args);
            },
          },
        };
  const built = buildAiProxy(env, {
    fetch: rest.fetch,
    anthropic: () => slowClients,
    clock: () => now,
    log: structuredLog((line) => logs.push(line)),
  });
  const open = async (engines: readonly AiEngine[]) => {
    for (const engine of engines) {
      await memory.gate.open(engine, { config: DEFAULT_CONFIG, prompts: built.deps.prompts });
    }
  };
  return {
    ...built,
    memory,
    rest,
    anthropic,
    logs,
    open,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const headers = (token: string | null = 'token-pago', extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  origin: ORIGIN,
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...extra,
});

type App = ReturnType<typeof edge>['app'];
const call = (
  app: App,
  engine: string,
  body: unknown,
  token: string | null = 'token-pago',
  extra: Record<string, string> = {},
) =>
  app.request(`/ai-proxy/ai/${engine}`, {
    method: 'POST',
    headers: headers(token, extra),
    body: JSON.stringify(body),
  });
const forgetting = (app: App, token: string | null = 'token-pago') =>
  call(app, 'forgetting', requestBody(hypothesisInput()), token);
const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;

describe('/health', () => {
  it('es público y dice el modo, la versión 2 y qué motores ven los alumnos', async () => {
    const proxy = edge();
    await proxy.open(['bias_tips']);
    const response = await proxy.app.request('/ai-proxy/health', { headers: { origin: ORIGIN } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await response.json()).toEqual({
      status: 'ok',
      mode: 'real',
      version: 2,
      engines: {
        forgetting: 'gated',
        weekly_report: 'gated',
        flashcards: 'gated',
        bias_tips: 'open',
        restructure: 'gated',
      },
    });
  });

  it('sin clave dice unavailable y los motores contestan not_configured. Con AI_ALLOW_MOCK, mock', async () => {
    const none = edge({ key: 'none' });
    expect(await (await none.app.request('/ai-proxy/health')).json()).toMatchObject({
      mode: 'unavailable',
    });
    const response = await forgetting(none.app, 'token-medico');
    expect(response.status).toBe(503);
    expect(await errorOf(response)).toBe('not_configured');
    expect(none.memory.ledger.log).toHaveLength(0);

    const mock = edge({ key: 'mock' });
    expect(await (await mock.app.request('/ai-proxy/health')).json()).toMatchObject({
      mode: 'mock',
    });
    const simulated = await forgetting(mock.app, 'token-medico');
    expect(simulated.status).toBe(200);
    expect(await simulated.json()).toMatchObject({
      meta: { mode: 'mock', model: 'respuestas-fijas-v1' },
    });
    // En modo simulado nada gasta
    expect(mock.memory.ledger.log[0]).toMatchObject({ real: false, costUsd: 0 });
    expect((await mock.memory.ledger.summary()).spentUsd).toBe(0);
  });
});

describe('sesión, dispositivo y plan', () => {
  it('sin token, con uno vencido o mal puesto contesta 401 y no gasta', async () => {
    const proxy = edge();
    for (const token of [null, 'token-vencido', 'token-nadie']) {
      const response = await forgetting(proxy.app, token);
      expect(response.status, String(token)).toBe(401);
      expect(await errorOf(response)).toBe('unauthorized');
    }
    const basic = await call(proxy.app, 'forgetting', requestBody(hypothesisInput()), null, {
      authorization: 'Basic token-pago',
    });
    expect(basic.status).toBe(401);
    expect(proxy.memory.ledger.log).toHaveLength(0);
    // ai_whoami va con el token del alumno y la llave pública, nunca con la de servicio
    const whoami = proxy.rest.calls.filter((entry) => entry.path.endsWith('/ai_whoami'));
    expect(whoami.length).toBeGreaterThan(0);
    expect(whoami.every((entry) => entry.key === 'anon' && entry.bearer === 'user')).toBe(true);
  });

  it('otro dispositivo da 403 con su mensaje y Supabase caído 503, y una falla no se recuerda', async () => {
    const proxy = edge({ replies: { replies: [fakeMessage(good)] } });
    const other = await forgetting(proxy.app, 'token-otro');
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({
      error: 'unauthorized',
      message: expect.stringMatching(/otro dispositivo/) as unknown,
    });
    await proxy.open(['forgetting']);
    proxy.rest.down = true;
    expect((await forgetting(proxy.app)).status).toBe(503);
    proxy.rest.down = false;
    expect((await forgetting(proxy.app)).status).toBe(200);
  });

  it('recuerda una sesión buena 30 s y luego vuelve a preguntar', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(['forgetting']);
    await forgetting(proxy.app);
    await forgetting(proxy.app);
    const asks = () => proxy.rest.calls.filter((entry) => entry.path.endsWith('/ai_whoami')).length;
    expect(asks()).toBe(1);
    proxy.advance(31_000);
    await forgetting(proxy.app);
    expect(asks()).toBe(2);
  });

  it('Gratis recibe plan_required, de pago pasa y un médico Gratis también', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(AI_ENGINES);
    const free = await forgetting(proxy.app, 'token-gratis');
    expect(free.status).toBe(403);
    expect(await errorOf(free)).toBe('plan_required');
    expect((await forgetting(proxy.app, 'token-pago')).status).toBe(200);
    expect((await forgetting(proxy.app, 'token-medico')).status).toBe(200);
    // El alumno de la llamada es su cuenta, nunca el studentRef del sobre
    expect(proxy.memory.ledger.log.map((entry) => entry.userId)).toEqual([PAID, PHYSICIAN]);
  });
});

describe('rol', () => {
  it('un alumno de pago en restructure recibe staff_only y el equipo pasa', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(AI_ENGINES);
    const student = await call(proxy.app, 'restructure', requestBody(restructureInput()));
    expect(student.status).toBe(403);
    expect(await errorOf(student)).toBe('staff_only');
    for (const token of ['token-medico', 'token-admin', 'token-dueno']) {
      const response = await call(proxy.app, 'restructure', requestBody(restructureInput()), token);
      expect(response.status, token).toBe(200);
    }
  });

  it('la configuración y el gasto son del admin y del dueño', async () => {
    const proxy = edge({ key: 'mock' });
    for (const path of ['/ai-proxy/ai/config', '/ai-proxy/ai/usage']) {
      for (const token of ['token-pago', 'token-medico']) {
        expect((await proxy.app.request(path, { headers: headers(token) })).status).toBe(403);
      }
      for (const token of ['token-admin', 'token-dueno']) {
        expect((await proxy.app.request(path, { headers: headers(token) })).status).toBe(200);
      }
    }
  });

  it('un alumno no llega a la configuración con la dirección codificada, con rodeos ni con otro método', async () => {
    const proxy = edge({ key: 'mock' });
    for (const path of [
      '/ai/%63onfig',
      '/ai/%75sage',
      '/ai/%43onfig',
      '/ai/config/',
      '/ai//config',
      '/ai/./config',
      '/ai/x/../config',
      '/ai/%2e%2e/ai/usage',
    ]) {
      const read = await proxy.app.request(`/ai-proxy${path}`, { headers: headers() });
      expect(read.status, `GET ${path}`).not.toBe(200);
      const write = await proxy.app.request(`/ai-proxy${path}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ limits: { dailyBudgetUsd: 100000 } }),
      });
      expect(write.status, `PUT ${path}`).not.toBe(200);
    }
    for (const [method, path] of [
      ['GET', '/ai/forgetting'],
      ['DELETE', '/ai/config'],
      ['POST', '/ai/config'],
      ['POST', '/ai/usage'],
      ['POST', '/ai/forgetting/extra'],
    ] as const) {
      const response = await proxy.app.request(`/ai-proxy${path}`, { method, headers: headers() });
      expect(response.status, `${method} ${path}`).toBe(403);
    }
    expect(proxy.rest.configRow).toBeNull();
    // La forma codificada sí es de admin, igual que la normal
    const admin = await proxy.app.request('/ai-proxy/ai/%63onfig', {
      headers: headers('token-admin'),
    });
    expect(admin.status).toBe(200);
  });

  it('el admin cambia la configuración, se guarda en ai_config y una que rompe las reglas del modelo no', async () => {
    const proxy = edge({ key: 'mock' });
    const put = (body: unknown) =>
      proxy.app.request('/ai-proxy/ai/config', {
        method: 'PUT',
        headers: headers('token-admin'),
        body: JSON.stringify(body),
      });
    expect((await put({ limits: { dailyBudgetUsd: 12 } })).status).toBe(200);
    expect(proxy.rest.configRow).toMatchObject({ limits: { dailyBudgetUsd: 12 } });
    expect(proxy.deps.config().limits.dailyBudgetUsd).toBe(12);
    const opus = await put({
      models: {
        forgetting: { id: 'claude-opus-5-5', effort: 'low', thinking: 'off', maxTokens: 2000 },
      },
    });
    expect(opus.status).toBe(400);
    expect(await opus.json()).toMatchObject({
      error: 'invalid_request',
      message: expect.stringContaining('no deja apagar el razonamiento') as unknown,
    });
    expect(proxy.deps.config().models.forgetting.id).toBe(DEFAULT_CONFIG.models.forgetting.id);
  });
});

describe('compuerta 1', () => {
  it('un alumno con el motor cerrado recibe gate_closed y el equipo sigue', async () => {
    const proxy = edge({ key: 'mock' });
    const closed = await forgetting(proxy.app);
    expect(closed.status).toBe(403);
    expect(await errorOf(closed)).toBe('gate_closed');
    expect((await forgetting(proxy.app, 'token-medico')).status).toBe(200);
    expect((await forgetting(proxy.app, 'token-admin')).status).toBe(200);
  });

  it('con la pausa todos salvo admin y dueño reciben paused', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(AI_ENGINES);
    proxy.memory.gate.pause(true);
    for (const token of ['token-pago', 'token-medico']) {
      const response = await forgetting(proxy.app, token);
      expect(response.status).toBe(503);
      expect(await errorOf(response)).toBe('paused');
    }
    expect((await forgetting(proxy.app, 'token-dueno')).status).toBe(200);
    expect(await (await proxy.app.request('/ai-proxy/health')).json()).toMatchObject({
      engines: { forgetting: 'gated', bias_tips: 'gated' },
    });
  });

  it('con otro modelo o con la huella del prompt distinta a la auditada el motor se cierra', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(['forgetting', 'bias_tips']);
    expect((await forgetting(proxy.app)).status).toBe(200);
    const forgettingState = proxy.memory.gate.state.engines.forgetting;
    const biasState = proxy.memory.gate.state.engines.bias_tips;
    if (!forgettingState || !biasState) throw new Error('falta la compuerta');
    forgettingState.model = 'claude-haiku-5-5';
    biasState.promptHash = '0'.repeat(64);
    // La bandera se recuerda 60 s en la función
    expect((await forgetting(proxy.app)).status).toBe(200);
    proxy.advance(61_000);
    expect(await errorOf(await forgetting(proxy.app))).toBe('gate_closed');
    const health = (await (await proxy.app.request('/ai-proxy/health')).json()) as {
      engines: Record<string, string>;
    };
    expect(health.engines).toMatchObject({ forgetting: 'gated', bias_tips: 'gated' });
  });
});

describe('presupuesto y generaciones', () => {
  const settle = (
    proxy: ReturnType<typeof edge>,
    engine: AiEngine,
    userId: string,
    costUsd: number,
  ) =>
    proxy.memory.ledger.settle({
      userId,
      engine,
      model: 'claude-haiku-5-5',
      real: true,
      ok: true,
      costUsd,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      latencyMs: 0,
      mode: 'sync',
      outcome: 'ok',
      promptVersion: null,
      refusalCategory: null,
      jobId: null,
    });

  it('el total, la cuota del motor y el tope del alumno dan 429 sin llamar al modelo', async () => {
    const cases: [AiEngine, string, number][] = [
      ['flashcards', ADMIN, 5],
      ['forgetting', ADMIN, 0.5],
      ['bias_tips', PAID, 0.3],
    ];
    for (const [engine, userId, cost] of cases) {
      const proxy = edge({ replies: { replies: [fakeMessage(good)] } });
      await proxy.open(AI_ENGINES);
      await settle(proxy, engine, userId, cost);
      const response = await forgetting(proxy.app);
      expect(response.status, engine).toBe(429);
      expect(await errorOf(response)).toBe('budget_exceeded');
      expect(proxy.anthropic.messages.calls).toHaveLength(0);
    }
  });

  it('un médico no tiene tope en dólares por persona', async () => {
    const proxy = edge({ replies: { replies: [fakeMessage(good)] } });
    await settle(proxy, 'bias_tips', PHYSICIAN, 0.3);
    expect((await forgetting(proxy.app, 'token-medico')).status).toBe(200);
  });

  it('generation_limit en la generación 21 y en la sección 15 de una generación', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(['flashcards']);
    const cards = (app: App, ref: string, section = 0) =>
      call(app, 'flashcards', requestBody(flashcardsInput(), { generation: { ref, section } }));
    for (let index = 1; index <= 20; index += 1) {
      const response = await cards(proxy.app, `generacion-${String(index).padStart(3, '0')}`);
      expect(response.status).toBe(200);
    }
    const twentyOne = await cards(proxy.app, 'generacion-021');
    expect(twentyOne.status).toBe(429);
    expect(await errorOf(twentyOne)).toBe('generation_limit');

    const other = edge({ key: 'mock' });
    await other.open(['flashcards']);
    for (let n = 0; n < 14; n += 1) {
      expect((await cards(other.app, 'una-sola-generacion', Math.min(n, 11))).status).toBe(200);
    }
    expect(await errorOf(await cards(other.app, 'una-sola-generacion', 11))).toBe(
      'generation_limit',
    );
  });
});

describe('reserva del peor costo con llamadas a la vez (revisión del hallazgo 1)', () => {
  // Sonnet 5.5 con 2,000 tokens de entrada y 1,400 de salida cuesta 0.018 dólares por sección
  const sonnet = (text: string) =>
    fakeMessage(text, {
      model: 'claude-sonnet-5-5',
      usage: { input_tokens: 2000, output_tokens: 1400 },
    });
  const cardsOut = JSON.stringify(mockOutput('flashcards', flashcardsInput()));
  const section = async (app: App, index: number, token = 'token-pago') =>
    await call(
      app,
      'flashcards',
      requestBody(flashcardsInput(), {
        generation: { ref: `generacion-${String(index % 20).padStart(3, '0')}`, section: 0 },
      }),
      token,
    );

  it('60 llamadas a la vez de una alumna admiten solo las que caben bajo su tope en dólares', async () => {
    const proxy = edge({ replies: { replies: [sonnet(cardsOut)] }, modelDelayMs: 30 });
    await proxy.open(['flashcards']);
    const config = proxy.deps.config();
    const cap = config.limits.perUserDailyUsd;
    const worst = worstCaseCostUsd(
      { config, prompts: proxy.deps.prompts },
      'flashcards',
      flashcardsInput(),
    );
    // El tope es blando por una sola llamada: pasa mientras lo asentado más lo que está en vuelo no lo alcance
    const fits = Math.ceil(cap / worst);
    expect(fits).toBeGreaterThanOrEqual(2);
    expect(fits).toBeLessThan(10);

    const responses = await Promise.all(
      Array.from({ length: 60 }, (_, index) => section(proxy.app, index)),
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(fits);
    expect(statuses.filter((status) => status === 429)).toHaveLength(60 - fits);
    const refused = responses.find((response) => response.status === 429);
    expect(await errorOf(refused as Response)).toBe('budget_exceeded');
    // Solo las admitidas llegaron al modelo, y gastaron mucho menos que el tope
    expect(proxy.anthropic.messages.calls).toHaveLength(fits);
    const summary = await proxy.memory.ledger.summary();
    expect(summary.spentUsd).toBeCloseTo(fits * 0.018, 6);
    expect(summary.spentUsd).toBeLessThanOrEqual(cap);
    // Al terminar no queda nada reservado, ni de las que pasaron ni de las que no
    expect(proxy.memory.ledger.snapshot().users[PAID]).toMatchObject({
      costUsd: summary.spentUsd,
      reserved: {},
    });
    // Y el alumno sigue con lo que le queda del día, sin una reserva fantasma que lo bloquee
    expect((await section(proxy.app, 99)).status).toBe(200);
  });

  it('una llamada tras otra gasta lo de siempre: 17 secciones de 0.018 antes del tope de 0.30', async () => {
    const proxy = edge({ replies: { replies: [sonnet(cardsOut)] } });
    await proxy.open(['flashcards']);
    const statuses: number[] = [];
    for (let index = 0; index < 25; index += 1) {
      statuses.push((await section(proxy.app, index)).status);
    }
    expect(statuses.filter((status) => status === 200)).toHaveLength(17);
    expect((await proxy.memory.ledger.summary()).spentUsd).toBeCloseTo(0.306, 6);
  });

  it('varias alumnas a la vez no se pasan de la cuota del motor', async () => {
    const proxy = edge({ replies: { replies: [sonnet(cardsOut)] }, modelDelayMs: 30 });
    await proxy.open(['flashcards']);
    // Una cuota de flashcards de medio dólar y alumnas distintas: cada una con su propio tope
    await proxy.app.request('/ai-proxy/ai/config', {
      method: 'PUT',
      headers: headers('token-admin'),
      body: JSON.stringify({ limits: { dailyBudgetUsd: 1, engineShare: { flashcards: 0.5 } } }),
    });
    const config = proxy.deps.config();
    const worst = worstCaseCostUsd(
      { config, prompts: proxy.deps.prompts },
      'flashcards',
      flashcardsInput(),
    );
    const quota = config.limits.dailyBudgetUsd * config.limits.engineShare.flashcards;
    const staff = ['token-medico', 'token-admin', 'token-dueno'];
    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, index) => section(proxy.app, index, staff[index % 3])),
    );
    const admitted = responses.filter((response) => response.status === 200).length;
    expect(admitted).toBe(Math.ceil(quota / worst));
    expect((await proxy.memory.ledger.summary()).spentUsd).toBeLessThanOrEqual(quota);
  });

  it('lo que reserva una llamada que muere vence a los 5 minutos', async () => {
    const proxy = edge({ replies: { replies: [sonnet(cardsOut)] } });
    await proxy.open(['flashcards']);
    const worst = worstCaseCostUsd(
      { config: proxy.deps.config(), prompts: proxy.deps.prompts },
      'flashcards',
      flashcardsInput(),
    );
    // Una llamada que admitió y murió antes de asentar, como una función que la plataforma cortó
    for (let index = 0; index < 3; index += 1) {
      await proxy.memory.ledger.admit({
        userId: PAID,
        engine: 'flashcards',
        staff: false,
        perStudentPerDay: 240,
        dailyBudgetUsd: 5,
        engineShare: 0.55,
        perUserDailyUsd: 0.3,
        generationRef: null,
        maxGenerations: 20,
        maxSections: 12,
        reserveUsd: worst,
      });
    }
    expect(await errorOf(await section(proxy.app, 1))).toBe('budget_exceeded');
    proxy.advance(4 * 60_000);
    expect(await errorOf(await section(proxy.app, 2))).toBe('budget_exceeded');
    proxy.advance(60_000);
    expect((await section(proxy.app, 3)).status).toBe(200);
  });
});

describe('bitácora', () => {
  it('asienta el costo real con modo, caché y resultado, también cuando falla', async () => {
    const proxy = edge({
      replies: {
        replies: [
          fakeMessage(good, {
            usage: {
              input_tokens: 1000,
              output_tokens: 200,
              cache_read_input_tokens: 700,
              cache_creation_input_tokens: 50,
            },
          }),
          fakeMessage('no es json'),
          fakeMessage('tampoco'),
        ],
      },
    });
    await proxy.open(['forgetting']);
    expect((await forgetting(proxy.app)).status).toBe(200);
    const failed = await forgetting(proxy.app);
    expect(failed.status).toBe(502);
    expect(await errorOf(failed)).toBe('invalid_output');
    expect(proxy.memory.ledger.log).toMatchObject([
      {
        userId: PAID,
        engine: 'forgetting',
        model: 'claude-haiku-4-5',
        real: true,
        ok: true,
        mode: 'sync',
        outcome: 'ok',
        cacheReadTokens: 700,
        cacheWriteTokens: 50,
        // La versión del prompt que lleva la copia generada, que sube cuando cambian los prompts
        promptVersion: bundledPromptSets().forgetting.version,
        jobId: null,
      },
      { ok: false, outcome: 'invalid_output', inputTokens: 2000 },
    ]);
    const first = proxy.memory.ledger.log[0];
    expect(first?.costUsd).toBeGreaterThan(0);
    expect((await proxy.memory.ledger.summary()).spentUsd).toBeGreaterThan(first?.costUsd ?? 0);
  });

  it('una negativa queda con su categoría y no se reintenta', async () => {
    const proxy = edge({ replies: { replies: [refusalMessage('bio')] } });
    await proxy.open(['forgetting']);
    const response = await forgetting(proxy.app);
    expect(response.status).toBe(502);
    expect(await errorOf(response)).toBe('refused');
    expect(proxy.anthropic.messages.calls).toHaveLength(1);
    expect(proxy.memory.ledger.log[0]).toMatchObject({
      outcome: 'refused',
      refusalCategory: 'bio',
    });
  });

  it('el registro de la función solo lleva códigos y números', async () => {
    const proxy = edge({ key: 'mock' });
    await forgetting(proxy.app, 'token-vencido');
    expect(proxy.logs.length).toBeGreaterThan(0);
    for (const line of proxy.logs) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const onlyNumbers = Object.entries(entry).every(
        ([key, value]) => key === 'code' || typeof value === 'number',
      );
      expect(onlyNumbers).toBe(true);
      expect(line).not.toContain('token');
    }
  });
});

describe('datos personales', () => {
  it('pii_blocked con 422 y el modelo no recibe nada', async () => {
    const proxy = edge({ replies: { replies: [fakeMessage(good)] } });
    const input = hypothesisInput();
    const withEmail = {
      ...input,
      evidence: input.evidence.map((item, index) =>
        index === 0 ? { ...item, text: `${item.text} escríbeme a ana@correo.mx` } : item,
      ),
    };
    const response = await call(proxy.app, 'forgetting', requestBody(withEmail), 'token-medico');
    expect(response.status).toBe(422);
    expect(await errorOf(response)).toBe('pii_blocked');
    expect(proxy.anthropic.messages.calls).toHaveLength(0);
    expect(proxy.memory.ledger.log).toHaveLength(0);
  });
});

describe('CORS', () => {
  it('origen permitido, ajeno con 403, preflight con 204 y sin Origin con token', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(['forgetting']);
    const evil = await call(proxy.app, 'forgetting', requestBody(hypothesisInput()), 'token-pago', {
      origin: 'https://malo.com',
    });
    expect(evil.status).toBe(403);
    expect(await evil.json()).toEqual({ error: 'origin_not_allowed' });
    expect(proxy.rest.calls).toHaveLength(0);

    const preflight = await proxy.app.request('/ai-proxy/ai/forgetting', {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(preflight.status).toBe(204);
    expect(Object.fromEntries(preflight.headers)).toMatchObject({
      'access-control-allow-origin': ORIGIN,
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
      'access-control-max-age': '600',
    });

    const ok = await forgetting(proxy.app);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(ok.headers.get('vary')).toContain('Origin');
    expect(ok.headers.get('cache-control')).toBe('no-store');

    const cli = await proxy.app.request('/ai-proxy/ai/forgetting', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer token-pago' },
      body: JSON.stringify(requestBody(hypothesisInput())),
    });
    expect(cli.status).toBe(200);
    expect(cli.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('exige JSON, limita el tamaño y no devuelve detalles de un error', async () => {
    const proxy = edge({ key: 'mock' });
    const text = await proxy.app.request('/ai-proxy/ai/forgetting', {
      method: 'POST',
      headers: headers('token-pago', { 'content-type': 'text/plain' }),
      body: 'hola',
    });
    expect(text.status).toBe(415);
    const big = await proxy.app.request('/ai-proxy/ai/forgetting', {
      method: 'POST',
      headers: headers(),
      body: 'x'.repeat(70_000),
    });
    expect(big.status).toBe(413);
    expect((await call(proxy.app, 'chat_libre', {}, 'token-medico')).status).toBe(404);
    // Fuera de /ai-proxy no hay nada
    expect((await proxy.app.request('/health')).status).toBe(404);
  });
});

describe('trabajos por lote', () => {
  const JOB_KEY = 'fgt_0123456789abcdef0123456789abcdef';

  it('encolar contesta 202, cuenta el cupo una vez y el estado aplica el permiso', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(['forgetting']);
    const body = { ...requestBody(hypothesisInput()), jobKey: JOB_KEY };
    const first = await call(proxy.app, 'jobs/forgetting', body);
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({
      jobKey: JOB_KEY,
      engine: 'forgetting',
      status: 'queued',
    });
    expect((await call(proxy.app, 'jobs/forgetting', body)).status).toBe(202);
    expect(proxy.memory.ledger.snapshot().users[PAID]?.calls.forgetting).toBe(1);
    expect(proxy.memory.jobs.rows).toHaveLength(1);

    const status = await call(proxy.app, 'jobs/status', { jobKeys: [JOB_KEY] });
    expect(await status.json()).toMatchObject({ jobs: [{ jobKey: JOB_KEY, status: 'queued' }] });
    // Con el motor cerrado no se entrega nada, y Gratis recibe plan_required
    proxy.memory.gate.close('forgetting');
    proxy.advance(61_000);
    const closed = await call(proxy.app, 'jobs/status', { jobKeys: [JOB_KEY] });
    expect(await closed.json()).toEqual({ jobs: [] });
    const free = await call(proxy.app, 'jobs/status', { jobKeys: [JOB_KEY] }, 'token-gratis');
    expect(await errorOf(free)).toBe('plan_required');
  });

  it('restructure por lote es solo del equipo y un motor al momento no se encola', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(AI_ENGINES);
    const body = { ...requestBody(restructureInput()), jobKey: 'rst_0123456789abcdef' };
    expect(await errorOf(await call(proxy.app, 'jobs/restructure', body))).toBe('staff_only');
    expect((await call(proxy.app, 'jobs/restructure', body, 'token-medico')).status).toBe(202);
    expect((await call(proxy.app, 'jobs/weekly_report', body, 'token-medico')).status).toBe(404);
  });

  it('si encolar falla en la base, devuelve el cupo y contesta 500 sin detalles', async () => {
    const proxy = edge({ key: 'mock' });
    await proxy.open(['forgetting']);
    proxy.memory.jobs.enqueueRow = () => {
      throw new Error('postgres dijo algo con datos');
    };
    const response = await call(proxy.app, 'jobs/forgetting', {
      ...requestBody(hypothesisInput()),
      jobKey: JOB_KEY,
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('postgres');
    expect(proxy.memory.ledger.snapshot().users[PAID]?.calls.forgetting).toBe(0);
  });
});
