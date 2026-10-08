// Cambiar la fecha de repaso de tarjetas (D-085, fila 5). Repartir atrasos, posponer, adelantar y
// deshacer. Cada cambio es un evento nuevo cards_rescheduled y nunca se edita lo que ya pasó. Una
// acción grande se parte en lotes de 500 tarjetas que comparten la misma hora, así se reconocen
// como una sola acción al deshacer.
import { RESCHEDULE_BATCH, undoAssignments, type RescheduledCard } from '../../engines/reschedule';
import type { RescheduleAction, RescheduleKind } from '../../engines/rescheduleLog';
import { inBatches } from '../../engines/suspension';
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import type { User } from '../schemas/people';

type Api = Pick<DataApi, 'recordEvent'>;
type Actor = Pick<User, 'id' | 'timeZone'>;

/** Guarda una acción de cambio de fecha. Devuelve cuántas tarjetas cambiaron */
export async function recordReschedule(
  api: Api,
  actor: Actor,
  input: { kind: RescheduleKind; assignments: readonly RescheduledCard[]; days: number | null },
  now: Date = new Date(),
): Promise<number> {
  const context = { userId: actor.id, tz: actor.timeZone, clock: { now: () => now } };
  for (const batch of inBatches(input.assignments, RESCHEDULE_BATCH)) {
    await api.recordEvent(
      createEvent(
        'cards_rescheduled',
        { kind: input.kind, cards: batch, days: input.days, undoes: null },
        context,
      ),
    );
  }
  return input.assignments.length;
}

/**
 * Deshace una acción. Solo regresa las tarjetas que siguen con la fecha que puso la acción. Si ya
 * se repasaron o se movieron otra vez, se quedan como están. Devuelve cuántas se regresaron
 */
export async function undoReschedule(
  api: Api,
  actor: Actor,
  action: RescheduleAction,
  currentDue: (cardId: string) => string | null,
  now: Date = new Date(),
): Promise<number> {
  const context = { userId: actor.id, tz: actor.timeZone, clock: { now: () => now } };
  let restored = 0;
  for (const batch of action.batches) {
    const assignments = undoAssignments({ moved: batch.cards, currentDue });
    for (const part of inBatches(assignments, RESCHEDULE_BATCH)) {
      await api.recordEvent(
        createEvent(
          'cards_rescheduled',
          { kind: 'undo', cards: part, days: null, undoes: batch.eventId },
          context,
        ),
      );
    }
    restored += assignments.length;
  }
  return restored;
}
