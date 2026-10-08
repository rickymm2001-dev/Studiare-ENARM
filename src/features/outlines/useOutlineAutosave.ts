// Guardado automático de un apunte. Junta los cambios mientras el alumno escribe, guarda una vez que
// se detiene y nunca guarda dos veces a la vez, así un guardado lento no pisa a uno más nuevo. Si
// falla, el texto sigue en pantalla y se vuelve a intentar con el siguiente cambio. Al cerrar la
// pantalla o ir a segundo plano guarda lo que falte.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OutlineNode } from '@/engines/outline';

export interface OutlinePayload {
  nodes: OutlineNode[];
  title: string;
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

export const AUTOSAVE_DELAY_MS = 1200;

export function useOutlineAutosave(
  save: (payload: OutlinePayload) => Promise<unknown>,
  delayMs: number = AUTOSAVE_DELAY_MS,
) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const pending = useRef<OutlinePayload | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const hasPending = () => pending.current !== null;
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const show = useCallback((next: SaveStatus) => {
    if (mounted.current) setStatus(next);
  }, []);

  /** Guarda lo pendiente. Las llamadas se ponen en fila y cada una guarda lo más reciente */
  const flush = useCallback((): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    chain.current = chain.current.then(async () => {
      const payload = pending.current;
      if (!payload) return;
      pending.current = null;
      show('saving');
      try {
        await saveRef.current(payload);
        // Mientras guardaba pudo llegar otro cambio
        show(hasPending() ? 'unsaved' : 'saved');
      } catch {
        // Lo que falló no pisa a lo que se escribió después
        pending.current ??= payload;
        show('error');
      }
    });
    return chain.current;
  }, [show]);

  const schedule = useCallback(
    (payload: OutlinePayload) => {
      pending.current = payload;
      show('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, delayMs);
    },
    [delayMs, flush, show],
  );

  useEffect(() => {
    mounted.current = true;
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = () => {
      void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      // Al salir de la pantalla se guarda lo que falte, sin intentar mostrar nada
      void flush();
      mounted.current = false;
    };
  }, [flush]);

  return { status, schedule, flush };
}
