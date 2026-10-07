// Tarjetas suspendidas (D-085). Suspender saca una tarjeta del repaso sin borrarla ni tocar su
// historial. Se decide con la bitácora, que solo se agrega. El último evento de cada tarjeta manda,
// así suspender y reanudar se pueden repetir. Entradas, los eventos en orden. Salidas, el conjunto de
// tarjetas suspendidas.
import type { AppEvent } from '@/data/schemas/events';

/** Tarjetas que están suspendidas según los eventos, que deben venir en orden de tiempo */
export function suspendedCardIds(events: readonly AppEvent[]): Set<string> {
  const suspended = new Set<string>();
  for (const event of events) {
    if (event.type === 'cards_suspended') {
      for (const id of event.payload.cardIds) suspended.add(id);
    } else if (event.type === 'cards_unsuspended') {
      for (const id of event.payload.cardIds) suspended.delete(id);
    }
  }
  return suspended;
}

/** Cuántas tarjetas por evento. Lo que pasa de ahí se parte en lotes */
export const SUSPEND_BATCH = 500;

/** Parte una lista en lotes del tamaño que admite un evento */
export function inBatches<T>(items: readonly T[], size: number = SUSPEND_BATCH): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}
