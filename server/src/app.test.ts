import { describe, expect, it } from 'vitest';
import { createApp, type HealthResponse } from './app.ts';
import { MAX_BODY_BYTES } from './config.ts';

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
});
