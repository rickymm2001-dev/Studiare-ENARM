// Estado del Pomodoro (9.2). Cuenta con marcas de tiempo y no con intervalos, así no se desfasa en
// segundo plano. Vive en un almacén de módulo para seguir corriendo al cambiar de pantalla, y se
// guarda en localStorage para sobrevivir a una recarga. La lógica de fases es pura y tiene prueba.
import { create } from 'zustand';

export type PomodoroPhase = 'focus' | 'short_break' | 'long_break';

export interface PomodoroConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLong: number;
}

export interface TimerState {
  userId: string | null;
  phase: PomodoroPhase;
  /** Ciclo de enfoque en curso, desde 1 */
  cycle: number;
  status: 'idle' | 'running' | 'paused';
  /** Momento en ms en que termina la fase, si corre */
  endsAt: number | null;
  /** Milisegundos que faltaban al pausar */
  remainingMs: number | null;
  /** Momento en que empezó la fase, para medir los minutos reales */
  startedAt: number | null;
  /** Minutos ya corridos antes de pausar */
  elapsedBeforePauseMs: number;
}

export const IDLE: TimerState = {
  userId: null,
  phase: 'focus',
  cycle: 1,
  status: 'idle',
  endsAt: null,
  remainingMs: null,
  startedAt: null,
  elapsedBeforePauseMs: 0,
};

export function phaseMinutes(phase: PomodoroPhase, config: PomodoroConfig): number {
  return phase === 'focus'
    ? config.focusMinutes
    : phase === 'short_break'
      ? config.shortBreakMinutes
      : config.longBreakMinutes;
}

/** Fase que sigue al terminar la actual. Descanso largo cada N ciclos de enfoque */
export function nextPhase(
  state: Pick<TimerState, 'phase' | 'cycle'>,
  config: PomodoroConfig,
): Pick<TimerState, 'phase' | 'cycle'> {
  if (state.phase === 'focus') {
    return {
      phase: state.cycle % config.cyclesBeforeLong === 0 ? 'long_break' : 'short_break',
      cycle: state.cycle,
    };
  }
  return { phase: 'focus', cycle: state.phase === 'long_break' ? 1 : state.cycle + 1 };
}

export function remainingMs(state: TimerState, now: number): number {
  if (state.status === 'running' && state.endsAt !== null) return Math.max(0, state.endsAt - now);
  if (state.status === 'paused' && state.remainingMs !== null) return state.remainingMs;
  return 0;
}

/** Minutos reales corridos en la fase, sin contar las pausas */
export function elapsedMinutes(state: TimerState, now: number): number {
  const running =
    state.status === 'running' && state.startedAt !== null ? now - state.startedAt : 0;
  return (state.elapsedBeforePauseMs + running) / 60000;
}

const STORAGE_KEY = 'enarm.pomodoro.v1';

function load(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...IDLE, ...(JSON.parse(raw) as Partial<TimerState>) } : IDLE;
  } catch {
    return IDLE;
  }
}

function persist(state: TimerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Sin almacenamiento el temporizador sigue en memoria
  }
}

export const usePomodoroTimer = create<
  TimerState & { set: (patch: Partial<TimerState>) => void }
>()((set, get) => ({
  ...(typeof localStorage === 'undefined' ? IDLE : load()),
  set: (patch) => {
    set(patch);
    const { set: _set, ...state } = get();
    persist(state);
  },
}));

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
