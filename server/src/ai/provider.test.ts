import { APIError } from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ENGINE_CONTRACTS } from '../../../src/engines/aiContracts.ts';
import { flashcardsInput, hypothesisInput } from '../../../src/ai/testing/aiSamples.ts';
import { DEFAULT_CONFIG } from './config.ts';
import { createAnthropicProvider, createMockProvider, ProviderError } from './provider.ts';
import { fakeApi, fakeMessage } from './testing/fakes.ts';

const LIMITS = () => ({ timeoutMs: 12_345, maxRetries: 3 });
const call = (engine: 'forgetting' | 'flashcards' = 'forgetting') => ({
  engine,
  model: DEFAULT_CONFIG.models[engine],
  system: 'Eres un tutor.',
  user: 'Datos',
  input: engine === 'forgetting' ? hypothesisInput() : flashcardsInput(),
  schema: ENGINE_CONTRACTS[engine].output,
});

describe('proveedor simulado', () => {
  it('calcula la respuesta fija sin red y con tokens aproximados', async () => {
    const result = await createMockProvider().call(call());
    expect(result.raw).toMatchObject({ confidence: 'low' });
    expect(result.model).toBe('respuestas-fijas-v1');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.cacheReadTokens).toBe(0);
  });

  it('da lo mismo para la misma entrada', async () => {
    const provider = createMockProvider();
    expect((await provider.call(call())).raw).toEqual((await provider.call(call())).raw);
  });
});

describe('proveedor de Anthropic', () => {
  const okJson = JSON.stringify({
    hypothesis: null,
    evidence: [],
    confidence: 'low',
    actions: [],
    studentMessage: null,
  });

  it('pide salida estructurada, caché del bloque fijo y las opciones de la configuración', async () => {
    const api = fakeApi([fakeMessage(okJson)]);
    await createAnthropicProvider(api, LIMITS).call(call());
    const request = api.calls[0];
    expect(request?.params.model).toBe('claude-haiku-4-5');
    expect(request?.params.max_tokens).toBe(DEFAULT_CONFIG.models.forgetting.maxTokens);
    expect(request?.params.system).toEqual([
      { type: 'text', text: 'Eres un tutor.', cache_control: { type: 'ephemeral' } },
    ]);
    expect(request?.params.messages).toEqual([{ role: 'user', content: 'Datos' }]);
    expect(request?.params.output_config?.format).toMatchObject({ type: 'json_schema' });
    expect(request?.options).toEqual({ timeout: 12_345, maxRetries: 3 });
  });

  it('no manda esfuerzo a Haiku 4.5 y sí a Sonnet 5.5, y nunca fuerza herramientas ni razonamiento', async () => {
    const haiku = fakeApi([fakeMessage(okJson)]);
    await createAnthropicProvider(haiku, LIMITS).call(call('forgetting'));
    expect(haiku.calls[0]?.params.output_config).not.toHaveProperty('effort');

    const sonnet = fakeApi([fakeMessage('{"cards":[]}')]);
    await createAnthropicProvider(sonnet, LIMITS).call(call('flashcards'));
    expect(sonnet.calls[0]?.params.output_config?.effort).toBe('low');
    for (const api of [haiku, sonnet]) {
      const params = api.calls[0]?.params ?? {};
      expect(params).not.toHaveProperty('tool_choice');
      expect(params).not.toHaveProperty('thinking');
      expect(params).not.toHaveProperty('temperature');
    }
  });

  it('lee el JSON y los tokens, con los de caché', async () => {
    const api = fakeApi([
      fakeMessage(okJson, {
        usage: {
          input_tokens: 300,
          output_tokens: 80,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 700,
        },
      }),
    ]);
    const result = await createAnthropicProvider(api, LIMITS).call(call());
    expect(result.raw).toMatchObject({ hypothesis: null });
    expect(result.usage).toEqual({
      inputTokens: 300,
      outputTokens: 80,
      cacheWriteTokens: 500,
      cacheReadTokens: 700,
    });
    expect(result.problem).toBeUndefined();
  });

  it('cuenta como cero los tokens de caché que la API no informa', async () => {
    const api = fakeApi([
      fakeMessage(okJson, {
        usage: { cache_creation_input_tokens: null, cache_read_input_tokens: null },
      }),
    ]);
    const result = await createAnthropicProvider(api, LIMITS).call(call());
    expect(result.usage.cacheWriteTokens).toBe(0);
    expect(result.usage.cacheReadTokens).toBe(0);
  });

  it('avisa por qué no hay salida para el reintento, sin perder los tokens', async () => {
    const cases: [ReturnType<typeof fakeMessage>, string][] = [
      [fakeMessage('{"a":', { stop: 'max_tokens' }), 'La respuesta se cortó por tamaño'],
      [fakeMessage('no es json'), 'La respuesta no es un JSON válido'],
      [fakeMessage(null), 'La respuesta no trajo texto'],
    ];
    for (const [message, problem] of cases) {
      const result = await createAnthropicProvider(fakeApi([message]), LIMITS).call(call());
      expect(result.problem).toBe(problem);
      expect(result.usage.inputTokens).toBe(1000);
    }
  });

  it('una negativa del modelo es una falla del proveedor', async () => {
    const api = fakeApi([fakeMessage(null, { stop: 'refusal' })]);
    await expect(createAnthropicProvider(api, LIMITS).call(call())).rejects.toMatchObject({
      kind: 'provider_error',
    });
  });

  it('traduce los errores de la API sin copiar lo que contestó', async () => {
    const make = (status: number) =>
      APIError.generate(
        status,
        { error: { message: 'secreto del servidor' } },
        'detalle',
        new Headers(),
      );
    const kinds: [Error, string, number | undefined][] = [
      [make(429), 'rate_limited', 429],
      [make(401), 'provider_error', 401],
      [make(500), 'provider_error', 500],
      [new Error('algo interno'), 'provider_error', undefined],
    ];
    for (const [error, kind, status] of kinds) {
      const failure = await createAnthropicProvider(fakeApi([error]), LIMITS)
        .call(call())
        .catch((caught: unknown) => caught);
      expect(failure).toBeInstanceOf(ProviderError);
      expect((failure as ProviderError).kind).toBe(kind);
      expect((failure as ProviderError).status).toBe(status);
      expect((failure as ProviderError).message).not.toContain('secreto');
    }
  });

  it('distingue una conexión caída', async () => {
    const connection = APIError.generate(undefined, undefined, 'fallo de red', new Headers());
    const failure = await createAnthropicProvider(fakeApi([connection]), LIMITS)
      .call(call())
      .catch((caught: unknown) => caught);
    expect((failure as ProviderError).kind).toBe('provider_error');
    expect((failure as ProviderError).message).toContain('conectar');
  });
});
