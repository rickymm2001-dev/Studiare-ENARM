import { describe, expect, it, vi } from 'vitest';
import { fetchAiStatus, HEALTH_URL, withoutProxy } from './client';

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

  it('sin proxy, con error o con respuesta rara cae a no-proxy fuera de producción', async () => {
    expect(await fetchAiStatus(respond({ error: 'x' }, 502))).toEqual({ kind: 'no-proxy' });
    expect(await fetchAiStatus(respond({ status: 'ok', mode: 'otro', version: 1 }))).toEqual({
      kind: 'no-proxy',
    });
    expect(await fetchAiStatus(vi.fn(() => Promise.reject(new TypeError('red'))))).toEqual({
      kind: 'no-proxy',
    });
  });

  it('en producción, sin proxy o con una respuesta rara, la IA no está disponible y no responde', async () => {
    const down = vi.fn(() => Promise.reject(new TypeError('red'))) as unknown as typeof fetch;
    expect(await fetchAiStatus(down, 'production')).toEqual({
      kind: 'unavailable',
      reachable: false,
    });
    expect(await fetchAiStatus(respond({ error: 'x' }, 502), 'production')).toEqual({
      kind: 'unavailable',
      reachable: false,
    });
    expect(withoutProxy('demo')).toEqual({ kind: 'no-proxy' });
    expect(withoutProxy('development')).toEqual({ kind: 'no-proxy' });
  });
});

describe('salud versión 2', () => {
  const engines = {
    forgetting: 'gated',
    weekly_report: 'open',
    flashcards: 'gated',
    bias_tips: 'open',
    restructure: 'gated',
  };

  it('trae qué motores ven los alumnos', async () => {
    expect(
      await fetchAiStatus(respond({ status: 'ok', mode: 'real', version: 2, engines })),
    ).toEqual({ kind: 'real', engines });
    expect(
      await fetchAiStatus(respond({ status: 'ok', mode: 'mock', version: 2, engines })),
    ).toEqual({ kind: 'mock', engines });
  });

  it('un campo nuevo que esta versión no conoce no la rompe', async () => {
    expect(
      await fetchAiStatus(
        respond({ status: 'ok', mode: 'real', version: 3, engines, algoNuevo: true }),
      ),
    ).toEqual({ kind: 'real', engines });
  });

  it('una función sin clave dice unavailable. En producción la IA no está disponible y se sabe que respondió', async () => {
    const body = { status: 'ok', mode: 'unavailable', version: 2, engines };
    expect(await fetchAiStatus(respond(body), 'production')).toEqual({
      kind: 'unavailable',
      reachable: true,
    });
    // En desarrollo y en la demo quedan las respuestas fijas del cliente, con su etiqueta
    expect(await fetchAiStatus(respond(body), 'demo')).toEqual({ kind: 'no-proxy' });
    expect(await fetchAiStatus(respond(body), 'development')).toEqual({ kind: 'no-proxy' });
  });
});
