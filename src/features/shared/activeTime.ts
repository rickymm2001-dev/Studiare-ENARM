// Tiempo de estudio activo (D-063). Suma el tiempo entre una interacción y la siguiente mientras el
// hueco no pase del límite de inactividad. Si pasa, la sesión queda en pausa y ese hueco no cuenta.
// Funciones puras sobre un estado simple, para poder probarlas sin React.

/** Minutos sin tocar nada antes de pausar el estudio. Entre los 2 y 3 que pidió Ricardo (J) */
export const IDLE_LIMIT_MS = 150_000;

export interface ActiveTime {
  activeMs: number;
  /** Última interacción, en ms. null antes de empezar */
  lastAt: number | null;
  paused: boolean;
}

export const NEW_ACTIVE_TIME: ActiveTime = { activeMs: 0, lastAt: null, paused: false };

/** Registra una interacción. En pausa no suma hasta que el alumno reanude */
export function touch(state: ActiveTime, now: number, limit = IDLE_LIMIT_MS): ActiveTime {
  if (state.paused) return state;
  if (state.lastAt === null) return { ...state, lastAt: now };
  const gap = Math.max(0, now - state.lastAt);
  if (gap > limit) return { ...state, paused: true };
  return { ...state, activeMs: state.activeMs + gap, lastAt: now };
}

/** Revisa si ya pasó el límite sin interacción */
export function checkIdle(state: ActiveTime, now: number, limit = IDLE_LIMIT_MS): ActiveTime {
  if (state.paused || state.lastAt === null) return state;
  return now - state.lastAt > limit ? { ...state, paused: true } : state;
}

export function resume(state: ActiveTime, now: number): ActiveTime {
  return { ...state, paused: false, lastAt: now };
}

/** Cierra la cuenta. Suma el último tramo si no estaba en pausa ni pasaba del límite */
export function closeActive(state: ActiveTime, now: number, limit = IDLE_LIMIT_MS): number {
  if (state.paused || state.lastAt === null) return state.activeMs;
  const gap = Math.max(0, now - state.lastAt);
  return gap > limit ? state.activeMs : state.activeMs + gap;
}
