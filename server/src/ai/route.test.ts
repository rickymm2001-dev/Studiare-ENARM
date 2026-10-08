import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '../../../src/ai/testing/aiSamples.ts';
import { AI_ENGINES } from '../../../src/engines/aiContracts.ts';
import { mockHypothesis } from '../../../src/engines/aiMock.ts';
import { createApp } from '../app.ts';
import { createAiDeps } from './index.ts';
import { createAnthropicProvider } from './provider.ts';
import { fakeApi, fakeMessage, requestBody, STUDENT } from './testing/fakes.ts';

const HEADERS = {
  host: '127.0.0.1:8787',
  origin: 'http://127.0.0.1:5173',
  'content-type': 'application/json',
};
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function mockApp() {
  const ai = createAiDeps({
    credentials: { mode: 'mock', apiKey: null },
    files: { config: null, ledger: null },
  });
  return { app: createApp({ mode: 'mock', ai }), ai };
}

function realApp(replies: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(replies);
  const ai = createAiDeps({
    credentials: { mode: 'real', apiKey: 'no-se-usa' },
    files: { config: null, ledger: null },
    provider: (config) => createAnthropicProvider(api, () => config().limits),
  });
  return { app: createApp({ mode: 'real', ai }), ai, api };
}

const post = (
  app: ReturnType<typeof createApp>,
  engine: string,
  body: unknown,
  headers = HEADERS,
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
    const response = await post(app, engine, requestBody(samples[engine] as never));
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
      headers: HEADERS,
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

  it('exige JSON y respeta el filtro de Host y de Origin del proxy', async () => {
    const { app } = mockApp();
    const body = JSON.stringify(requestBody(hypothesisInput()));
    const text = await app.request('/ai/forgetting', {
      method: 'POST',
      headers: { ...HEADERS, 'content-type': 'text/plain' },
      body,
    });
    expect(text.status).toBe(415);
    const origin = await app.request('/ai/forgetting', {
      method: 'POST',
      headers: { ...HEADERS, origin: 'https://evil.example' },
      body,
    });
    expect(origin.status).toBe(403);
    const host = await app.request('/ai/forgetting', {
      method: 'POST',
      headers: { ...HEADERS, host: 'evil.example' },
      body,
    });
    expect(host.status).toBe(403);
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
      requestBody(hypothesisInput(), { studentRef: '01HZX0000000000000000000BB' }),
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
      requestBody(hypothesisInput(), { studentRef: '01HZX0000000000000000000BB' }),
    );
    expect(second.status).toBe(429);
    expect(((await second.json()) as { error: string }).error).toBe('budget_exceeded');
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
    expect(ai.ledger.summary().spentUsd).toBe(body.cost.estimatedCostUsd);
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
    expect(body.limits.perStudentPerDay.forgetting).toBeGreaterThan(0);
  });

  it('PUT /ai/config cambia los límites al instante y los guarda en el archivo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-route-'));
    dirs.push(dir);
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
    const send = () => post(app, 'forgetting', requestBody(hypothesisInput()));
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
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
    const broken = await app.request('/ai/config', { method: 'PUT', headers: HEADERS, body: '{' });
    expect(broken.status).toBe(400);
    expect(ai.config().models.forgetting.id).toBe('claude-haiku-4-5');
  });
});
