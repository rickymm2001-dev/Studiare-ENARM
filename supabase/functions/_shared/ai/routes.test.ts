import { APIUserAbortError } from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '../../../../src/ai/testing/aiSamples.ts';
import { DEFAULT_CONFIG, type AiConfig } from './config.ts';
import { ACADEMIC_SOURCE_KEYS } from './engines/academicSources.ts';
import { AI_ENGINES } from './engines/aiContracts.ts';
import { mockHypothesis } from './engines/aiMock.ts';
import { alwaysOpenGate } from './gate.ts';
import { DayLedger } from './ledger.ts';
import { bundledPromptSets } from './prompts.ts';
import { createAnthropicProvider, createMockProvider, type AiProvider } from './provider.ts';
import { worstCaseCostUsd } from './run.ts';
import { createAiRoutes, healthOf, type AiRoutesDeps } from './routes.ts';
import { fakeApi, fakeMessage, requestBody, STUDENT } from './testing/fakes.ts';
import { MemoryJobStore } from './testing/memory.ts';

const OTHER_STUDENT = '01HZX0000000000000000000BB';
/** Sin token es el dueño, como en el proxy de desarrollo. Con token, el alumno de pago de ese id */
const HEADERS = { 'content-type': 'application/json' };
const studentHeaders = (id = STUDENT) => ({ ...HEADERS, authorization: `Bearer ${id}` });

/** Las rutas con el núcleo solo. Prompts generados, libro y cola en memoria y todo abierto */
function coreDeps(
  provider: (config: () => AiConfig) => AiProvider = () => createMockProvider(),
  saveConfig?: AiRoutesDeps['saveConfig'],
): AiRoutesDeps & { ledger: DayLedger } {
  let config = DEFAULT_CONFIG;
  const getConfig = () => config;
  const prompts = bundledPromptSets();
  return {
    provider: provider(getConfig),
    prompts,
    config: getConfig,
    setConfig: (next) => {
      config = next;
    },
    ...(saveConfig ? { saveConfig } : {}),
    ledger: new DayLedger(),
    jobs: new MemoryJobStore(),
    gate: alwaysOpenGate(getConfig, prompts),
    identify: (authorization) => {
      const id = /^Bearer (.+)$/.exec(authorization ?? '')?.[1];
      return Promise.resolve({
        ok: true,
        caller: id
          ? { userId: id, role: 'student', paid: true }
          : { userId: 'dueno-local-0001', role: 'owner', paid: true },
      });
    },
    sourceKeys: new Set<string>(ACADEMIC_SOURCE_KEYS),
  };
}

const appOf = (ai: AiRoutesDeps) => new Hono().route('/ai', createAiRoutes(ai));

function mockApp() {
  const ai = coreDeps();
  return { app: appOf(ai), ai };
}

function realApp(replies: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(replies);
  const ai = coreDeps((config) => createAnthropicProvider(api, () => config().limits));
  return { app: appOf(ai), ai, api };
}

const post = (
  app: ReturnType<typeof appOf>,
  engine: string,
  body: unknown,
  headers: Record<string, string> = studentHeaders(),
) => app.request(`/ai/${engine}`, { method: 'POST', headers, body: JSON.stringify(body) });

describe('POST /ai/:engine en modo simulado', () => {
  const samples = {
    forgetting: hypothesisInput(),
    weekly_report: weeklyReportInput(),
    flashcards: flashcardsInput(),
    bias_tips: biasTipInput(),
    restructure: restructureInput(),
  } as const;

  it.each(AI_ENGINES)('atiende el motor %s', async (engine) => {
    const { app } = mockApp();
    // Como el dueño, que usa los cinco motores, también restructure
    const response = await post(app, engine, requestBody(samples[engine] as never), HEADERS);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { output: unknown; meta: Record<string, unknown> };
    expect(body.output).toBeDefined();
    expect(body.meta).toMatchObject({ engine, mode: 'mock', outcome: 'ok' });
  });

  it('responde 404 a un motor que no existe', async () => {
    const { app } = mockApp();
    expect((await post(app, 'chat_libre', requestBody(hypothesisInput()))).status).toBe(404);
  });

  it('responde 400 a un cuerpo roto, a una envoltura inválida y a una entrada inválida', async () => {
    const { app } = mockApp();
    const raw = await app.request('/ai/forgetting', {
      method: 'POST',
      headers: studentHeaders(),
      body: '{ no es json',
    });
    expect(raw.status).toBe(400);
    expect((await post(app, 'forgetting', { input: hypothesisInput() })).status).toBe(400);
    expect(
      (
        await post(
          app,
          'forgetting',
          requestBody(hypothesisInput(), { studentRef: 'ana@correo.com' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          app,
          'forgetting',
          requestBody({ ...hypothesisInput(), rule: 'chisme' } as never),
        )
      ).status,
    ).toBe(400);
    const error = (await (await post(app, 'forgetting', requestBody({} as never))).json()) as {
      error: string;
    };
    expect(error.error).toBe('invalid_request');
  });
});

describe('tamaño y datos personales', () => {
  it('responde 413 cuando la entrada pasa el tamaño del motor', async () => {
    const { app } = mockApp();
    const item = (index: number) => ({
      ref: `q-${index}`,
      kind: 'question' as const,
      text: 'a'.repeat(790),
    });
    const big = hypothesisInput({
      evidence: Array.from({ length: 12 }, (_, index) => item(index)),
    });
    const response = await post(app, 'forgetting', requestBody(big));
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: string }).error).toBe('input_too_large');
  });

  it('bloquea correos, teléfonos, CURP y nombres del perfil con 422 y no llama al modelo', async () => {
    const { app, api } = realApp([fakeMessage(JSON.stringify(mockHypothesis(hypothesisInput())))]);
    const withText = (text: string) =>
      hypothesisInput({
        evidence: [{ ref: 'q-01', kind: 'question', text }, ...hypothesisInput().evidence.slice(1)],
      });
    const cases = [
      withText('Escribe a ana.perez@correo.com para el caso'),
      withText('Llama al 55 1234 5678 si hay dudas'),
      withText('CURP PEPA900101HDFRRN09 del paciente'),
    ];
    for (const input of cases) {
      const response = await post(app, 'forgetting', requestBody(input));
      expect(response.status).toBe(422);
      expect(((await response.json()) as { error: string }).error).toBe('pii_blocked');
    }
    const named = await post(
      app,
      'forgetting',
      requestBody(withText('El caso de Ricardo Moreno con neumonía'), {
        blockedNames: ['Ricardo Moreno'],
      }),
    );
    expect(named.status).toBe(422);
    expect(api.calls).toHaveLength(0);
  });

  it('un texto limpio con cifras clínicas pasa', async () => {
    const { app } = mockApp();
    const clean = hypothesisInput({
      evidence: [
        { ref: 'q-01', kind: 'question', text: 'Paciente de 70 años con TA 120/80 y FC 88 lpm.' },
        { ref: 'q-02', kind: 'question', text: 'Mujer de 30 años con fiebre de 38.5 grados.' },
      ],
    });
    expect((await post(app, 'forgetting', requestBody(clean))).status).toBe(200);
  });
});

describe('límites', () => {
  it('frena al alumno que pasa su límite diario con 429 y un mensaje claro', async () => {
    const { app, ai } = mockApp();
    ai.setConfig({
      ...ai.config(),
      limits: {
        ...ai.config().limits,
        perStudentPerDay: { ...ai.config().limits.perStudentPerDay, forgetting: 2 },
      },
    });
    const send = () => post(app, 'forgetting', requestBody(hypothesisInput()));
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: 'student_limit',
      message: 'Llegaste al límite de usos de IA de hoy. Vuelve mañana.',
    });
    // Otro alumno sigue
    const other = await post(
      app,
      'forgetting',
      requestBody(hypothesisInput()),
      studentHeaders(OTHER_STUDENT),
    );
    expect(other.status).toBe(200);
  });

  it('frena a todos cuando se acaba el presupuesto del día', async () => {
    const good = JSON.stringify(mockHypothesis(hypothesisInput()));
    const { app, ai } = realApp([
      fakeMessage(good, { usage: { input_tokens: 1_000_000, output_tokens: 0 } }),
    ]);
    ai.setConfig({ ...ai.config(), limits: { ...ai.config().limits, dailyBudgetUsd: 0.5 } });
    const first = await post(app, 'forgetting', requestBody(hypothesisInput()));
    expect(first.status).toBe(200);
    expect(
      ((await first.json()) as { meta: { estimatedCostUsd: number } }).meta.estimatedCostUsd,
    ).toBe(1);
    const second = await post(
      app,
      'forgetting',
      requestBody(hypothesisInput()),
      studentHeaders(OTHER_STUDENT),
    );
    expect(second.status).toBe(429);
    expect(((await second.json()) as { error: string }).error).toBe('budget_exceeded');
  });
});

describe('reserva del peor costo (revisión del hallazgo 1)', () => {
  const good = JSON.stringify(mockHypothesis(hypothesisInput()));

  /** El libro del núcleo, pero anotando lo que le piden */
  function spyLedger(ai: { ledger: DayLedger }) {
    const seen = {
      admit: [] as (number | undefined)[],
      settle: [] as (number | undefined)[],
      release: [] as (number | undefined)[],
    };
    const { ledger } = ai;
    const admit = ledger.admit.bind(ledger);
    const settle = ledger.settle.bind(ledger);
    const release = ledger.release.bind(ledger);
    ledger.admit = (input) => {
      seen.admit.push(input.reserveUsd);
      return admit(input);
    };
    ledger.settle = (input) => {
      seen.settle.push(input.reservedUsd);
      return settle(input);
    };
    ledger.release = (input) => {
      seen.release.push(input.reservedUsd);
      return release(input);
    };
    return seen;
  }

  it('reserva el peor costo al admitir y lo devuelve al asentar, sin dejar nada en vuelo', async () => {
    const { app, ai } = realApp([fakeMessage(good)]);
    const seen = spyLedger(ai);
    expect((await post(app, 'forgetting', requestBody(hypothesisInput()))).status).toBe(200);
    const worst = worstCaseCostUsd(
      { config: ai.config(), prompts: ai.prompts },
      'forgetting',
      hypothesisInput(),
    );
    expect(worst).toBeGreaterThan(0);
    expect(seen).toEqual({ admit: [worst], settle: [worst], release: [] });
    expect(ai.ledger.snapshot().users[STUDENT]?.reserved).toEqual({});
  });

  it('una llamada que falla en el modelo también devuelve la reserva al asentarse', async () => {
    const { app, ai } = realApp([new Error('se cayó')]);
    const seen = spyLedger(ai);
    expect((await post(app, 'forgetting', requestBody(hypothesisInput()))).status).toBe(502);
    expect(seen.settle).toEqual(seen.admit);
    expect(seen.admit[0]).toBeGreaterThan(0);
    expect(ai.ledger.snapshot().users[STUDENT]?.reserved).toEqual({});
  });

  it('un error nuestro después de admitir devuelve el cupo y la misma reserva', async () => {
    const { app, ai } = realApp([fakeMessage(good)]);
    const seen = spyLedger(ai);
    // El reloj lanza dentro de runEngine, fuera de lo que atrapa el proveedor
    ai.clock = () => {
      throw new Error('reloj roto');
    };
    expect((await post(app, 'forgetting', requestBody(hypothesisInput()))).status).toBe(500);
    expect(seen.release).toEqual(seen.admit);
    expect(seen.admit[0]).toBeGreaterThan(0);
    expect(seen.settle).toEqual([]);
    expect(ai.ledger.snapshot().users[STUDENT]).toMatchObject({
      calls: { forgetting: 0 },
      reserved: {},
    });
  });

  it('en modo simulado no reserva nada, porque no gasta', async () => {
    const { app, ai } = mockApp();
    const seen = spyLedger(ai);
    expect((await post(app, 'forgetting', requestBody(hypothesisInput()))).status).toBe(200);
    expect(seen).toEqual({ admit: [0], settle: [0], release: [] });
  });

  it('un trabajo por lote no reserva, porque su costo lo cuenta el ciclo de lotes', async () => {
    const { app, ai } = realApp([fakeMessage(good)]);
    const seen = spyLedger(ai);
    const queued = await app.request('/ai/jobs/forgetting', {
      method: 'POST',
      headers: studentHeaders(),
      body: JSON.stringify({ ...requestBody(hypothesisInput()), jobKey: 'fgt_0123456789abcdef' }),
    });
    expect(queued.status).toBe(202);
    expect(seen.admit).toEqual([undefined]);
    expect(ai.ledger.snapshot().users[STUDENT]?.reserved).toBeUndefined();
  });
});

describe('plazo total de la petición (revisión del hallazgo 11)', () => {
  /** Un cliente del SDK que nunca contesta: solo termina si se cancela la señal */
  const hungApi = () => ({
    calls: 0,
    create(_params: unknown, options: { signal?: AbortSignal }) {
      this.calls += 1;
      return new Promise<never>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new APIUserAbortError());
        });
      });
    },
  });

  it('una llamada que no contesta se cancela al vencer el plazo y todavía alcanza a asentar', async () => {
    const api = hungApi();
    const ai = coreDeps((config) => createAnthropicProvider(api, () => config().limits));
    ai.requestDeadlineMs = 50;
    const logs: string[] = [];
    ai.log = (code) => logs.push(code);
    const app = appOf(ai);
    const started = Date.now();
    const response = await post(app, 'forgetting', requestBody(hypothesisInput()));
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toBe('provider_error');
    // Se intentó una sola vez: vencido el plazo no hay reintento por validación
    expect(api.calls).toBe(1);
    // Asentó, con su renglón de bitácora, y la reserva volvió a cero
    expect(ai.ledger.log).toMatchObject([
      { engine: 'forgetting', ok: false, outcome: 'provider_error', userId: STUDENT },
    ]);
    expect(ai.ledger.snapshot().users[STUDENT]).toMatchObject({ reserved: {} });
    expect(logs).toContain('ai.call.deadline_exceeded');
  });

  it('con tiempo de sobra no cambia nada: contesta, y la señal solo se corta al vencer', async () => {
    const good = JSON.stringify(mockHypothesis(hypothesisInput()));
    const { app, api } = realApp([fakeMessage(good)]);
    expect((await post(app, 'forgetting', requestBody(hypothesisInput()))).status).toBe(200);
    const signal = api.calls[0]?.options.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });
});

describe('fallas del modelo', () => {
  it('con salida inválida dos veces responde 502 con lo que costó y la app cae a su plantilla', async () => {
    const invented = JSON.stringify({ ...mockHypothesis(hypothesisInput()), evidence: ['q-99'] });
    const { app, ai } = realApp([fakeMessage(invented), fakeMessage(invented)]);
    const response = await post(app, 'forgetting', requestBody(hypothesisInput()));
    expect(response.status).toBe(502);
    const body = (await response.json()) as {
      error: string;
      message: string;
      cost: { inputTokens: number; estimatedCostUsd: number };
    };
    expect(body.error).toBe('invalid_output');
    expect(body.cost.inputTokens).toBe(2000);
    // El intento fallido también gastó y cuenta contra el presupuesto
    expect((await ai.ledger.summary()).spentUsd).toBe(body.cost.estimatedCostUsd);
  });

  it('nunca devuelve la clave, el detalle de la API ni los datos del alumno', async () => {
    const { app } = realApp([new Error('sk-ant-secreto con datos del alumno')]);
    const response = await post(app, 'forgetting', requestBody(hypothesisInput()));
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toContain('sk-ant');
    expect(text).not.toContain('secreto');
    expect(text).not.toContain(STUDENT);
  });
});

describe('configuración y uso', () => {
  it('GET /ai/config dice el modo, los modelos y las versiones de los prompts, sin claves', async () => {
    const { app } = mockApp();
    const response = await app.request('/ai/config', { headers: HEADERS });
    const body = (await response.json()) as {
      mode: string;
      config: { models: Record<string, { id: string }> };
      prompts: Record<string, string>;
    };
    expect(body.mode).toBe('mock');
    expect(Object.keys(body).sort()).toEqual(['config', 'mode', 'prompts']);
    expect(body.config.models.flashcards?.id).toBe('claude-sonnet-5-5');
    expect(body.prompts.forgetting).toMatch(/^forgetting\.base\.v\d+$/);
    expect(JSON.stringify(body)).not.toMatch(/apiKey|sk-ant/);
  });

  it('GET /ai/usage resume el día', async () => {
    const { app } = mockApp();
    await post(app, 'forgetting', requestBody(hypothesisInput()));
    const body = (await (await app.request('/ai/usage', { headers: HEADERS })).json()) as {
      usage: { calls: number; students: number };
      limits: { perStudentPerDay: Record<string, number> };
    };
    expect(body.usage).toMatchObject({ calls: 1, students: 1 });
    // La forma que lee la pantalla 23, sin campos nuevos que su esquema estricto rechace
    expect(Object.keys(body.usage).sort()).toEqual([
      'byEngine',
      'calls',
      'day',
      'spentUsd',
      'students',
    ]);
    expect(body.limits.perStudentPerDay.forgetting).toBeGreaterThan(0);
  });

  it('PUT /ai/config cambia los límites al instante y los guarda donde diga quien arma', async () => {
    const saved: AiConfig[] = [];
    const ai = coreDeps(undefined, (next) => {
      saved.push(next);
    });
    const app = appOf(ai);
    const put = await app.request('/ai/config', {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({ limits: { perStudentPerDay: { forgetting: 1 } } }),
    });
    expect(put.status).toBe(200);
    expect(ai.config().limits.perStudentPerDay.forgetting).toBe(1);
    expect(ai.config().limits.perStudentPerDay.flashcards).toBe(240);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.limits.perStudentPerDay.forgetting).toBe(1);
    const send = () => post(app, 'forgetting', requestBody(hypothesisInput()));
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });

  it('PUT /ai/config sin dónde guardar cambia solo en memoria y si guardar falla no cambia nada', async () => {
    const { app, ai } = mockApp();
    const put = (target: ReturnType<typeof appOf>) =>
      target.request('/ai/config', {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify({ limits: { dailyBudgetUsd: 2 } }),
      });
    expect((await put(app)).status).toBe(200);
    expect(ai.config().limits.dailyBudgetUsd).toBe(2);
    const failing = coreDeps(undefined, () => Promise.reject(new Error('sin base')));
    const response = await put(appOf(failing));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sin base');
    expect(failing.config().limits.dailyBudgetUsd).toBe(DEFAULT_CONFIG.limits.dailyBudgetUsd);
  });

  it('PUT /ai/config rechaza lo inválido y un modelo sin precio', async () => {
    const { app, ai } = mockApp();
    const put = (body: unknown) =>
      app.request('/ai/config', { method: 'PUT', headers: HEADERS, body: JSON.stringify(body) });
    expect((await put({ apiKey: 'x' })).status).toBe(400);
    expect((await put({ limits: { perStudentPerDay: { forgetting: -3 } } })).status).toBe(400);
    expect(
      (
        await put({
          models: { forgetting: { id: 'claude-sin-precio-1', effort: null, maxTokens: 500 } },
        })
      ).status,
    ).toBe(400);
    // Haiku 4.5 no acepta esfuerzo. Se rechaza al guardar y no a media llamada
    const effort = await put({
      models: { forgetting: { id: 'claude-haiku-4-5', effort: 'low', maxTokens: 1500 } },
    });
    expect(effort.status).toBe(400);
    expect(await effort.json()).toMatchObject({
      message: expect.stringContaining('claude-haiku-4-5 no acepta esfuerzo') as unknown,
    });
    const broken = await app.request('/ai/config', { method: 'PUT', headers: HEADERS, body: '{' });
    expect(broken.status).toBe(400);
    expect(ai.config().models.forgetting.id).toBe('claude-haiku-4-5');
  });
});

describe('salud y permisos del núcleo', () => {
  it('healthOf dice el modo y, sin proveedor, unavailable', async () => {
    const ai = coreDeps();
    expect(await healthOf(ai)).toMatchObject({ status: 'ok', mode: 'mock', version: 2 });
    expect(await healthOf({ ...ai, provider: null })).toMatchObject({ mode: 'unavailable' });
  });

  it('una sesión que no se reconoce no llega a ningún motor', async () => {
    const ai = coreDeps();
    const app = appOf({
      ...ai,
      identify: () => Promise.resolve({ ok: false, failure: 'unavailable' }),
    });
    const response = await post(app, 'forgetting', requestBody(hypothesisInput()));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'unauthorized' });
    expect((await ai.ledger.summary()).calls).toBe(0);
  });

  it('si la configuración guardada no se puede leer, no atiende a ciegas', async () => {
    const ai = coreDeps();
    const app = appOf({ ...ai, refreshConfig: () => Promise.reject(new Error('sin base')) });
    const response = await post(app, 'forgetting', requestBody(hypothesisInput()));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'not_configured' });
  });

  it('el sobre puede traer otro alumno, pero cuenta la cuenta de la sesión', async () => {
    const { app, ai } = mockApp();
    await post(app, 'forgetting', requestBody(hypothesisInput(), { studentRef: OTHER_STUDENT }));
    expect(Object.keys(ai.ledger.snapshot().users)).toEqual([STUDENT]);
  });
});
