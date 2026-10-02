// Reloj de estudio activo para una pantalla de estudio (D-063). Toda tecla o toque cuenta como
// actividad. Tras el límite sin actividad avisa que el estudio quedó en pausa.
import { useEffect, useRef, useState } from 'react';
import {
  checkIdle,
  closeActive,
  NEW_ACTIVE_TIME,
  resume,
  touch,
  type ActiveTime,
} from './activeTime';

function clock(): number {
  return Date.now();
}

export function useStudyClock(active: boolean) {
  const state = useRef<ActiveTime>(NEW_ACTIVE_TIME);
  // Minutos activos al momento de pausar. null mientras sigue estudiando
  const [pausedAt, setPausedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const onActivity = () => {
      state.current = touch(state.current, clock());
      if (state.current.paused) setPausedAt(state.current.activeMs);
    };
    onActivity();
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    const timer = window.setInterval(() => {
      state.current = checkIdle(state.current, clock());
      if (state.current.paused) setPausedAt(state.current.activeMs);
    }, 5000);
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.clearInterval(timer);
    };
  }, [active]);

  return {
    paused: pausedAt !== null,
    /** Milisegundos activos al pausar */
    pausedActiveMs: pausedAt ?? 0,
    resume: () => {
      state.current = resume(state.current, clock());
      setPausedAt(null);
    },
    /** Milisegundos activos hasta ahora */
    activeMs: () => closeActive(state.current, clock()),
  };
}
