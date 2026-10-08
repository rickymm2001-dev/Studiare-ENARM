// Bitácora de cambios de fecha de repaso (D-085, fila 5). Una acción del alumno, como repartir los
// atrasos, puede ocupar varios eventos cards_rescheduled porque cada uno lleva hasta 500 tarjetas.
// Todos los lotes de una acción comparten la misma hora, el mismo tipo y los mismos días. Aquí se
// reagrupan para saber cuál fue la última acción que todavía se puede deshacer. Solo lee eventos,
// nunca los edita.
import type { AppEvent } from '@/data/schemas/events';
import type { RescheduledCard } from './reschedule';

export type RescheduleKind = 'spread' | 'postpone' | 'advance';

export interface RescheduleAction {
  kind: RescheduleKind;
  /** Hora de la acción, igual en todos sus lotes */
  at: string;
  days: number | null;
  batches: { eventId: string; cards: RescheduledCard[] }[];
}

/**
 * La acción más reciente que aún se puede deshacer, es decir la última en la que alguna tarjeta
 * conserva todavía la fecha que le puso la acción. currentDue dice el vencimiento de hoy de cada
 * tarjeta, y null si no tiene. Las acciones de deshacer no cuentan como acciones
 */
export function lastUndoableAction(
  events: readonly AppEvent[],
  currentDue: (cardId: string) => string | null,
): RescheduleAction | null {
  const actions: RescheduleAction[] = [];
  for (const event of events) {
    if (event.type !== 'cards_rescheduled' || event.payload.kind === 'undo') continue;
    const batch = { eventId: event.id, cards: event.payload.cards };
    const last = actions.at(-1);
    if (
      last?.at === event.at &&
      last.kind === event.payload.kind &&
      last.days === event.payload.days
    ) {
      last.batches.push(batch);
    } else {
      actions.push({
        kind: event.payload.kind,
        at: event.at,
        days: event.payload.days,
        batches: [batch],
      });
    }
  }
  const same = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];
    if (!action) continue;
    const stillMoved = action.batches.some((batch) =>
      batch.cards.some((card) => {
        const due = currentDue(card.cardId);
        return due !== null && same(due, card.to);
      }),
    );
    if (stillMoved) return action;
  }
  return null;
}
