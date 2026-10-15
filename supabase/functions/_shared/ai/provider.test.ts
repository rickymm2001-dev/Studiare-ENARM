import { APIError } from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { flashcardsInput, hypothesisInput } from '../../../../src/ai/testing/aiSamples.ts';
import { DEFAULT_CONFIG, type ModelChoice } from './config.ts';
import { ENGINE_CONTRACTS } from './engines/aiContracts.ts';
import {
  buildMessageParams,
  createAnthropicProvider,
  createMockProvider,
  ProviderError,
  readMessage,
  toProviderError,
} from './provider.ts';
import {
  rateLimitError,
  refusalMessage,
  spendLimitError,
  thinkingFirstMessage,
  workspaceLimitError,
} from './testing/fakeAnthropic.ts';
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

  it('una negativa del modelo trae su categoría y sus tokens, sin salida que revisar', async () => {
    const api = fakeApi([refusalMessage('bio')]);
    const result = await createAnthropicProvider(api, LIMITS).call(call());
    expect(result.refusal).toEqual({ category: 'bio' });
    expect(result.raw).toBeUndefined();
    expect(result.problem).toBeUndefined();
    expect(result.usage.inputTokens).toBe(1000);
    const uncategorized = await createAnthropicProvider(
      fakeApi([fakeMessage(null, { stop: 'refusal' })]),
      LIMITS,
    ).call(call());
    expect(uncategorized.refusal).toEqual({ category: null });
  });

  it('lee el texto aunque antes venga un bloque de razonamiento', async () => {
    const result = await createAnthropicProvider(
      fakeApi([thinkingFirstMessage(okJson)]),
      LIMITS,
    ).call(call());
    expect(result.raw).toMatchObject({ confidence: 'low' });
    expect(readMessage(thinkingFirstMessage(okJson)).problem).toBeUndefined();
  });

  it('el límite de gasto de la organización y del espacio de trabajo son org_limit', async () => {
    for (const error of [spendLimitError(), workspaceLimitError()]) {
      const failure = await createAnthropicProvider(fakeApi([error]), LIMITS)
        .call(call())
        .catch((caught: unknown) => caught);
      expect(failure).toBeInstanceOf(ProviderError);
      expect((failure as ProviderError).kind).toBe('org_limit');
    }
    expect(toProviderError(rateLimitError()).kind).toBe('rate_limited');
  });

  it('reconoce el límite de gasto donde venga en el cuerpo, no solo en error.details.error_code (revisión del hallazgo 7)', () => {
    // Nadie confirmó en qué campo llega el código. Se busca en el cuerpo serializado completo
    for (const where of ['details', 'root', 'message'] as const) {
      const failure = toProviderError(spendLimitError(where));
      expect(failure.kind, where).toBe('org_limit');
      expect(failure.status, where).toBe(429);
    }
    for (const where of ['message', 'root'] as const) {
      const failure = toProviderError(workspaceLimitError(where));
      expect(failure.kind, where).toBe('org_limit');
      expect(failure.status, where).toBe(400);
    }
    // El mensaje del servidor propio nunca se copia
    expect(toProviderError(spendLimitError('message')).message).not.toContain('enforced');
  });

  it('un 429 por minuto, o un 400 cualquiera, no se confunde con el tope de gasto', () => {
    const rateLimited = APIError.generate(
      429,
      {
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Number of request tokens has exceeded your per-minute rate limit',
        },
      },
      undefined,
      new Headers({ 'retry-after': '20' }),
    );
    expect(toProviderError(rateLimited).kind).toBe('rate_limited');
    const badRequest = APIError.generate(
      400,
      { type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: too large' } },
      undefined,
      new Headers(),
    );
    expect(toProviderError(badRequest)).toMatchObject({ kind: 'provider_error', status: 400 });
    // Sin cuerpo, solo cuenta el mensaje
    expect(toProviderError(APIError.generate(500, undefined, 'caído', new Headers())).kind).toBe(
      'provider_error',
    );
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

describe('petición según las reglas del modelo (2.8)', () => {
  const params = (model: ModelChoice) =>
    buildMessageParams({
      model,
      system: 'S',
      user: 'U',
      schema: ENGINE_CONTRACTS.forgetting.output,
    });

  it('Haiku 4.5 va sin esfuerzo y sin razonamiento', () => {
    const request = params({
      id: 'claude-haiku-4-5',
      effort: null,
      thinking: null,
      maxTokens: 1500,
    });
    expect(request.output_config).not.toHaveProperty('effort');
    expect(request).not.toHaveProperty('thinking');
  });

  it('Haiku 5.5 apaga el razonamiento con disabled y Sonnet 5.5 con between_tools', () => {
    expect(
      params({ id: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxTokens: 4000 }),
    ).toMatchObject({ thinking: { type: 'disabled' }, output_config: { effort: 'low' } });
    expect(
      params({ id: 'claude-sonnet-5-5', effort: 'high', thinking: 'off', maxTokens: 8000 }),
    ).toMatchObject({ thinking: { type: 'between_tools' }, output_config: { effort: 'high' } });
  });

  it('con razonamiento adaptativo no se manda thinking, que ya es lo que hacen por omisión', () => {
    for (const id of ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']) {
      const request = params({ id, effort: 'medium', thinking: 'adaptive', maxTokens: 4000 });
      expect(request, id).not.toHaveProperty('thinking');
      expect(request.output_config?.effort).toBe('medium');
    }
  });

  it('Opus 5.5 nunca recibe off, aunque la configuración lo traiga', () => {
    expect(
      params({ id: 'claude-opus-5-5', effort: 'low', thinking: 'off', maxTokens: 4000 }),
    ).not.toHaveProperty('thinking');
  });

  it('nunca lleva metadata, herramientas, temperatura ni datos aparte del mensaje', () => {
    const request = params({
      id: 'claude-sonnet-5-5',
      effort: 'low',
      thinking: 'adaptive',
      maxTokens: 6000,
    });
    expect(Object.keys(request).sort()).toEqual(
      ['max_tokens', 'messages', 'model', 'output_config', 'system'].sort(),
    );
  });
});
