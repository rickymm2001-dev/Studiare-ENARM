// El cliente del SDK se arma con la clave explícita y no toma nada del entorno (10.29). Se prueba con
// fetch simulado y con variables del SDK puestas a propósito, que deben quedar ignoradas. Ninguna
// petición sale del proceso.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANTHROPIC_BASE_URL, createAnthropicClients } from './anthropic.ts';
import { fakeMessage } from './testing/fakes.ts';

interface Captured {
  url: string;
  headers: Headers;
}

function stubFetch(): Captured[] {
  const captured: Captured[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    captured.push({ url, headers: new Headers(init?.headers) });
    return Promise.resolve(
      new Response(JSON.stringify(fakeMessage('{}')), {
        status: 200,
        headers: { 'content-type': 'application/json', 'request-id': 'req_prueba' },
      }),
    );
  });
  return captured;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('createAnthropicClients', () => {
  it('usa la clave recibida y la dirección oficial aunque el entorno diga otra cosa', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://desvio.invalid');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'token-del-entorno');
    const captured = stubFetch();
    const clients = createAnthropicClients('clave-de-prueba');
    await clients.messages.create(
      { model: 'claude-haiku-4-5', max_tokens: 16, messages: [{ role: 'user', content: 'hola' }] },
      { timeout: 1_000, maxRetries: 0 },
    );
    expect(captured).toHaveLength(1);
    const [request] = captured;
    expect(request?.url).toBe(`${ANTHROPIC_BASE_URL}/v1/messages`);
    expect(request?.headers.get('x-api-key')).toBe('clave-de-prueba');
    expect(request?.headers.get('authorization')).toBeNull();
  });

  it('los lotes van a la misma dirección con la misma clave', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://desvio.invalid');
    const captured = stubFetch();
    const clients = createAnthropicClients('clave-de-prueba');
    await clients.batches.retrieve('msgbatch_prueba').catch(() => undefined);
    expect(captured[0]?.url).toBe(`${ANTHROPIC_BASE_URL}/v1/messages/batches/msgbatch_prueba`);
    expect(captured[0]?.headers.get('x-api-key')).toBe('clave-de-prueba');
  });
});
