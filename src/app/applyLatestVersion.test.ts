import { describe, expect, it, vi } from 'vitest';
import { applyLatestVersion, type UpdateEnvironment } from './applyLatestVersion';

type Listener = () => void;

function fakeWorker(state: ServiceWorkerState = 'installing') {
  const listeners = new Set<Listener>();
  const worker = {
    state,
    postMessage: vi.fn(),
    addEventListener: (_type: string, listener: Listener) => {
      listeners.add(listener);
    },
    become(next: ServiceWorkerState) {
      worker.state = next;
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
  return worker;
}

function setup(registration: unknown, extra: Partial<UpdateEnvironment> = {}) {
  const controllerListeners: Listener[] = [];
  const reload = vi.fn();
  const env: UpdateEnvironment = {
    serviceWorker: {
      getRegistration: () => Promise.resolve(registration as ServiceWorkerRegistration | undefined),
      addEventListener: ((_type: string, listener: Listener) => {
        controllerListeners.push(listener);
      }) as ServiceWorkerContainer['addEventListener'],
    },
    reload,
    ...extra,
  };
  const takeControl = () => {
    controllerListeners.forEach((listener) => {
      listener();
    });
  };
  return { env, reload, takeControl };
}

describe('actualizar a la versión nueva (D-146)', () => {
  it('sin service worker solo recarga', async () => {
    const reload = vi.fn();
    await applyLatestVersion({ serviceWorker: undefined, reload });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sin registro solo recarga', async () => {
    const { env, reload } = setup(undefined);
    await applyLatestVersion(env);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('con una versión nueva ya esperando le dice que tome el control y recarga cuando lo toma', async () => {
    const waiting = fakeWorker('installed');
    const update = vi.fn(() => Promise.resolve());
    const { env, reload, takeControl } = setup({ update, waiting, installing: null });
    await applyLatestVersion(env);
    expect(update).toHaveBeenCalled();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    takeControl();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('espera a que la versión nueva termine de bajarse y entonces la activa', async () => {
    const installing = fakeWorker('installing');
    const registration: { update: () => Promise<void>; waiting: unknown; installing: unknown } = {
      update: () => Promise.resolve(),
      waiting: null,
      installing,
    };
    const { env, takeControl, reload } = setup(registration);
    const pending = applyLatestVersion(env);
    await Promise.resolve();
    await Promise.resolve();
    registration.waiting = installing;
    installing.become('installed');
    await pending;
    expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    takeControl();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reintentar con la versión nueva ya activa y sin nada esperando recarga directo', async () => {
    const update = vi.fn(() => Promise.resolve());
    const { env, reload } = setup({ update, waiting: null, installing: null });
    await applyLatestVersion(env);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('si no aparece una versión nueva a tiempo, recarga sin ella', async () => {
    vi.useFakeTimers();
    const installing = fakeWorker('installing');
    const { env, reload } = setup(
      { update: () => Promise.resolve(), waiting: null, installing },
      { waitMs: 1000 },
    );
    const pending = applyLatestVersion(env);
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('si algo falla recarga', async () => {
    const { env, reload } = setup({
      update: () => Promise.reject(new Error('sin red')),
      waiting: null,
      installing: null,
    });
    await applyLatestVersion(env);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
