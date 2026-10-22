import { RateLimitError, BadRequestError } from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { callRpc, createRestRpc, RestError } from './rest.ts';
import {
  refusalMessage,
  spendLimitError,
  thinkingFirstMessage,
  workspaceLimitError,
} from './testing/fakeAnthropic.ts';
import { createFakeSupabaseRest } from './testing/fakeSupabaseRest.ts';
import { createMemoryAi } from './testing/memory.ts';

const USER = 'f0000000-0000-4000-8000-000000000001';

describe('funciones de la base por REST', () => {
  it('llama con la llave de servicio y lee resultados vacíos', async () => {
    const rest = createFakeSupabaseRest({ memory: createMemoryAi() });
    const rpc = createRestRpc({
      url: rest.url,
      serviceKey: rest.serviceKey,
      fetchImpl: rest.fetch,
    });
    expect(await rpc('ai_jobs_scrub', {})).toBe(0);
    expect(
      await rpc('ai_jobs_unclaim', { p_claim: '00000000-0000-4000-8000-000000000000' }),
    ).toBeNull();
    expect(rest.calls.every((call) => call.key === 'service' && call.bearer === 'service')).toBe(
      true,
    );
  });

  it('con la llave nueva (sb_secret_) la manda solo en apikey, y la plataforma rechaza un Bearer con ella', async () => {
    const rest = createFakeSupabaseRest({ memory: createMemoryAi(), keys: 'new' });
    const rpc = createRestRpc({
      url: rest.url,
      serviceKey: rest.serviceKey,
      fetchImpl: rest.fetch,
    });
    expect(await rpc('ai_jobs_scrub', {})).toBe(0);
    expect(rest.calls).toMatchObject([{ key: 'service', bearer: 'none' }]);
    // Lo que no debe hacer ninguna función: mandar la llave nueva como token
    const target = { url: rest.url, apiKey: rest.serviceKey, fetchImpl: rest.fetch };
    await expect(callRpc(target, 'ai_jobs_scrub', {}, rest.serviceKey)).rejects.toMatchObject({
      status: 401,
      code: 'PGRST301',
    });
  });

  it('con un token de sesión la llave va en apikey y el token en authorization, en las dos formas', async () => {
    for (const keys of ['legacy', 'new'] as const) {
      const rest = createFakeSupabaseRest({
        memory: createMemoryAi(),
        keys,
        accounts: { 'token-ana': { userId: USER, role: 'student', paid: true } },
      });
      const target = { url: rest.url, apiKey: rest.anonKey, fetchImpl: rest.fetch };
      expect(await callRpc(target, 'ai_whoami', {}, 'token-ana')).toMatchObject({ userId: USER });
      expect(rest.calls, keys).toMatchObject([{ key: 'anon', bearer: 'user' }]);
    }
  });

  it('un error trae el estado y el código de Postgres, nunca el cuerpo', async () => {
    const rest = createFakeSupabaseRest({
      memory: createMemoryAi(),
      accounts: { 'token-otro': { userId: USER, role: 'student', paid: true, device: 'other' } },
    });
    const target = { url: rest.url, apiKey: rest.anonKey, fetchImpl: rest.fetch };
    const error = await callRpc(target, 'ai_whoami', {}, 'token-otro').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(RestError);
    expect(error).toMatchObject({
      status: 403,
      code: '42501',
      message: 'La función ai_whoami contestó 403',
    });
    // Una función del servidor con la llave pública no pasa
    await expect(callRpc(target, 'ai_jobs_scrub', {})).rejects.toMatchObject({ status: 401 });
    rest.down = true;
    await expect(callRpc(target, 'ai_whoami', {}, 'token-otro')).rejects.toMatchObject({
      status: 503,
      code: null,
    });
  });
});

describe('respuestas especiales del Anthropic simulado', () => {
  it('arma los errores con las clases del SDK', () => {
    const spend = spendLimitError();
    expect(spend).toBeInstanceOf(RateLimitError);
    expect((spend as RateLimitError).error).toMatchObject({
      error: { details: { error_code: 'enforced_spend_limit_reached' } },
    });
    expect(workspaceLimitError()).toBeInstanceOf(BadRequestError);
    // Los mismos errores con el código en otro lugar del cuerpo
    expect(spendLimitError('root')).toBeInstanceOf(RateLimitError);
    expect(spendLimitError('message')).toBeInstanceOf(RateLimitError);
    expect(workspaceLimitError('root')).toBeInstanceOf(BadRequestError);
  });

  it('la negativa trae su categoría y el razonamiento va antes del texto', () => {
    expect(refusalMessage('cyber')).toMatchObject({
      stop_reason: 'refusal',
      stop_details: { category: 'cyber' },
      content: [],
    });
    expect(thinkingFirstMessage('{}').content.map((block) => block.type)).toEqual([
      'thinking',
      'text',
    ]);
  });
});
