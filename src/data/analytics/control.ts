// El control de la analítica, la parte que vive en el JavaScript inicial (B15, 1.4 y 5.4). Es muy chico a
// propósito: sabe leer lo que no cambia con la sesión (la bandera, la llave, el entorno y si hay nube), aplica
// la tabla de gate.ts y, solo cuando todo está en regla para juntar eventos, baja el cliente completo con su
// cola y su transporte (client.ts). Quien nunca dio el permiso nunca descarga el cliente.
//
// Mientras el cliente se baja, que son unos milisegundos, los eventos esperan en una cola de emergencia en
// memoria con tope, y se la pasan al cliente al llegar. Esa cola solo existe con todo en regla (el permiso
// incluido), así que no junta nada de quien no lo dio. Si el permiso se retira antes de que llegue, se tira.
//
// Lo manejan AnalyticsGate, con lo que sabe de la sesión, y el registro (trackSignupCompleted), que ocurre
// antes de que haya sesión. Medir no rompe nada: ningún error sale de aquí
import { isFeatureEnabled, readAppEnv } from '@/config/featureFlags';
import { cloudConfigured } from '@/data/cloud/client';
import {
  setAnalyticsConsent,
  setAnalyticsSink,
  track,
  type AnalyticsRecord,
  type PropsOf,
} from './catalog';
import type * as ClientModule from './client';
import type { AnalyticsState, ClientInputs } from './client';
import { readAnalyticsConfig } from './config';
import { collectBlock } from './gate';

/** Cuántos eventos aguanta la cola de emergencia mientras se baja el cliente */
export const MAX_EARLY_EVENTS = 50;

type Heavy = typeof ClientModule;
type Statics = Pick<ClientInputs, 'flag' | 'config' | 'appEnv' | 'cloud'>;

const BASE: Omit<ClientInputs, keyof Statics> = {
  consent: null,
  database: 'real',
  analyticsId: null,
  context: { plan_kind: 'free', role: 'student' },
};

interface ControlState {
  inputs: ClientInputs | null;
  early: AnalyticsRecord[];
  heavy: Heavy | null;
  loading: Promise<void> | null;
}

const fresh = (): ControlState => ({ inputs: null, early: [], heavy: null, loading: null });
let state = fresh();

/**
 * Lo que no cambia en toda la vida de la pestaña. La bandera llega del servidor y se aplica al recargar, la llave y
 * el entorno se fijan al construir. Se lee una vez
 */
export function staticInputs(): Statics {
  return {
    flag: isFeatureEnabled('productAnalytics'),
    config: readAnalyticsConfig(),
    appEnv: readAppEnv(),
    cloud: cloudConfigured(),
  };
}

const currentInputs = (): ClientInputs => (state.inputs ??= { ...BASE, ...staticInputs() });

/**
 * Si esta pestaña puede medir alguna vez: bandera prendida, llave puesta, fuera de desarrollo y con nube. Sin esto
 * ni siquiera se monta AnalyticsGate. No mira el permiso, que es de cada alumno
 */
export function analyticsPossible(): boolean {
  const { flag, config, appEnv, cloud } = { ...BASE, ...staticInputs() };
  return collectBlock({ flag, config, appEnv, cloud, consent: true, database: 'real' }) === null;
}

const earlySink = (record: AnalyticsRecord) => {
  state.early.push(record);
  if (state.early.length > MAX_EARLY_EVENTS) state.early = state.early.slice(-MAX_EARLY_EVENTS);
};

function loadHeavy(): void {
  state.loading ??= import('./client')
    .then((module) => {
      state.heavy = module;
      module.analytics.update(currentInputs());
      const waiting = state.early;
      state.early = [];
      for (const record of waiting) module.analytics.accept(record);
    })
    // Un archivo que no baja, por una red intermitente, se vuelve a intentar con el siguiente cambio
    .catch(() => {
      state.loading = null;
    });
}

function turnOff(): void {
  state.early = [];
  setAnalyticsSink(null);
  setAnalyticsConsent(currentInputs().consent === null ? null : false);
}

/** Cambia lo que sabe la analítica y vuelve a decidir. Lo que no se pasa se queda como estaba */
export function updateAnalytics(patch: Partial<ClientInputs>): void {
  try {
    state.inputs = { ...currentInputs(), ...patch };
    if (state.heavy) {
      state.heavy.analytics.update(patch);
    } else if (collectBlock(state.inputs) === null) {
      setAnalyticsConsent(true);
      setAnalyticsSink(earlySink);
      loadHeavy();
    } else {
      turnOff();
    }
  } catch {
    // Medir nunca debe causar un error. Ante la duda se apaga
    turnOff();
  }
}

/** En qué está la analítica. loading es que todo está en regla y el cliente todavía se baja */
export function analyticsState(): AnalyticsState | 'loading' {
  if (state.heavy) return state.heavy.analytics.state();
  return state.inputs !== null && collectBlock(state.inputs) === null ? 'loading' : 'off';
}

/**
 * signup_completed pasa antes de que haya sesión, y con ella el permiso que lee AnalyticsGate. Por eso el
 * permiso que vale aquí es el de la casilla del registro que el alumno acaba de llenar. Si la marcó, la
 * analítica pasa a juntar y el evento espera a que llegue el identificador. Si no, no hace nada y no junta
 * nada. AnalyticsGate confirma el permiso con la bitácora cuando abre la sesión
 */
export function trackSignupCompleted(granted: boolean, props: PropsOf<'signup_completed'>): void {
  if (!granted) return;
  updateAnalytics({ consent: true });
  track('signup_completed', props);
}

/** Deja el control como al abrir la pestaña, y el cliente también. Lo usan las pruebas */
export function resetAnalyticsControl(): void {
  state.heavy?.analytics.reset();
  setAnalyticsSink(null);
  state = fresh();
}
