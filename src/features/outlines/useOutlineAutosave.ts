// Guardado automático de un apunte. Junta los cambios mientras el alumno escribe, guarda una vez que
// se detiene y nunca guarda dos veces a la vez, así un guardado lento no pisa a uno más nuevo. Si
// falla, el texto sigue en pantalla y se vuelve a intentar con el siguiente cambio. Al cerrar la
// pantalla o ir a segundo plano guarda lo que falte. Otra escritura del mismo apunte, como su mazo y
// su tema, entra en la misma fila con flushThen, así nunca se cruza con un guardado automático.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OutlineNode } from '@/engines/outline';

export interface OutlinePayload {
  nodes: OutlineNode[];
  title: string;
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

/** Cómo terminó un guardado. Sin nada pendiente cuenta como guardado */
export type FlushResult = { saved: true } | { saved: false; error: unknown };

const SAVED: FlushResult = { saved: true };

export const AUTOSAVE_DELAY_MS = 1200;

export function useOutlineAutosave(
  save: (payload: OutlinePayload) => Promise<unknown>,
  delayMs: number = AUTOSAVE_DELAY_MS,
) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  // Por qué falló el último guardado, para que la pantalla diga algo más útil que "no se pudo"
  const [error, setError] = useState<unknown>(null);
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

  /**
   * Guarda lo pendiente. Las llamadas se ponen en fila y cada una guarda lo más reciente. Nunca
   * falla. Dice si quedó guardado o por qué no, para que quien sigue sepa si puede escribir encima
   */
  const flush = useCallback((): Promise<FlushResult> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const run = chain.current.then(async (): Promise<FlushResult> => {
      // Lo que falló antes sigue pendiente, así que nada pendiente es que todo quedó guardado
      const payload = pending.current;
      if (!payload) return SAVED;
      pending.current = null;
      show('saving');
      try {
        await saveRef.current(payload);
        if (mounted.current) setError(null);
        // Mientras guardaba pudo llegar otro cambio
        show(hasPending() ? 'unsaved' : 'saved');
        return SAVED;
      } catch (failure) {
        // Lo que falló no pisa a lo que se escribió después
        pending.current ??= payload;
        if (mounted.current) setError(failure);
        show('error');
        return { saved: false, error: failure };
      }
    });
    chain.current = run.then(() => undefined);
    return run;
  }, [show]);

  /**
   * Guarda lo pendiente y después corre work en la misma fila, con lo que salió de ese guardado.
   * Ningún guardado automático corre mientras work escribe, así no se pisan la fecha del apunte. Si
   * work falla, la promesa falla y la fila sigue. work no debe llamar a flush, que lo esperaría a él
   */
  const flushThen = useCallback(
    <T>(work: (flushed: FlushResult) => Promise<T>): Promise<T> => {
      const run = flush().then(work);
      chain.current = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    [flush],
  );

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

  return { status, error, schedule, flush, flushThen };
}
