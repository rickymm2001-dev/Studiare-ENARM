import { APIError } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { describe, expect, it } from 'vitest';
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '../../../../src/ai/testing/aiSamples.ts';
import { DEFAULT_CONFIG } from './config.ts';
import { estimateCostUsd } from './cost.ts';
import { AI_ENGINES, ENGINE_CONTRACTS } from './engines/aiContracts.ts';
import { mockHypothesis } from './engines/aiMock.ts';
import { buildUserMessage, bundledPromptSets } from './prompts.ts';
import { createAnthropicProvider, createMockProvider, type AiProvider } from './provider.ts';
import { runEngine, validateOutput, worstCaseCostUsd, type RunDeps } from './run.ts';
import { refusalMessage, spendLimitError } from './testing/fakeAnthropic.ts';
import { fakeApi, fakeMessage } from './testing/fakes.ts';

const prompts = bundledPromptSets();
const SOURCE_KEYS = new Set(['harrison', 'nom']);
const deps = (provider: AiProvider, clock?: () => number): RunDeps => ({
  provider,
  prompts,
  config: DEFAULT_CONFIG,
  sourceKeys: SOURCE_KEYS,
  ...(clock ? { clock } : {}),
});
const real = (api: ReturnType<typeof fakeApi>) =>
  createAnthropicProvider(api, () => DEFAULT_CONFIG.limits);

const input = hypothesisInput();
const good = JSON.stringify(mockHypothesis(input));

describe('los esquemas de salida se convierten a JSON Schema para el SDK', () => {
  it.each(AI_ENGINES)('motor %s', (engine) => {
    const format = zodOutputFormat(ENGINE_CONTRACTS[engine].output);
    expect(format.type).toBe('json_schema');
    expect(format.schema).toMatchObject({ type: 'object' });
  });
});

describe('modo simulado', () => {
  it('corre cada motor con su respuesta fija y no cuesta', async () => {
    const samples = {
      forgetting: input,
      weekly_report: weeklyReportInput(),
      flashcards: flashcardsInput(),
      bias_tips: biasTipInput(),
      restructure: restructureInput(),
    };
    for (const engine of AI_ENGINES) {
      const result = await runEngine(deps(createMockProvider()), engine, samples[engine] as never);
      expect(result.ok, engine).toBe(true);
      if (!result.ok) continue;
      expect(result.meta).toMatchObject({
        engine,
        mode: 'mock',
        model: 'respuestas-fijas-v1',
        outcome: 'ok',
        validator: { passed: true },
      });
      expect(result.meta.promptVersion).toBe(prompts[engine].version);
      expect(result.meta.inputTokens).toBeGreaterThan(0);
    }
  });
});

describe('modo real con cliente falso', () => {
  it('calcula el costo con el precio del modelo del motor', async () => {
    const api = fakeApi([
      fakeMessage(good, {
        usage: { input_tokens: 2000, output_tokens: 500, cache_read_input_tokens: 4000 },
      }),
    ]);
    let tick = 0;
    const result = await runEngine(
      deps(real(api), () => (tick += 40)),
      'forgetting',
      input,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta).toMatchObject({
      mode: 'real',
      model: 'claude-haiku-4-5',
      outcome: 'ok',
      estimatedCostUsd: 0.0049,
      latencyMs: 40,
    });
  });

  it('manda al modelo el prompt del motor y los datos entre marcas', async () => {
    const api = fakeApi([fakeMessage(good)]);
    await runEngine(deps(real(api)), 'forgetting', input);
    const params = api.calls[0]?.params;
    expect(JSON.stringify(params?.system)).toContain('Motor de olvidos');
    expect(JSON.stringify(params?.messages)).toContain('<datos>');
    expect(JSON.stringify(params?.messages)).toContain('q-01');
  });

  it('si la salida no cumple el esquema reintenta una vez con el motivo y suma los dos costos', async () => {
    const api = fakeApi([fakeMessage('{"hypothesis":"x","confidence":"high"}'), fakeMessage(good)]);
    const result = await runEngine(deps(real(api)), 'forgetting', input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.outcome).toBe('retried_ok');
    expect(result.meta.inputTokens).toBe(2000);
    expect(api.calls).toHaveLength(2);
    expect(JSON.stringify(api.calls[1]?.params.messages)).toContain('Tu respuesta anterior');
    expect(JSON.stringify(api.calls[1]?.params.messages)).toContain('confidence');
  });

  it('si falla una guarda de anclaje reintenta con la explicación de la guarda', async () => {
    const invented = JSON.stringify({ ...mockHypothesis(input), evidence: ['q-99'] });
    const api = fakeApi([fakeMessage(invented), fakeMessage(good)]);
    const result = await runEngine(deps(real(api)), 'forgetting', input);
    expect(result.ok && result.meta.outcome).toBe('retried_ok');
    expect(JSON.stringify(api.calls[1]?.params.messages)).toContain(
      'Citaste evidencia que no está en los datos',
    );
  });

  it('si el JSON viene cortado o roto reintenta con ese motivo', async () => {
    const api = fakeApi([fakeMessage('{"hypo', { stop: 'max_tokens' }), fakeMessage(good)]);
    const result = await runEngine(deps(real(api)), 'forgetting', input);
    expect(result.ok && result.meta.outcome).toBe('retried_ok');
    expect(JSON.stringify(api.calls[1]?.params.messages)).toContain('se cortó por tamaño');
  });

  it('con dos fallas seguidas no devuelve nada y dice lo que costó', async () => {
    const invented = JSON.stringify({ ...mockHypothesis(input), evidence: ['q-99'] });
    const api = fakeApi([fakeMessage(invented), fakeMessage(invented)]);
    const result = await runEngine(deps(real(api)), 'forgetting', input);
    expect(result).toMatchObject({
      ok: false,
      error: 'invalid_output',
      cost: { model: 'claude-haiku-4-5', inputTokens: 2000, outputTokens: 400 },
    });
    expect(api.calls).toHaveLength(2);
    if (!result.ok) expect(result.cost.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('una falla del proveedor corta sin reintentar', async () => {
    const limited = APIError.generate(429, {}, 'saturado', new Headers());
    const api = fakeApi([limited]);
    const result = await runEngine(deps(real(api)), 'forgetting', input);
    expect(result).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(api.calls).toHaveLength(1);
    const broken = await runEngine(
      deps(real(fakeApi([new Error('otra cosa')]))),
      'forgetting',
      input,
    );
    expect(broken).toMatchObject({ ok: false, error: 'provider_error', outcome: 'provider_error' });
  });

  it('una negativa no se reintenta, cuesta lo que usó y guarda su categoría', async () => {
    const api = fakeApi([refusalMessage('general_harms'), fakeMessage(good)]);
    const result = await runEngine(deps(real(api)), 'forgetting', input);
    expect(result).toMatchObject({
      ok: false,
      error: 'refused',
      outcome: 'refused',
      refusalCategory: 'general_harms',
      message: 'La IA no atendió esta petición. Se usa la versión sin IA.',
      cost: { inputTokens: 1000 },
    });
    expect(api.calls).toHaveLength(1);
  });

  it('el límite de gasto de Anthropic sale como pausa y queda como org_limit', async () => {
    const result = await runEngine(deps(real(fakeApi([spendLimitError()]))), 'forgetting', input);
    expect(result).toMatchObject({ ok: false, error: 'paused', outcome: 'org_limit' });
  });

  it('un error del cliente sale como invalid_output con su resultado para la bitácora', async () => {
    const invented = JSON.stringify({ ...mockHypothesis(input), evidence: ['q-99'] });
    const result = await runEngine(
      deps(real(fakeApi([fakeMessage(invented), fakeMessage(invented)]))),
      'forgetting',
      input,
    );
    expect(result).toMatchObject({ outcome: 'invalid_output', refusalCategory: null });
  });
});

describe('validateOutput, que comparten el camino al momento y los lotes', () => {
  it('pasa lo bueno, dice por qué falla el esquema y por qué falla una guarda', () => {
    expect(validateOutput('forgetting', mockHypothesis(input), input, SOURCE_KEYS)).toMatchObject({
      ok: true,
    });
    expect(validateOutput('forgetting', { hypothesis: 1 }, input, SOURCE_KEYS)).toMatchObject({
      ok: false,
      schemaValid: false,
    });
    const invented = { ...mockHypothesis(input), evidence: ['q-99'] };
    expect(validateOutput('forgetting', invented, input, SOURCE_KEYS)).toMatchObject({
      ok: false,
      schemaValid: true,
      issues: [expect.stringContaining('Citaste evidencia') as unknown],
    });
  });
});

describe('tarjetas', () => {
  const text = flashcardsInput();
  const valid = {
    kind: 'basic',
    front: '¿Cuál es el tratamiento inicial de elección en la diabetes mellitus tipo 2?',
    back: 'La metformina',
    quote: 'La metformina es el tratamiento inicial de elección en la diabetes mellitus tipo 2.',
  };

  it('devuelve solo las tarjetas ancladas y dice qué se descartó', async () => {
    const invented = {
      ...valid,
      quote: 'La insulina es el tratamiento inicial de elección siempre.',
    };
    const api = fakeApi([fakeMessage(JSON.stringify({ cards: [valid, invented] }))]);
    const result = await runEngine(deps(real(api)), 'flashcards', text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.output as { cards: unknown[] }).cards).toEqual([valid]);
    expect(result.meta.outcome).toBe('ok');
    expect(result.meta.validator.issues).toContain(
      'La cita no aparece tal cual en el texto de origen',
    );
  });

  it('rechaza una controversia que cita una fuente fuera de la lista cerrada', async () => {
    const flagged = {
      ...valid,
      controversy: { reason: 'x'.repeat(40), sources: [{ key: 'wikipedia', locator: null }] },
    };
    const api = fakeApi([fakeMessage(JSON.stringify({ cards: [flagged] }))]);
    const result = await runEngine(deps(real(api)), 'flashcards', text);
    // Ninguna tarjeta se salva en los dos intentos
    expect(result).toMatchObject({ ok: false, error: 'invalid_output' });
  });

  it('un texto sin nada que estudiar puede dar cero tarjetas', async () => {
    const api = fakeApi([fakeMessage('{"cards":[]}')]);
    const result = await runEngine(deps(real(api)), 'flashcards', text);
    expect(result.ok && (result.output as { cards: unknown[] }).cards).toEqual([]);
  });
});

describe('peor costo de una llamada, para reservarlo al admitirla', () => {
  const inputs = {
    forgetting: hypothesisInput(),
    weekly_report: weeklyReportInput(),
    flashcards: flashcardsInput(),
    bias_tips: biasTipInput(),
    restructure: restructureInput(),
  };

  it('cubre lo que cobra una llamada que llena max_tokens en sus dos intentos', () => {
    for (const engine of AI_ENGINES) {
      const worst = worstCaseCostUsd({ config: DEFAULT_CONFIG, prompts }, engine, inputs[engine]);
      const model = DEFAULT_CONFIG.models[engine];
      const price = DEFAULT_CONFIG.prices[model.id];
      if (!price) throw new Error('Falta precio');
      // La salida llena en los dos intentos y el prompt entero en cada uno, a la tarifa de entrada
      const text = `${prompts[engine].text}${buildUserMessage(inputs[engine])}`;
      const floor = estimateCostUsd(price, {
        inputTokens: Math.ceil(text.length / 4) * 2,
        outputTokens: model.maxTokens * 2,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
      });
      expect(worst, engine).toBeGreaterThanOrEqual(floor);
      // Y no se pasa de largo, que bloquearía a quien llama de una en una
      expect(worst, engine).toBeLessThan(floor * 1.5);
    }
  });

  it('crece con max_tokens y con el modelo, y sin precio no reserva nada', () => {
    const base = worstCaseCostUsd(
      { config: DEFAULT_CONFIG, prompts },
      'flashcards',
      inputs.flashcards,
    );
    // Sonnet 5.5 con 6,000 tokens de salida y dos intentos pasa de 0.12 dólares
    expect(base).toBeGreaterThan(0.12);
    expect(base).toBeLessThan(0.2);
    const bigger = {
      ...DEFAULT_CONFIG,
      models: {
        ...DEFAULT_CONFIG.models,
        flashcards: { ...DEFAULT_CONFIG.models.flashcards, maxTokens: 12_000 },
      },
    };
    expect(
      worstCaseCostUsd({ config: bigger, prompts }, 'flashcards', inputs.flashcards),
    ).toBeGreaterThan(base * 1.9);
    const noPrice = { ...DEFAULT_CONFIG, prices: {} };
    expect(worstCaseCostUsd({ config: noPrice, prompts }, 'flashcards', inputs.flashcards)).toBe(0);
  });
});
