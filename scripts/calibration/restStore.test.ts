import { describe, expect, it } from 'vitest';
import { createRestStore } from './restStore.ts';
import { StoreError } from './store.ts';
import { describeError } from './log.ts';

const KEY = 'sb_secret_llave_de_prueba_1234567890';
const RUN = '0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8';

type Reply = { status: number; body: unknown } | 'throw';

/** Un fetch que responde en orden lo que se le da y cuenta las llamadas */
function scripted(replies: Reply[]) {
  const calls: { path: string; headers: Headers }[] = [];
  let index = 0;
  const fetcher: typeof fetch = (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    calls.push({ path: url.pathname, headers: new Headers(init?.headers) });
    const reply = replies[Math.min(index, replies.length - 1)] as Reply;
    index += 1;
    if (reply === 'throw')
      return Promise.reject(new TypeError('fetch failed con sb_secret y ana@ejemplo.mx'));
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  return { fetcher, calls };
}

function storeWith(replies: Reply[], extra: { attempts?: number } = {}) {
  const script = scripted(replies);
  const sleeps: number[] = [];
  const store = createRestStore({
    url: 'https://proyecto.supabase.co',
    key: KEY,
    fetch: script.fetcher,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    backoffMs: 10,
    ...extra,
  });
  return { store, calls: script.calls, sleeps };
}

const failure = (status: number, code: string) => ({
  status,
  body: { code, message: `error con ${KEY} y ana@ejemplo.mx`, details: 'Ana López', hint: null },
});

describe('transporte de supabase-js', () => {
  it('devuelve lo que contesta la función', async () => {
    const { store, calls } = storeWith([{ status: 200, body: { items: [] } }]);
    expect(await store.bank(RUN)).toEqual({ items: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get('apikey')).toBe(KEY);
  });

  it('reintenta con espera creciente lo que falló por un 5xx y lo logra', async () => {
    const { store, calls, sleeps } = storeWith([
      failure(503, 'PGRST000'),
      failure(500, '57014'),
      { status: 200, body: { rows: [], next: 0, done: true, dropped: 0 } },
    ]);
    expect(await store.answers(RUN, 0, 100)).toEqual({ rows: [], next: 0, done: true, dropped: 0 });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([10, 30]);
  });

  it('se rinde a los 3 intentos con un error sin el mensaje que dio el servidor', async () => {
    const { store, calls } = storeWith([failure(500, '57014')]);
    const error = await store.exposures(RUN, 0, 100).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StoreError);
    expect(calls).toHaveLength(3);
    expect(error).toMatchObject({
      code: '57014',
      status: 500,
      kind: 'timeout',
      rpc: 'calibration_exposures',
    });
    const text = JSON.stringify({
      message: (error as Error).message,
      summary: describeError(error),
    });
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('ana@ejemplo.mx');
    expect(text).not.toContain('Ana López');
  });

  it('no repite un 4xx ni un error de la base como 22023 o 42501', async () => {
    for (const reply of [failure(400, '22023'), failure(403, '42501'), failure(401, 'PGRST301')]) {
      const { store, calls } = storeWith([reply]);
      await expect(store.people(RUN)).rejects.toBeInstanceOf(StoreError);
      expect(calls).toHaveLength(1);
    }
  });

  it('no repite begin ni finish, que cambian el estado de la corrida', async () => {
    const begin = storeWith([failure(503, 'PGRST000'), { status: 200, body: {} }]);
    await expect(
      begin.store.begin({ trigger: 'schedule', forceDryRun: false, runner: {} }),
    ).rejects.toBeInstanceOf(StoreError);
    expect(begin.calls).toHaveLength(1);
    const finish = storeWith([failure(503, 'PGRST000'), { status: 200, body: {} }]);
    await expect(finish.store.finish(RUN, 'ok', null, {})).rejects.toBeInstanceOf(StoreError);
    expect(finish.calls).toHaveLength(1);
  });

  it('una falla de red se reintenta y sale como network sin el mensaje', async () => {
    const { store, calls } = storeWith(['throw']);
    const error = await store.labelPairs(RUN).catch((caught: unknown) => caught);
    expect(calls).toHaveLength(3);
    expect(error).toMatchObject({ name: 'StoreError', kind: 'network' });
    expect(describeError(error)).toEqual({ errorClass: 'StoreError', errorCode: 'network' });
    expect((error as Error).message).not.toMatch(/sb_secret|ana@/);
  });

  it('la llave no viaja en la dirección ni en el cuerpo', async () => {
    const seen: string[] = [];
    const fetcher: typeof fetch = (input, init) => {
      seen.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        typeof init?.body === 'string' ? init.body : '',
      );
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    };
    const store = createRestStore({
      url: 'https://proyecto.supabase.co',
      key: KEY,
      fetch: fetcher,
    });
    await store.bank(RUN);
    await store.finish(RUN, 'ok', null, { itemRows: 1 });
    expect(seen.join(' ')).not.toContain(KEY);
  });
});
