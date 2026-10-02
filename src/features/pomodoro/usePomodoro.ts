// Controles del Pomodoro (9.2). Registra cada fase como evento con los minutos reales, que usan la
// racha, el heatmap y el planificador. Al terminar una fase avisa con sonido, confeti pequeño,
// aviso en la página y, con permiso, notificación, y deja lista la fase siguiente sin arrancarla.
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { usePreferences } from '@/app/preferences';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { t } from '@/i18n/es-MX';
import { celebrate } from '@/ui/celebrate';
import type { ReadySession } from '../shared/RequireSession';
import {
  elapsedMinutes,
  IDLE,
  nextPhase,
  phaseMinutes,
  remainingMs,
  usePomodoroTimer,
  type PomodoroPhase,
} from './timer';

const UI_KEY = 'enarm.pomodoro.ui.v1';

function loadMinimized(): boolean {
  try {
    // Opcional (D-063). Hasta que el alumno lo abra, se ve solo el ícono
    return localStorage.getItem(UI_KEY) !== 'max';
  } catch {
    return true;
  }
}

/** Estado de la vista del Pomodoro. Minimizado se recuerda en este dispositivo */
export const usePomodoroUi = create<{
  minimized: boolean;
  /** Aviso al terminar una fase. Vacío si no hay */
  message: string;
  setMinimized: (value: boolean) => void;
  setMessage: (value: string) => void;
}>()((set) => ({
  minimized: typeof localStorage === 'undefined' ? true : loadMinimized(),
  message: '',
  setMinimized: (minimized) => {
    set({ minimized });
    try {
      localStorage.setItem(UI_KEY, minimized ? 'min' : 'max');
    } catch {
      // Sin almacenamiento se recuerda solo en esta sesión
    }
  },
  setMessage: (message) => {
    set({ message });
  },
}));

function beep() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.8);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.8);
  } catch {
    // Sin audio disponible, queda el aviso visual
  }
}

function notify(text: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(text);
    }
  } catch {
    // Algunos navegadores solo notifican desde el service worker
  }
}

export function usePomodoro(session: ReadySession) {
  const api = useDataApi();
  const { user, settings } = session;
  const config = settings.pomodoro;
  const timer = usePomodoroTimer();
  const setMessage = usePomodoroUi((ui) => ui.setMessage);
  const [now, setNow] = useState(() => Date.now());
  const own = timer.userId === null || timer.userId === user.id;
  const state = own ? timer : { ...IDLE, set: timer.set };

  const record = (
    type: 'pomodoro_started' | 'pomodoro_completed' | 'pomodoro_interrupted',
    phase: PomodoroPhase,
    minutes: number,
  ) => {
    const plannedMinutes = phaseMinutes(phase, config);
    const ctx = { userId: user.id, tz: user.timeZone };
    const event =
      type === 'pomodoro_started'
        ? createEvent(type, { phase, plannedMinutes, cycle: state.cycle }, ctx)
        : createEvent(
            type,
            { phase, plannedMinutes, actualMinutes: Math.min(600, Math.round(minutes * 10) / 10) },
            ctx,
          );
    void api.recordEvent(event);
  };

  // Cierra la fase cuando llega su marca de tiempo. Se llama desde el reloj, que es externo a React
  const finishIfDue = (at: number) => {
    if (!own || state.status !== 'running' || state.endsAt === null || at < state.endsAt) return;
    const finished = state.phase;
    record('pomodoro_completed', finished, elapsedMinutes(state, state.endsAt));
    const next = nextPhase(state, config);
    const text = `${t.pomodoro.finished(t.pomodoro.phases[finished])}. ${t.pomodoro.next(t.pomodoro.phases[next.phase])}`;
    setMessage(text);
    // También respeta el ajuste general de sonidos (D-061)
    if (config.sound && usePreferences.getState().appearance.sounds) beep();
    if (finished === 'focus') celebrate('small');
    if (config.notifications) notify(text);
    state.set({ ...IDLE, userId: user.id, ...next });
  };
  const finishRef = useRef(finishIfDue);
  useEffect(() => {
    finishRef.current = finishIfDue;
  });
  useEffect(() => {
    const tick = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      finishRef.current(at);
    }, 1000);
    return () => {
      window.clearInterval(tick);
    };
  }, []);

  const start = () => {
    const minutes = phaseMinutes(state.phase, config);
    const at = Date.now();
    state.set({
      userId: user.id,
      status: 'running',
      startedAt: at,
      endsAt: at + minutes * 60000,
      remainingMs: null,
      elapsedBeforePauseMs: 0,
    });
    record('pomodoro_started', state.phase, 0);
    setMessage('');
  };
  const pause = () => {
    const at = Date.now();
    state.set({
      status: 'paused',
      remainingMs: remainingMs(state, at),
      elapsedBeforePauseMs:
        state.elapsedBeforePauseMs + (state.startedAt ? at - state.startedAt : 0),
      endsAt: null,
      startedAt: null,
    });
  };
  const resume = () => {
    const at = Date.now();
    state.set({
      status: 'running',
      startedAt: at,
      endsAt: at + (state.remainingMs ?? 0),
      remainingMs: null,
    });
  };
  const stop = (skip: boolean) => {
    if (state.status !== 'idle')
      record('pomodoro_interrupted', state.phase, elapsedMinutes(state, Date.now()));
    const next = skip ? nextPhase(state, config) : { phase: state.phase, cycle: state.cycle };
    state.set({ ...IDLE, userId: user.id, ...next });
  };

  const total = phaseMinutes(state.phase, config) * 60000;
  const left = state.status === 'idle' ? total : remainingMs(state, now);
  return { state, config, left, total, start, pause, resume, stop };
}
