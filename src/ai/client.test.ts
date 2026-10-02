import { describe, expect, it, vi } from 'vitest';
import { fetchAiStatus, HEALTH_URL } from './client';

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

describe('estado del proxy de IA', () => {
  it('distingue modo real y simulado', async () => {
    expect(await fetchAiStatus(respond({ status: 'ok', mode: 'mock', version: 1 }))).toEqual({
      kind: 'mock',
    });
    expect(await fetchAiStatus(respond({ status: 'ok', mode: 'real', version: 1 }))).toEqual({
      kind: 'real',
    });
  });

  it('consulta la ruta de salud del proxy y no a Anthropic', async () => {
    const fetchMock = respond({ status: 'ok', mode: 'mock', version: 1 });
    await fetchAiStatus(fetchMock);
    expect(fetchMock).toHaveBeenCalledWith(HEALTH_URL, expect.anything());
    expect(HEALTH_URL.startsWith('/api/')).toBe(true);
  });

  it('sin proxy, con error o con respuesta rara cae a no-proxy', async () => {
    expect(await fetchAiStatus(respond({ error: 'x' }, 502))).toEqual({ kind: 'no-proxy' });
    expect(await fetchAiStatus(respond({ status: 'ok', mode: 'otro', version: 1 }))).toEqual({
      kind: 'no-proxy',
    });
    expect(await fetchAiStatus(vi.fn(() => Promise.reject(new TypeError('red'))))).toEqual({
      kind: 'no-proxy',
    });
  });
});
