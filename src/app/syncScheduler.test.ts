import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '@/data/sync/runSync';
import { retryDelayMs } from '@/engines/sync';
import {
  SYNC_INTERVAL_MS,
  SYNC_MIN_GAP_MS,
  startSyncScheduler,
  type SyncEnvironment,
  type SyncScheduler,
  type SyncUiState,
} from './syncScheduler';

const OK_AT = '2026-10-08T10:00:00.000Z';
const OK: SyncResult = {
  status: 'ok',
  at: OK_AT,
  recordsPulled: 2,
  recordsPushed: 3,
  eventsPulled: 1,
  eventsPushed: 4,
  rejected: 0,
};

function fakeEnv() {
  let online = true;
  const onlineListeners = new Set<() => void>();
  const visibilityListeners = new Set<(visible: boolean) => void>();
  const env: SyncEnvironment = {
    isOnline: () => online,
    onOnline: (listener) => {
      onlineListeners.add(listener);
      return () => onlineListeners.delete(listener);
    },
    onVisibility: (listener) => {
      visibilityListeners.add(listener);
      return () => visibilityListeners.delete(listener);
    },
  };
  return {
    env,
    setOnline(value: boolean) {
      online = value;
      if (value)
        onlineListeners.forEach((listener) => {
          listener();
        });
    },
    show: (visible: boolean) => {
      visibilityListeners.forEach((listener) => {
        listener(visible);
      });
    },
    listeners: () => onlineListeners.size + visibilityListeners.size,
  };
}

let scheduler: SyncScheduler | null = null;
const reports: SyncUiState[] = [];

function start(results: (() => Promise<SyncResult>) | SyncResult[], env = fakeEnv()) {
  const queue = Array.isArray(results) ? [...results] : null;
  const run = vi.fn(() => {
    if (typeof results === 'function') return results();
    return Promise.resolve(queue?.shift() ?? OK);
  });
  scheduler = startSyncScheduler({
    run,
    report: (state) => reports.push(state),
    env: env.env,
  });
  return { run, env };
}

const last = () => reports.at(-1);

beforeEach(() => {
  vi.useFakeTimers();
  reports.length = 0;
});
afterEach(() => {
  scheduler?.stop();
  scheduler = null;
  vi.useRealTimers();
});

describe('programador de la sincronización', () => {
  it('sincroniza al empezar y avisa que corre y cómo terminó', async () => {
    const { run } = start([OK]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(reports[0]).toMatchObject({ running: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toMatchObject({
      running: false,
      lastSyncAt: OK_AT,
      outcome: { status: 'ok', pulled: 3, pushed: 7, rejected: 0 },
    });
  });

  it('repite cada 5 minutos', async () => {
    const { run } = start([OK, OK, OK]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('nunca corren dos a la vez', async () => {
    let release: (result: SyncResult) => void = () => undefined;
    const { run } = start(
      () =>
        new Promise<SyncResult>((resolve) => {
          release = resolve;
        }),
    );
    const first = scheduler?.syncNow();
    const second = scheduler?.syncNow();
    expect(run).toHaveBeenCalledTimes(1);
    release(OK);
    await vi.advanceTimersByTimeAsync(0);
    // Lo que se pidió mientras corría se manda enseguida, una sola vez
    expect(run).toHaveBeenCalledTimes(2);
    release(OK);
    await Promise.all([first, second]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('si falla por la red reintenta con una espera que crece', async () => {
    const failed: SyncResult = { status: 'failed', failure: 'network', detail: 'x' };
    const { run } = start([failed, failed, OK]);
    await vi.advanceTimersByTimeAsync(0);
    expect(last()?.outcome).toEqual({ status: 'failed', failure: 'network' });
    await vi.advanceTimersByTimeAsync(retryDelayMs(1) - 1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(retryDelayMs(2));
    expect(run).toHaveBeenCalledTimes(3);
    expect(last()?.outcome.status).toBe('ok');
  });

  it('si otro dispositivo tiene la cuenta no insiste', async () => {
    const { run } = start([{ status: 'failed', failure: 'device', detail: 'x' }]);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 3);
    expect(run).toHaveBeenCalledTimes(1);
    expect(last()?.outcome).toEqual({ status: 'failed', failure: 'device' });
  });

  it('si la sesión venció no insiste', async () => {
    const { run } = start([{ status: 'failed', failure: 'auth', detail: 'x' }]);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 3);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('con el reloj desfasado avisa y lo intenta de nuevo en el siguiente ciclo', async () => {
    const { run } = start([{ status: 'clock_skew', skewMs: 3_600_000 }, OK]);
    await vi.advanceTimersByTimeAsync(0);
    expect(last()?.outcome).toEqual({ status: 'clock_skew', skewMs: 3_600_000 });
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(2);
    expect(last()?.outcome.status).toBe('ok');
  });

  it('conserva la fecha de la última sincronización buena aunque la siguiente falle', async () => {
    start([OK, { status: 'failed', failure: 'server', detail: 'x' }]);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(last()?.outcome.status).toBe('failed');
    expect(last()?.lastSyncAt).toBe(OK_AT);
  });
});

describe('cuándo se dispara', () => {
  it('sin conexión no intenta, y al volver la red sincroniza', async () => {
    const env = fakeEnv();
    env.setOnline(false);
    const { run } = start([OK], env);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
    expect(last()?.outcome).toEqual({ status: 'failed', failure: 'network' });
    env.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(last()?.outcome.status).toBe('ok');
  });

  it('al volver a la pestaña solo sincroniza si pasó un rato', async () => {
    const env = fakeEnv();
    const { run } = start([OK, OK, OK], env);
    await vi.advanceTimersByTimeAsync(0);
    env.show(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SYNC_MIN_GAP_MS);
    env.show(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('al irse de la pestaña sube lo pendiente sin esperar', async () => {
    const env = fakeEnv();
    const { run } = start([OK, OK], env);
    await vi.advanceTimersByTimeAsync(0);
    env.show(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('Sincronizar ahora corre aunque se haya sincronizado hace un momento', async () => {
    const { run } = start([OK, OK]);
    await vi.advanceTimersByTimeAsync(0);
    await scheduler?.syncNow();
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('detener', () => {
  it('quita los avisos y los temporizadores, y ya no reporta', async () => {
    const env = fakeEnv();
    const { run } = start([OK, OK, OK], env);
    await vi.advanceTimersByTimeAsync(0);
    expect(env.listeners()).toBe(2);
    const seen = reports.length;
    scheduler?.stop();
    expect(env.listeners()).toBe(0);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
    expect(run).toHaveBeenCalledTimes(1);
    expect(reports).toHaveLength(seen);
    await scheduler?.syncNow();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('una sincronización que termina después de detener no reporta', async () => {
    let release: (result: SyncResult) => void = () => undefined;
    start(
      () =>
        new Promise<SyncResult>((resolve) => {
          release = resolve;
        }),
    );
    const seen = reports.length;
    scheduler?.stop();
    release(OK);
    await vi.advanceTimersByTimeAsync(0);
    expect(reports).toHaveLength(seen);
  });
});
