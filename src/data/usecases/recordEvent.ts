// Caso de uso base de toda acción del alumno. Agrega el evento a la bitácora y actualiza las
// cachés derivadas en la misma transacción, así nunca quedan desfasadas (PLAN.md 2.2).
import type { EnarmDb } from '../db/database';
import { applyDerivations, derivationTables } from '../derive/derivations';
import type { EventRepo } from '../repos/types';
import type { AppEvent } from '../schemas/events';

export async function recordEvent(
  db: EnarmDb,
  events: EventRepo,
  event: AppEvent,
): Promise<AppEvent> {
  return db.transaction('rw', [db.events, ...derivationTables(db)], async () => {
    const stored = await events.append(event);
    await applyDerivations(db, stored);
    return stored;
  });
}
