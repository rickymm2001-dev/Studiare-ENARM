// Cola de eventos en memoria (B15, 1.4). Junta hasta 20 eventos o 10 segundos y los entrega en un lote.
// Mientras no se pueda mandar, por ejemplo porque el identificador seudónimo todavía no llega del
// servidor, los eventos esperan aquí con un tope, y el más viejo cede su lugar al nuevo. Nunca toca el
// disco ni el navegador, y quien la vacía no manda nada. Sin React ni red, para probarla con relojes falsos.
import type { AnalyticsRecord } from './catalog';

/** Cuántos eventos juntan un lote antes de que pasen los 10 segundos */
export const QUEUE_BATCH_SIZE = 20;
/** Cuánto espera el primer evento de un lote antes de salir */
export const QUEUE_MAX_WAIT_MS = 10_000;
/** Cuántos eventos aguanta la cola si no se puede mandar. Pasado el tope se pierde el más viejo */
export const QUEUE_MAX_PENDING = 50;

export interface QueueTimers {
  /** Agenda una llamada y devuelve cómo cancelarla */
  schedule: (run: () => void, ms: number) => () => void;
}

const defaultTimers: QueueTimers = {
  schedule: (run, ms) => {
    const id = setTimeout(run, ms);
    return () => {
      clearTimeout(id);
    };
  },
};

export interface QueueDeps {
  /** Se entrega un lote ya sacado de la cola. No debe lanzar, y si lanza la cola lo ignora */
  deliver: (records: AnalyticsRecord[]) => void;
  /** Si en este momento se puede mandar. Sin esto los eventos esperan */
  ready: () => boolean;
  timers?: QueueTimers;
}

export interface AnalyticsQueue {
  /** Agrega un evento. Con la cola lista y 20 juntos, sale el lote al instante */
  push: (record: AnalyticsRecord) => void;
  /** Entrega lo que haya si se puede mandar. Lo usa el cierre de la pestaña */
  flush: () => void;
  /** Avisa que ahora sí se puede mandar, por ejemplo al llegar el identificador */
  wake: () => void;
  /** Tira todo sin mandar y cancela la espera. Lo usa el retiro del permiso */
  clear: () => void;
  size: () => number;
}

export function createAnalyticsQueue(deps: QueueDeps): AnalyticsQueue {
  const timers = deps.timers ?? defaultTimers;
  let pending: AnalyticsRecord[] = [];
  let cancelTimer: (() => void) | null = null;

  const stopTimer = () => {
    cancelTimer?.();
    cancelTimer = null;
  };

  const flush = () => {
    stopTimer();
    if (pending.length === 0 || !deps.ready()) return;
    const batch = pending;
    pending = [];
    try {
      deps.deliver(batch);
    } catch {
      // Medir nunca debe causar un error ni reintentar en bucle
    }
  };

  const arm = () => {
    if (!deps.ready() || pending.length === 0) return;
    if (pending.length >= QUEUE_BATCH_SIZE) flush();
    else cancelTimer ??= timers.schedule(flush, QUEUE_MAX_WAIT_MS);
  };

  return {
    push(record) {
      pending.push(record);
      if (pending.length > QUEUE_MAX_PENDING) pending = pending.slice(-QUEUE_MAX_PENDING);
      arm();
    },
    flush,
    wake: arm,
    clear() {
      stopTimer();
      pending = [];
    },
    size: () => pending.length,
  };
}
