// El transporte hacia PostHog (B15, 1.4 y 6.3)
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsRecord } from './catalog';
import type { AnalyticsConfig } from './config';
import {
  KEEPALIVE_LIMIT_BYTES,
  buildBodies,
  sendEvents,
  toWireEvent,
  type CommonProperties,
} from './transport';

const CONFIG: AnalyticsConfig = {
  key: 'phc_SimuladaPruebasStudiare00000000000000000000',
  host: 'https://us.i.posthog.com',
};
const ID = '2f5b0c38-6a52-4a1f-9d57-3c7a9d1f0b11';
const COMMON: CommonProperties = {
  app_version: 'abc1234',
  platform: 'phone',
  installed: false,
  plan_kind: 'free',
  role: 'student',
};
const RECORD: AnalyticsRecord = {
  event: 'review_session_completed',
  properties: { items: '10-49', minutes: '5-14' },
  at: Date.UTC(2026, 9, 21, 15, 30, 0, 123),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toWireEvent', () => {
  it('arma el evento como la documentación de /batch/, con el identificador seudónimo arriba', () => {
    const wire = toWireEvent(RECORD, ID, COMMON);
    expect(wire).toEqual({
      event: 'review_session_completed',
      distinct_id: ID,
      properties: {
        items: '10-49',
        minutes: '5-14',
        app_version: 'abc1234',
        platform: 'phone',
        installed: false,
        plan_kind: 'free',
        role: 'student',
        $lib: 'studiare-web',
        $process_person_profile: false,
        $geoip_disable: true,
      },
      timestamp: '2026-10-21T15:30:00.123Z',
    });
  });

  it('lo común no puede pisar las propiedades del evento ni al revés', () => {
    const wire = toWireEvent(
      { ...RECORD, properties: { role: 'admin', items: '1-9', minutes: '1-4' } },
      ID,
      COMMON,
    );
    // Si el evento trajera una propiedad con el nombre de una común, gana la común (las comunes son del cliente)
    expect(wire.properties.role).toBe('student');
  });

  it('no lleva correo, alias ni ninguna llave de cuenta', () => {
    const text = JSON.stringify(toWireEvent(RECORD, ID, COMMON));
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/alias|email|correo|user_id|userId/i);
  });
});

describe('buildBodies', () => {
  it('un lote chico va en una sola petición con api_key y batch', () => {
    const events = [toWireEvent(RECORD, ID, COMMON), toWireEvent(RECORD, ID, COMMON)];
    const bodies = buildBodies(CONFIG, events);
    expect(bodies).toHaveLength(1);
    const parsed = JSON.parse(bodies[0] ?? '{}') as { api_key: string; batch: unknown[] };
    expect(parsed.api_key).toBe(CONFIG.key);
    expect(parsed.batch).toHaveLength(2);
  });

  it('sin eventos no hay peticiones', () => {
    expect(buildBodies(CONFIG, [])).toEqual([]);
  });

  it('parte el lote si pasa de 60 KB y no pierde ni repite ningún evento', () => {
    const events = Array.from({ length: 400 }, (_, index) =>
      toWireEvent({ ...RECORD, at: RECORD.at + index }, ID, COMMON),
    );
    const bodies = buildBodies(CONFIG, events);
    expect(bodies.length).toBeGreaterThan(1);
    for (const body of bodies) {
      expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(KEEPALIVE_LIMIT_BYTES);
    }
    const stamps = bodies.flatMap(
      (body) => (JSON.parse(body) as { batch: { timestamp: string }[] }).batch,
    );
    expect(stamps.map((item) => item.timestamp)).toEqual(events.map((item) => item.timestamp));
  });
});

describe('sendEvents', () => {
  const okReply = () => Promise.resolve(new Response('{"status":1}', { status: 200 }));

  it('hace POST a {host}/batch/ con keepalive, sin cookies y sin referente', async () => {
    const fetchFn = vi.fn((_url: string, _init: RequestInit) => okReply());
    const delivered = await sendEvents(CONFIG, [toWireEvent(RECORD, ID, COMMON)], fetchFn);
    expect(delivered).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://us.i.posthog.com/batch/');
    expect(init?.method).toBe('POST');
    expect(init?.keepalive).toBe(true);
    expect(init?.credentials).toBe('omit');
    expect(init?.referrerPolicy).toBe('no-referrer');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toMatchObject({ api_key: CONFIG.key });
  });

  it('reintenta una vez y descarta, sin lanzar ni escribir en la consola', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(sendEvents(CONFIG, [toWireEvent(RECORD, ID, COMMON)], fetchFn)).resolves.toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('una respuesta con error también cuenta como falla y se reintenta una vez', async () => {
    const fetchFn = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    await expect(sendEvents(CONFIG, [toWireEvent(RECORD, ID, COMMON)], fetchFn)).resolves.toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('un fetch que lanza sincrónico tampoco rompe nada', async () => {
    const fetchFn = vi.fn(() => {
      throw new Error('boom');
    });
    await expect(sendEvents(CONFIG, [toWireEvent(RECORD, ID, COMMON)], fetchFn)).resolves.toBe(0);
  });
});

describe('sendEvents y el permiso', () => {
  it('si el permiso se retira entre el primer intento y el reintento, el reintento no sale', async () => {
    let allowed = true;
    const fetchFn = vi.fn(() => {
      allowed = false;
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    await expect(
      sendEvents(CONFIG, [toWireEvent(RECORD, ID, COMMON)], fetchFn, () => allowed),
    ).resolves.toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('si no está permitido desde el principio no sale ni un intento', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    await sendEvents(CONFIG, [toWireEvent(RECORD, ID, COMMON)], fetchFn, () => false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
