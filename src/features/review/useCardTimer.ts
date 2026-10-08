// Temporizador opcional de una tarjeta (D-085, fila 8). Cuenta hacia atrás el tiempo sugerido y solo
// avisa, no califica ni bloquea nada. Está apagado por defecto para no subir la ansiedad. Se detiene
// mientras el estudio está en pausa y vuelve a empezar con cada tarjeta.
import { useEffect, useEffectEvent, useRef, useState } from 'react';

export interface CardTimer {
  /** Milisegundos que quedan del tiempo sugerido. 0 cuando se acabó */
  remainingMs: number;
  expired: boolean;
}

const TICK_MS = 250;

export function useCardTimer(input: {
  enabled: boolean;
  seconds: number;
  /** Cambia con cada tarjeta, para empezar de nuevo */
  resetKey: string | number;
  paused: boolean;
  /** Se llama una sola vez por tarjeta, en el momento en que se acaba el tiempo sugerido */
  onExpire?: () => void;
}): CardTimer {
  const { enabled, seconds, resetKey, paused } = input;
  const expire = useEffectEvent(() => {
    input.onExpire?.();
  });
  const totalMs = seconds * 1000;
  const [elapsedMs, setElapsedMs] = useState(0);
  const lastTick = useRef<number | null>(null);
  // Lo contado y si ya avisó, por tarjeta. Viven en refs para que el aviso salga del propio reloj
  const elapsedRef = useRef(0);
  const firedRef = useRef(false);

  // Cada tarjeta empieza con el tiempo completo. El estado se ajusta durante el pintado y no en un efecto
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setElapsedMs(0);
  }

  useEffect(() => {
    elapsedRef.current = 0;
    firedRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (!enabled || paused) return;
    // Cuenta desde el momento en que arranca o se reanuda, sin el rato en pausa
    lastTick.current = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const last = lastTick.current ?? now;
      lastTick.current = now;
      elapsedRef.current += Math.max(0, now - last);
      setElapsedMs(elapsedRef.current);
      if (!firedRef.current && elapsedRef.current >= totalMs) {
        firedRef.current = true;
        expire();
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, paused, resetKey, totalMs]);

  const remainingMs = Math.max(0, totalMs - elapsedMs);
  return { remainingMs, expired: enabled && remainingMs === 0 };
}
