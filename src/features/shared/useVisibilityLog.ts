// Registra cuándo el alumno sale de la pestaña y cuándo vuelve durante una sesión, con cuánto tiempo
// estuvo fuera (6.3 y 7.6). Sirve para medir la distracción en un examen de horas y no cambia nada
// de lo que ve el alumno.
import { useEffect } from 'react';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import type { EventPayload } from '@/data/schemas/events';

type VisibilityPayload = EventPayload<'visibility_changed'>;

/** Lo que se registra al salir (hiddenAt es null) o al volver con el momento en que salió */
export function visibilityPayload(
  hidden: boolean,
  hiddenAt: number | null,
  now: number,
): VisibilityPayload {
  if (hidden) return { hidden: true, awayMs: null };
  return {
    hidden: false,
    awayMs: hiddenAt === null ? null : Math.max(0, Math.round(now - hiddenAt)),
  };
}

export function useVisibilityLog(input: {
  userId: string;
  timeZone: string;
  /** La sesión que se está viviendo. null si no hay ninguna y entonces no se registra nada */
  sessionId: string | null;
}) {
  const api = useDataApi();
  const { userId, timeZone, sessionId } = input;
  useEffect(() => {
    if (sessionId === null) return;
    let hiddenAt: number | null = null;
    const onChange = () => {
      const hidden = document.visibilityState === 'hidden';
      const now = Date.now();
      const payload = visibilityPayload(hidden, hiddenAt, now);
      hiddenAt = hidden ? now : null;
      void api.recordEvent(
        createEvent('visibility_changed', payload, { userId, tz: timeZone, sessionId }),
      );
    };
    document.addEventListener('visibilitychange', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
    };
  }, [api, userId, timeZone, sessionId]);
}
