// Cuándo sincronizar (D-095). La sincronización la hace runSync, y aquí se decide cuándo correrla.
// Corre al abrir la sesión, cada 5 minutos, al volver a la pestaña, al irse de ella, al recuperar la
// conexión y cuando el alumno lo pide. Nunca corren dos a la vez. Si falla por red o por el servidor
// reintenta con una espera que crece. Si falla porque otro dispositivo tiene la cuenta o porque la
// sesión venció, no insiste, porque no se arregla solo. No toca React.
import type { SyncResult } from '@/data/sync/runSync';
import type { SyncFailure } from '@/data/sync/transport';
import { retryDelayMs } from '@/engines/sync';

export const SYNC_INTERVAL_MS = 5 * 60_000;
/** Al volver a la pestaña no se sincroniza si se hizo hace menos de esto */
export const SYNC_MIN_GAP_MS = 60_000;

export type SyncOutcome =
  | { status: 'never' }
  | { status: 'ok'; at: string; pulled: number; pushed: number; rejected: number }
  | { status: 'clock_skew'; skewMs: number }
  | { status: 'failed'; failure: SyncFailure };

export interface SyncUiState {
  running: boolean;
  outcome: SyncOutcome;
  /** Cuándo terminó la última sincronización buena. Se conserva aunque la siguiente falle */
  lastSyncAt: string | null;
}

export const INITIAL_SYNC_UI: SyncUiState = {
  running: false,
  outcome: { status: 'never' },
  lastSyncAt: null,
};

/** Lo que el programador necesita saber del navegador, para probarlo sin uno */
export interface SyncEnvironment {
  isOnline(): boolean;
  onOnline(listener: () => void): () => void;
  /** Avisa cada vez que la pestaña se muestra (true) o se oculta (false) */
  onVisibility(listener: (visible: boolean) => void): () => void;
}

export const browserEnvironment: SyncEnvironment = {
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  onOnline: (listener) => {
    window.addEventListener('online', listener);
    return () => {
      window.removeEventListener('online', listener);
    };
  },
  onVisibility: (listener) => {
    const onChange = () => {
      listener(document.visibilityState !== 'hidden');
    };
    const onHide = () => {
      listener(false);
    };
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('pagehide', onHide);
    };
  },
};

export interface SyncScheduler {
  /** Sincroniza ya. Si ya hay una corriendo, espera a esa */
  syncNow(): Promise<void>;
  stop(): void;
}

export interface SchedulerDeps {
  run: () => Promise<SyncResult>;
  report: (state: SyncUiState) => void;
  env?: SyncEnvironment;
  now?: () => number;
}

/** Las causas que se arreglan solas con tiempo. Las demás piden que el alumno haga algo */
function retriable(failure: SyncFailure): boolean {
  return failure === 'network' || failure === 'server' || failure === 'local';
}

export function startSyncScheduler(deps: SchedulerDeps): SyncScheduler {
  const env = deps.env ?? browserEnvironment;
  const now = deps.now ?? (() => Date.now());
  let stopped = false;
  let running: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let lastStart = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let state = INITIAL_SYNC_UI;

  const isStopped = () => stopped;

  const publish = (patch: Partial<SyncUiState>) => {
    state = { ...state, ...patch };
    if (!stopped) deps.report(state);
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const schedule = (delay: number) => {
    clearTimer();
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      void trigger();
    }, delay);
  };

  /** Si llegó otra petición mientras corría la sincronización. Lo lee y lo apaga */
  const wantsAnother = (): boolean => {
    const pending = again;
    again = false;
    return pending;
  };

  const attempt = async (): Promise<boolean> => {
    lastStart = now();
    publish({ running: true });
    const result = await deps.run();
    if (stopped) return false;
    if (result.status === 'ok') {
      failures = 0;
      publish({
        running: false,
        lastSyncAt: result.at,
        outcome: {
          status: 'ok',
          at: result.at,
          pulled: result.recordsPulled + result.eventsPulled,
          pushed: result.recordsPushed + result.eventsPushed,
          rejected: result.rejected,
        },
      });
      schedule(SYNC_INTERVAL_MS);
      return true;
    }
    if (result.status === 'clock_skew') {
      publish({ running: false, outcome: { status: 'clock_skew', skewMs: result.skewMs } });
      schedule(SYNC_INTERVAL_MS);
      return false;
    }
    failures += 1;
    publish({ running: false, outcome: { status: 'failed', failure: result.failure } });
    if (retriable(result.failure)) schedule(retryDelayMs(failures));
    else clearTimer();
    return false;
  };

  function trigger(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    if (!env.isOnline()) {
      // Sin conexión no se intenta. Al volver la red, el aviso online lo dispara
      publish({ outcome: { status: 'failed', failure: 'network' } });
      clearTimer();
      return Promise.resolve();
    }
    running = (async () => {
      let succeeded = await attempt();
      // Un cambio que llegó mientras corría se manda enseguida, pero solo si la vez anterior salió bien
      while (succeeded && wantsAnother() && !isStopped()) {
        succeeded = await attempt();
      }
    })().finally(() => {
      running = null;
    });
    return running;
  }

  const offOnline = env.onOnline(() => {
    void trigger();
  });
  const offVisibility = env.onVisibility((visible) => {
    // Al irse de la pestaña se sube lo pendiente. Al volver, solo si pasó un rato
    if (!visible || now() - lastStart >= SYNC_MIN_GAP_MS) void trigger();
  });

  void trigger();

  return {
    syncNow: trigger,
    stop() {
      stopped = true;
      clearTimer();
      offOnline();
      offVisibility();
    },
  };
}
