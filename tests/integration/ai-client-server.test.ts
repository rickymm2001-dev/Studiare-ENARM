// El cliente de IA contra el proxy de verdad, sin red. Comprueba que los dos hablan el mismo
// formato en los cinco motores, que los límites del proxy llegan a la app con su mensaje y que lo
// que cuesta una llamada real queda en la bitácora.
import { describe, expect, it } from 'vitest';
import { callEngine, type CallOptions } from '@/ai/engines';
import { urlOf } from '@/ai/testing/fetch';
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '@/ai/testing/aiSamples';
import { AI_ENGINES } from '@/engines/aiContracts';
import { mockHypothesis } from '@/engines/aiMock';
import { createAiDeps } from '../../server/src/ai/index.ts';
import { createAnthropicProvider } from '../../server/src/ai/provider.ts';
import { fakeApi, fakeMessage } from '../../server/src/ai/testing/fakes.ts';
import { createApp } from '../../server/src/app.ts';

const STUDENT = '01HZX0000000000000000000AA';
const SAMPLES = {
  forgetting: hypothesisInput(),
  weekly_report: weeklyReportInput(),
  flashcards: flashcardsInput(),
  bias_tips: biasTipInput(),
  restructure: restructureInput(),
} as const;

function proxyFetch(app: ReturnType<typeof createApp>): typeof fetch {
  return (url, init) =>
    Promise.resolve(
      app.request(urlOf(url).replace(/^\/api/, ''), {
        ...init,
        headers: {
          host: '127.0.0.1:8787',
          origin: 'http://127.0.0.1:5173',
          ...(init?.headers as Record<string, string> | undefined),
        },
      }),
    );
}

const files = { config: null, ledger: null };

describe('app y proxy en modo simulado', () => {
  const ai = createAiDeps({ credentials: { mode: 'mock', apiKey: null }, files });
  const app = createApp({ mode: 'mock', ai });
  const options: CallOptions = {
    status: { kind: 'mock' },
    studentRef: STUDENT,
    fetchImpl: proxyFetch(app),
  };

  it.each(AI_ENGINES)('el motor %s va y vuelve con el formato acordado', async (engine) => {
    const result = await callEngine(engine, SAMPLES[engine] as never, options);
    expect(result.ok, engine).toBe(true);
    if (!result.ok) return;
    expect(result.meta).toMatchObject({ engine, mode: 'mock', outcome: 'ok' });
    expect(result.meta.promptVersion).toMatch(new RegExp(`^${engine}\\.`));
  });
});

describe('app y proxy con un modelo falso', () => {
  it('lo que cuesta una llamada llega a la app y el límite diario llega con su mensaje', async () => {
    const good = JSON.stringify(mockHypothesis(hypothesisInput()));
    const api = fakeApi([fakeMessage(good, { usage: { input_tokens: 5000, output_tokens: 300 } })]);
    const ai = createAiDeps({
      credentials: { mode: 'real', apiKey: 'no-se-usa' },
      files,
      provider: (config) => createAnthropicProvider(api, () => config().limits),
    });
    ai.setConfig({
      ...ai.config(),
      limits: {
        ...ai.config().limits,
        perStudentPerDay: { ...ai.config().limits.perStudentPerDay, forgetting: 1 },
      },
    });
    const app = createApp({ mode: 'real', ai });
    const options: CallOptions = {
      status: { kind: 'real' },
      studentRef: STUDENT,
      fetchImpl: proxyFetch(app),
    };

    const first = await callEngine('forgetting', hypothesisInput(), options);
    expect(first.ok && first.meta).toMatchObject({
      mode: 'real',
      model: 'claude-haiku-4-5',
      inputTokens: 5000,
      outputTokens: 300,
      estimatedCostUsd: 0.0065,
    });

    const second = await callEngine('forgetting', hypothesisInput(), options);
    expect(second).toMatchObject({
      ok: false,
      reason: 'student_limit',
      message: 'Llegaste al límite de usos de IA de hoy. Vuelve mañana.',
    });
    expect(api.calls).toHaveLength(1);
  });

  it('un modelo que inventa evidencia no llega al alumno y lo que gastó queda a la vista', async () => {
    const invented = JSON.stringify({ ...mockHypothesis(hypothesisInput()), evidence: ['q-99'] });
    const api = fakeApi([fakeMessage(invented), fakeMessage(invented)]);
    const ai = createAiDeps({
      credentials: { mode: 'real', apiKey: 'no-se-usa' },
      files,
      provider: (config) => createAnthropicProvider(api, () => config().limits),
    });
    const result = await callEngine('forgetting', hypothesisInput(), {
      status: { kind: 'real' },
      studentRef: STUDENT,
      fetchImpl: proxyFetch(createApp({ mode: 'real', ai })),
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid_output',
      meta: { outcome: 'fallback', inputTokens: 2000 },
    });
  });
});
