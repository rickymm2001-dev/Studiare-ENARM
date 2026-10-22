// El cliente de analítica completo (B15, 1.4, 6.1): catálogo, cola y transporte juntos con un fetch falso
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAnalytics, track, analyticsConsent } from './catalog';
import { createAnalyticsClient, type AnalyticsEnvironment, type ClientInputs } from './client';
import { QUEUE_MAX_WAIT_MS } from './queue';

const ID = '2f5b0c38-6a52-4a1f-9d57-3c7a9d1f0b11';
const ALL_OK: Partial<ClientInputs> = {
  flag: true,
  config: {
    key: 'phc_SimuladaPruebasStudiare00000000000000000000',
    host: 'https://us.i.posthog.com',
  },
  consent: true,
  database: 'real',
  appEnv: 'production',
  cloud: true,
  analyticsId: ID,
};

function setup() {
  const hide = { run: null as null | (() => void), listeners: 0 };
  const environment: AnalyticsEnvironment = {
    width: () => 390,
    installed: () => true,
    version: () => 'abc1234',
    onHide: (run) => {
      hide.run = run;
      hide.listeners += 1;
      return () => {
        hide.listeners -= 1;
        hide.run = null;
      };
    },
  };
  const calls: {
    url: string;
    body: { batch: { event: string; distinct_id: string; properties: Record<string, unknown> }[] };
  }[] = [];
  const fetchFn = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) as (typeof calls)[number]['body'] });
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  const client = createAnalyticsClient({ fetch: fetchFn, environment });
  return { client, calls, fetchFn, hide };
}

const review = () => {
  track('review_session_completed', { items: '10-49', minutes: '5-14' });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T15:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  resetAnalytics();
});

describe('cliente de analítica', () => {
  it('nace apagado: track no junta nada ni manda nada', async () => {
    const { client, calls } = setup();
    review();
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS * 2);
    expect(client.state()).toBe('off');
    expect(client.queued()).toBe(0);
    expect(calls).toEqual([]);
  });

  it('con todo en regla un evento sale a los 10 segundos con el identificador y lo común', async () => {
    const { client, calls } = setup();
    client.update(ALL_OK);
    expect(client.state()).toBe('sending');
    expect(analyticsConsent()).toBe(true);
    review();
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://us.i.posthog.com/batch/');
    const [sent] = calls[0]?.body.batch ?? [];
    expect(sent?.event).toBe('review_session_completed');
    expect(sent?.distinct_id).toBe(ID);
    expect(sent?.properties).toMatchObject({
      items: '10-49',
      minutes: '5-14',
      app_version: 'abc1234',
      platform: 'phone',
      installed: true,
      plan_kind: 'free',
      role: 'student',
      $lib: 'studiare-web',
    });
  });

  it('antes de tener el identificador junta, y al llegar manda lo que esperaba', async () => {
    const { client, calls } = setup();
    client.update({ ...ALL_OK, analyticsId: null });
    expect(client.state()).toBe('collecting');
    review();
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS * 3);
    expect(calls).toEqual([]);
    expect(client.queued()).toBe(1);
    client.update({ analyticsId: ID });
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body.batch[0]?.distinct_id).toBe(ID);
  });

  it('retirar el permiso vacía la cola sin mandar y deja de escuchar el cierre de la pestaña', async () => {
    const { client, calls, hide } = setup();
    client.update(ALL_OK);
    expect(hide.listeners).toBe(1);
    review();
    review();
    client.update({ consent: false });
    expect(client.state()).toBe('off');
    expect(client.queued()).toBe(0);
    expect(analyticsConsent()).toBe(false);
    expect(hide.listeners).toBe(0);
    review();
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS * 2);
    expect(calls).toEqual([]);
  });

  it('volver a dar el permiso no manda lo de antes de retirarlo', async () => {
    const { client, calls } = setup();
    client.update(ALL_OK);
    review();
    client.update({ consent: false });
    client.update({ consent: true });
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS * 2);
    expect(calls).toEqual([]);
  });

  it('al ocultar la pestaña manda lo que haya sin esperar los 10 segundos', async () => {
    const { client, calls, hide } = setup();
    client.update(ALL_OK);
    review();
    hide.run?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(client.queued()).toBe(0);
  });

  it('sin saber el permiso deja el del catálogo en null, y con una decisión en false', () => {
    const { client } = setup();
    client.update({ ...ALL_OK, consent: null });
    expect(analyticsConsent()).toBeNull();
    client.update({ consent: false });
    expect(analyticsConsent()).toBe(false);
  });

  it('el plan y el rol que se actualizan viajan en los eventos siguientes', async () => {
    const { client, calls } = setup();
    client.update(ALL_OK);
    client.update({ context: { plan_kind: 'trial', role: 'physician' } });
    review();
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS);
    expect(calls[0]?.body.batch[0]?.properties).toMatchObject({
      plan_kind: 'trial',
      role: 'physician',
    });
  });

  it('un evento mal formado no sale aunque todo esté en regla', async () => {
    const { client, calls } = setup();
    client.update(ALL_OK);
    // @ts-expect-error una propiedad fuera de la lista se descarta en el catálogo
    track('review_session_completed', { items: '10-49', minutes: '5-14', alias: 'Ana' });
    // @ts-expect-error un texto libre no cabe
    track('review_session_completed', { items: 'ana@correo.mx', minutes: '5-14' });
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS * 2);
    expect(calls).toEqual([]);
  });

  it('reset deja todo como al abrir la pestaña', async () => {
    const { client, calls } = setup();
    client.update(ALL_OK);
    review();
    client.reset();
    expect(client.state()).toBe('off');
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS * 2);
    expect(calls).toEqual([]);
  });

  it('un fallo al mandar no rompe a quien mide ni reintenta en bucle', async () => {
    const hide = { run: null as null | (() => void) };
    const environment: AnalyticsEnvironment = {
      width: () => 1280,
      installed: () => false,
      version: () => 'dev',
      onHide: (run) => {
        hide.run = run;
        return () => undefined;
      },
    };
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const client = createAnalyticsClient({ fetch: fetchFn, environment });
    client.update(ALL_OK);
    review();
    await vi.advanceTimersByTimeAsync(QUEUE_MAX_WAIT_MS * 5);
    // Un lote, dos intentos, y nada más
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(client.queued()).toBe(0);
  });
});
