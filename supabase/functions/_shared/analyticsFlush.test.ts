// analytics-flush de la cola de eventos de dinero a PostHog (B15, 1.7). PostHog se imita con un fetch en
// memoria: ninguna petición sale a la red
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_BATCH_SIZE,
  ANALYTICS_TICK_HEADER,
  POSTHOG_HOSTS,
  SERVER_EVENT_PROPS,
  handleAnalyticsFlush,
  toPosthogEvent,
  type AnalyticsFlushDeps,
} from './analyticsFlush.ts';
import type { QueuedAnalyticsEvent } from './supabase.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const KEY = 'phc_SimuladaPruebasStudiare00000000000000000000';
const HOST = 'https://us.i.posthog.com';
const TICK = 'ficha-de-cron-de-prueba-0123456789abcdef';
const ID_A = '3f1d4c52-9f1e-4a0e-8d52-6d1c9a2b7e10';
const ID_B = '8b2e7a10-5c3d-4f6e-9a1b-0c2d3e4f5a6b';

const event = (
  id: string,
  overrides: Partial<QueuedAnalyticsEvent> = {},
): QueuedAnalyticsEvent => ({
  id,
  analyticsId: ID_A,
  event: 'payment_succeeded',
  properties: { plan: 'monthly', purpose: 'subscription', method: 'card', first: true },
  occurredAt: '2026-10-20T15:00:00.000Z',
  ...overrides,
});

interface Posted {
  url: string;
  headers: Record<string, string>;
  body: { api_key: string; batch: Record<string, unknown>[] };
}

function setup(
  rows: QueuedAnalyticsEvent[],
  options: {
    status?: number;
    network?: boolean;
    key?: string | undefined;
    host?: string | undefined;
  } = {},
) {
  const posted: Posted[] = [];
  const finished: { ids: readonly string[]; status: string }[] = [];
  const logs: string[] = [];
  const claims: number[] = [];
  const deps: AnalyticsFlushDeps = {
    env: {
      projectKey: 'key' in options ? options.key : KEY,
      host: 'host' in options ? options.host : HOST,
    },
    fetch: ((url: string, init: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((value, name) => {
        headers[name] = value;
      });
      posted.push({ url, headers, body: JSON.parse(init.body as string) as Posted['body'] });
      if (options.network) return Promise.reject(new TypeError('fetch failed'));
      return Promise.resolve(
        new Response(JSON.stringify({ status: 1 }), { status: options.status ?? 200 }),
      );
    }) as typeof fetch,
    tickOk: (token) => Promise.resolve(token === TICK),
    claim: (limit) => {
      claims.push(limit);
      return Promise.resolve(rows.splice(0, limit));
    },
    finish: (ids, status) => {
      finished.push({ ids, status });
      return Promise.resolve();
    },
    log: (line) => logs.push(line),
  };
  return { deps, posted, finished, logs, claims };
}

const call = (
  deps: AnalyticsFlushDeps,
  headers: Record<string, string> = { [ANALYTICS_TICK_HEADER]: TICK },
) =>
  handleAnalyticsFlush(
    new Request('https://proyecto.supabase.co/functions/v1/analytics-flush', {
      method: 'POST',
      headers,
      body: '{}',
    }),
    deps,
  );

describe('analytics-flush, quién puede llamar y con qué configuración', () => {
  it('sin ficha de Cron responde 401 y no toca la cola ni PostHog', async () => {
    const h = setup([event('a')]);
    expect((await call(h.deps, {})).status).toBe(401);
    expect((await call(h.deps, { [ANALYTICS_TICK_HEADER]: 'otra' })).status).toBe(401);
    expect((await call(h.deps, { authorization: 'Bearer cualquiera' })).status).toBe(401);
    expect(h.claims).toEqual([]);
    expect(h.posted).toEqual([]);
  });

  it('solo atiende POST', async () => {
    const h = setup([]);
    const response = await handleAnalyticsFlush(
      new Request('https://proyecto.supabase.co/functions/v1/analytics-flush'),
      h.deps,
    );
    expect(response.status).toBe(405);
  });

  it('sin llave o sin host responde que falta la configuración y no reclama nada', async () => {
    for (const options of [
      { key: undefined },
      { host: undefined },
      { key: undefined, host: undefined },
    ]) {
      const h = setup([event('a')], options);
      const response = await call(h.deps);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'missing_configuration' });
      expect(h.claims).toEqual([]);
      expect(h.posted).toEqual([]);
      expect(h.logs.join(' ')).not.toContain(KEY);
    }
  });

  it('no acepta la llave personal, otra forma de llave ni un host que no sea de PostHog', async () => {
    const bad: [string, string][] = [
      ['phx_PersonalDeCuentaQueNuncaSeUsa000000000', HOST],
      [['sk', 'live_0123456789012345678901234567'].join('_'), HOST],
      ['phc_corta', HOST],
      [KEY, 'http://us.i.posthog.com'],
      [KEY, 'https://us.i.posthog.com/'],
      [KEY, 'https://us.posthog.com'],
      [KEY, 'https://evil.example'],
      [KEY, 'https://us.i.posthog.com.evil.example'],
    ];
    for (const [key, host] of bad) {
      const h = setup([event('a')], { key, host });
      expect((await call(h.deps)).status, `${key} ${host}`).toBe(503);
      expect(h.posted, `${key} ${host}`).toEqual([]);
    }
    for (const host of POSTHOG_HOSTS) {
      const h = setup([event('a')], { host });
      expect((await call(h.deps)).status, host).toBe(200);
      expect(h.posted[0]?.url).toBe(`${host}/batch/`);
    }
  });
});

describe('analytics-flush, de la cola a PostHog', () => {
  it('manda el lote a /batch/ con la forma de la API y lo cierra como sent', async () => {
    const h = setup([
      event('a'),
      event('b', {
        analyticsId: ID_B,
        event: 'plan_changed',
        properties: { from_plan: 'monthly', to_plan: 'annual' },
        occurredAt: '2026-10-20T16:30:00+00:00',
      }),
    ]);
    const response = await call(h.deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 2,
      sent: 2,
      dropped: 0,
      failed: 0,
      returned: 0,
    });
    expect(h.claims).toEqual([ANALYTICS_BATCH_SIZE]);
    expect(h.posted).toHaveLength(1);
    const [request] = h.posted;
    expect(request?.url).toBe('https://us.i.posthog.com/batch/');
    expect(request?.headers['content-type']).toBe('application/json');
    expect(request?.body.api_key).toBe(KEY);
    expect(request?.body.batch).toEqual([
      {
        event: 'payment_succeeded',
        distinct_id: ID_A,
        properties: {
          plan: 'monthly',
          purpose: 'subscription',
          method: 'card',
          first: true,
          $lib: 'studiare-server',
          $process_person_profile: false,
          $geoip_disable: true,
        },
        timestamp: '2026-10-20T15:00:00.000Z',
      },
      {
        event: 'plan_changed',
        distinct_id: ID_B,
        properties: {
          from_plan: 'monthly',
          to_plan: 'annual',
          $lib: 'studiare-server',
          $process_person_profile: false,
          $geoip_disable: true,
        },
        timestamp: '2026-10-20T16:30:00.000Z',
      },
    ]);
    expect(h.finished).toEqual([{ ids: ['a', 'b'], status: 'sent' }]);
  });

  it('sin eventos pendientes no llama a PostHog', async () => {
    const h = setup([]);
    const response = await call(h.deps);
    expect(await response.json()).toMatchObject({ claimed: 0 });
    expect(h.posted).toEqual([]);
    expect(h.finished).toEqual([]);
  });

  it('descarta sin mandar lo que no cumple la lista cerrada y manda lo demás', async () => {
    const h = setup([
      event('bueno'),
      event('eventoNuevo', { event: 'page_viewed', properties: {} }),
      event('propiedadDeMas', { properties: { plan: 'monthly', alias: 'ana' } }),
      event('textoLibre', { properties: { plan: 'plan de prueba con espacios' } }),
      event('valorFueraDeLista', { properties: { plan: 'gratis' } }),
      event('correo', { properties: { plan: 'ana@ejemplo.mx' } }),
      event('numero', { properties: { first: 1 as unknown as boolean } }),
      event('anidado', { properties: { plan: { a: 'b' } as unknown as string } }),
      event('idRaro', { analyticsId: 'ana@ejemplo.mx' }),
      event('fechaRota', { occurredAt: 'ayer' }),
    ]);
    const response = await call(h.deps);
    expect(await response.json()).toMatchObject({ claimed: 10, sent: 1, dropped: 9 });
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]?.body.batch).toHaveLength(1);
    expect(JSON.stringify(h.posted)).not.toMatch(/@|alias|ana|gratis|page_viewed|plan de prueba/);
    expect(h.finished).toEqual([
      {
        ids: [
          'eventoNuevo',
          'propiedadDeMas',
          'textoLibre',
          'valorFueraDeLista',
          'correo',
          'numero',
          'anidado',
          'idRaro',
          'fechaRota',
        ],
        status: 'dropped',
      },
      { ids: ['bueno'], status: 'sent' },
    ]);
  });

  it('un evento sin algunas propiedades se manda con las que trae', async () => {
    const h = setup([event('a', { properties: { plan: 'annual' } })]);
    await call(h.deps);
    expect(h.posted[0]?.body.batch[0]).toMatchObject({ properties: { plan: 'annual' } });
    expect(h.finished).toEqual([{ ids: ['a'], status: 'sent' }]);
  });

  it('un lote que PostHog rechaza por mal formado se descarta y no se reintenta', async () => {
    for (const status of [400, 413]) {
      const h = setup([event('a')], { status });
      await call(h.deps);
      expect(h.finished, String(status)).toEqual([{ ids: ['a'], status: 'dropped' }]);
    }
  });

  it('una falla de PostHog o de la red deja los eventos para otro intento', async () => {
    for (const options of [{ status: 429 }, { status: 500 }, { status: 503 }, { network: true }]) {
      const h = setup([event('a'), event('b')], options);
      const response = await call(h.deps);
      expect(response.status).toBe(200);
      expect(h.finished, JSON.stringify(options)).toEqual([{ ids: ['a', 'b'], status: 'failed' }]);
    }
  });

  it('si PostHog rechaza la llave devuelve los eventos sin gastar el intento y avisa con un 503', async () => {
    for (const status of [401, 403]) {
      const h = setup([event('a')], { status });
      const response = await call(h.deps);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: 'posthog_rejected_key', returned: 1 });
      expect(h.finished).toEqual([{ ids: ['a'], status: 'queued' }]);
      expect(h.logs.join(' ')).not.toContain(KEY);
    }
  });

  it('ni el registro ni la respuesta traen la llave, ids de personas ni el contenido de los eventos', async () => {
    const h = setup([event('a'), event('b', { event: 'raro' })]);
    const response = await call(h.deps);
    const visible = [await response.text(), ...h.logs].join('\n');
    expect(visible).not.toMatch(new RegExp(`${KEY}|${ID_A}|monthly|subscription|@`));
  });
});

describe('la lista cerrada de eventos de dinero', () => {
  it('es la de la restricción de analytics_outbox.event de la migración, en el mismo orden', () => {
    const sql = readFileSync(
      resolve(ROOT, 'supabase/migrations/20261029000002_product_analytics.sql'),
      'utf8',
    );
    const check = /event text not null check \(event in \(([^)]*)\)\)/.exec(sql);
    expect(check).not.toBeNull();
    const inSql = [...(check?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(inSql).toEqual(Object.keys(SERVER_EVENT_PROPS));
    expect(inSql).toEqual([
      'trial_started',
      'trial_converted',
      'trial_canceled',
      'payment_succeeded',
      'subscription_cancel_scheduled',
      'subscription_canceled',
      'plan_changed',
      'refund_issued',
    ]);
  });

  it('toPosthogEvent no deja pasar nada que no sea de la lista', () => {
    expect(toPosthogEvent(event('a'))).not.toBeNull();
    expect(toPosthogEvent(event('a', { event: 'signup_completed' }))).toBeNull();
    expect(toPosthogEvent(event('a', { properties: { plan: 'monthly', extra: true } }))).toBeNull();
  });
});
