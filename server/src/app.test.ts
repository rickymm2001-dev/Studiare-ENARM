import { describe, expect, it } from 'vitest';
import { hypothesisInput } from '../../src/ai/testing/aiSamples.ts';
import { requestBody } from '../../supabase/functions/_shared/ai/testing/fakes.ts';
import { createAiDeps } from './ai/index.ts';
import { createApp, type HealthResponse } from './app.ts';
import { MAX_BODY_BYTES } from './config.ts';
import { proxyAllowedOrigins, testPorts } from './testPorts.ts';

const LOCAL = { host: '127.0.0.1:8787' };

describe('app del proxy', () => {
  it('/health dice el modo simulado', async () => {
    const response = await createApp({ mode: 'mock' }).request('/health', { headers: LOCAL });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()) as HealthResponse).toEqual({
      status: 'ok',
      mode: 'mock',
      version: 1,
    });
  });

  it('/health dice el modo real', async () => {
    const response = await createApp({ mode: 'real' }).request('/health', { headers: LOCAL });
    expect(((await response.json()) as HealthResponse).mode).toBe('real');
  });

  it('acepta localhost por nombre y por IPv6', async () => {
    const app = createApp({ mode: 'mock' });
    for (const host of ['localhost:5173', '127.0.0.1', '[::1]:8787']) {
      expect((await app.request('/health', { headers: { host } })).status, host).toBe(200);
    }
  });

  it('rechaza un Host que no es localhost', async () => {
    const app = createApp({ mode: 'mock' });
    for (const host of [
      'evil.example',
      'evil.example:8787',
      '192.168.1.20:8787',
      '127.0.0.1.evil.example',
    ]) {
      expect((await app.request('/health', { headers: { host } })).status, host).toBe(403);
    }
  });

  it('acepta la app como Origin y rechaza cualquier otro sitio', async () => {
    const app = createApp({ mode: 'mock' });
    for (const origin of ['http://127.0.0.1:5173', 'http://localhost:4173']) {
      const response = await app.request('/health', { headers: { ...LOCAL, origin } });
      expect(response.status, origin).toBe(200);
    }
    for (const origin of ['https://evil.example', 'null', 'http://127.0.0.1:9999']) {
      const response = await app.request('/health', { headers: { ...LOCAL, origin } });
      expect(response.status, origin).toBe(403);
    }
  });

  it('con los orígenes del proxy simulado de otra copia acepta su vista previa y nada más', async () => {
    const app = createApp({
      mode: 'mock',
      allowedOrigins: proxyAllowedOrigins(testPorts({ PW_PORT_OFFSET: '10' })),
    });
    for (const origin of [
      'http://127.0.0.1:4183',
      'http://localhost:4183',
      'http://127.0.0.1:4173',
    ]) {
      const response = await app.request('/health', { headers: { ...LOCAL, origin } });
      expect(response.status, origin).toBe(200);
    }
    for (const origin of [
      'http://127.0.0.1:4184',
      'http://127.0.0.1:4193',
      'https://evil.example',
    ]) {
      const response = await app.request('/health', { headers: { ...LOCAL, origin } });
      expect(response.status, origin).toBe(403);
    }
  });

  it('las escrituras piden JSON para que el navegador no las mande sin preguntar', async () => {
    const response = await createApp({ mode: 'mock' }).request('/health', {
      method: 'POST',
      headers: { ...LOCAL, 'content-type': 'text/plain' },
      body: 'hola',
    });
    expect(response.status).toBe(415);
  });

  it('rechaza peticiones más grandes que el máximo', async () => {
    const response = await createApp({ mode: 'mock' }).request('/health', {
      method: 'POST',
      headers: { ...LOCAL, 'content-type': 'application/json' },
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    });
    expect(response.status).toBe(413);
  });

  it('una ruta desconocida responde 404 en JSON', async () => {
    const response = await createApp({ mode: 'mock' }).request('/no-existe', { headers: LOCAL });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('las rutas de IA exigen JSON y respetan el filtro de Host y de Origin del proxy', async () => {
    const ai = createAiDeps({
      credentials: { mode: 'mock', apiKey: null },
      files: { config: null, ledger: null },
    });
    const app = createApp({ mode: 'mock', ai });
    const headers = {
      host: '127.0.0.1:8787',
      origin: 'http://127.0.0.1:5173',
      'content-type': 'application/json',
    };
    const body = JSON.stringify(requestBody(hypothesisInput()));
    const send = (extra: Record<string, string>) =>
      app.request('/ai/forgetting', { method: 'POST', headers: { ...headers, ...extra }, body });
    expect((await send({})).status).toBe(200);
    expect((await send({ 'content-type': 'text/plain' })).status).toBe(415);
    expect((await send({ origin: 'https://evil.example' })).status).toBe(403);
    expect((await send({ host: 'evil.example' })).status).toBe(403);
  });
});
