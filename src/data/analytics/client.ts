// El cliente de analítica (B15, 1.4). Une el catálogo (la única puerta, track), la cola y el transporte,
// y decide con la tabla de gate.ts cuándo junta y cuándo manda. No sabe de React ni de Dexie. Pesa unos
// 2.5 KB comprimidos y por eso no va en el JavaScript inicial: lo baja control.ts la primera vez que se
// puede juntar algo, es decir, solo para quien dio el permiso. Quien lo maneja es control.ts.
//
// Tres estados, sin saltos entre ellos que no pasen por apagado
//   - off. Falta algo de la tabla, y no se junta nada ni en memoria. El sink de track queda quitado, el
//     permiso en false (o null si no se sabe) y la cola vacía, sin mandar
//   - collecting. Todo está en regla menos el identificador. Los eventos esperan en la cola, con tope
//   - sending. Con el identificador, la cola manda cada 20 eventos o cada 10 segundos, y al ocultar la
//     pestaña. Sin cookies, sin localStorage y sin sessionStorage: el identificador vive en memoria
//
// Medir no rompe nada. Ningún error sale de aquí ni se escribe en la consola
import { setAnalyticsConsent, setAnalyticsSink, type AnalyticsRecord } from './catalog';
import type { AnalyticsConfig } from './config';
import { canCollect, sendBlock, type GateInput } from './gate';
import { createAnalyticsQueue, type QueueTimers } from './queue';
import { sendEvents, toWireEvent, type CommonProperties, type WireEvent } from './transport';

/** Lo que cambia con la sesión y viaja en todos los eventos (1.4) */
export interface AnalyticsContext {
  plan_kind: CommonProperties['plan_kind'];
  role: CommonProperties['role'];
}

export type AnalyticsState = 'off' | 'collecting' | 'sending';

/** Lo que el cliente necesita saber para decidir. AnalyticsGate lo va actualizando */
export type ClientInputs = GateInput & { context: AnalyticsContext };

/** Del navegador, aparte para que las pruebas lo pongan a mano */
export interface AnalyticsEnvironment {
  /** El ancho de la ventana en pixeles */
  width: () => number;
  /** Si la app corre instalada como PWA */
  installed: () => boolean;
  /** La versión de la app, VITE_BUILD_ID */
  version: () => string;
  /** Escucha que la pestaña se oculta. Devuelve cómo dejar de escuchar */
  onHide: (run: () => void) => () => void;
}

export interface ClientDeps {
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  timers?: QueueTimers;
  environment?: AnalyticsEnvironment;
}

/** Menos de 640 pixeles es teléfono, igual que el resto de la app */
export const PHONE_MAX_WIDTH = 639;

const browserEnvironment: AnalyticsEnvironment = {
  width: () => window.innerWidth,
  installed: () => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  },
  version: () => {
    const value: unknown = import.meta.env.VITE_BUILD_ID;
    return typeof value === 'string' && value !== '' ? value : 'dev';
  },
  onHide: (run) => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', run);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', run);
    };
  },
};

const FRESH: ClientInputs = {
  flag: false,
  config: null,
  consent: null,
  database: 'real',
  appEnv: 'development',
  cloud: false,
  analyticsId: null,
  context: { plan_kind: 'free', role: 'student' },
};

export function createAnalyticsClient(deps: ClientDeps = {}) {
  const environment = deps.environment ?? browserEnvironment;
  let inputs: ClientInputs = FRESH;
  let state: AnalyticsState = 'off';
  let stopListening: (() => void) | null = null;

  const common = (): CommonProperties => ({
    app_version: environment.version(),
    platform: environment.width() <= PHONE_MAX_WIDTH ? 'phone' : 'desktop',
    installed: environment.installed(),
    ...inputs.context,
  });

  const queue = createAnalyticsQueue({
    ready: () => state === 'sending',
    deliver: (records) => {
      const { config, analyticsId } = inputs;
      // Por si cambió algo entre que se agendó el lote y ahora
      if (config === null || analyticsId === null || state !== 'sending') return;
      const properties = common();
      const events: WireEvent[] = records.map((record) =>
        toWireEvent(record, analyticsId, properties),
      );
      void sendEvents(config, events, deps.fetch, () => state === 'sending');
    },
    ...(deps.timers ? { timers: deps.timers } : {}),
  });

  const sink = (record: AnalyticsRecord) => {
    queue.push(record);
  };

  const evaluate = () => {
    const next: AnalyticsState =
      sendBlock(inputs) === null ? 'sending' : canCollect(inputs) ? 'collecting' : 'off';
    state = next;
    if (next === 'off') {
      setAnalyticsSink(null);
      setAnalyticsConsent(inputs.consent === null ? null : false);
      queue.clear();
      stopListening?.();
      stopListening = null;
      return;
    }
    setAnalyticsConsent(true);
    setAnalyticsSink(sink);
    stopListening ??= environment.onHide(() => {
      queue.flush();
    });
    if (next === 'sending') queue.wake();
  };

  return {
    /** Cambia lo que sabe el cliente y vuelve a decidir. Lo que no se pasa se queda como estaba */
    update(patch: Partial<ClientInputs>): void {
      try {
        inputs = { ...inputs, ...patch };
        evaluate();
      } catch {
        // Medir nunca debe causar un error. Ante la duda se apaga
        state = 'off';
        setAnalyticsSink(null);
        setAnalyticsConsent(false);
        queue.clear();
      }
    },
    state: (): AnalyticsState => state,
    /** El permiso que el cliente tiene en este momento. null es que todavía no se sabe */
    consent: (): boolean | null => inputs.consent,
    /** La config que usa, para las pruebas */
    config: (): AnalyticsConfig | null => inputs.config,
    queued: () => queue.size(),
    /** Recibe un evento que control.ts juntó mientras este archivo se bajaba. Fuera de juntar, lo tira */
    accept: (record: AnalyticsRecord): void => {
      if (state !== 'off') queue.push(record);
    },
    /** Manda lo que haya sin esperar. Lo usan las pruebas y el cierre de la pestaña */
    flush: () => {
      queue.flush();
    },
    /** Deja todo apagado y vacío, como al abrir la pestaña */
    reset(): void {
      inputs = FRESH;
      evaluate();
    },
  };
}

/** El cliente de la app. Uno solo por pestaña */
export const analytics = createAnalyticsClient();
