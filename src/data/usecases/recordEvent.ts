// Caso de uso base de toda acción del alumno. Agrega el evento a la bitácora y actualiza las
// cachés derivadas en la misma transacción, así nunca quedan desfasadas (PLAN.md 2.2).
import type { DataApi } from '../context';
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

/**
 * Registra un evento con ID fijo sin duplicarlo. Si ya estaba en la bitácora, porque un intento
 * anterior se cortó después de guardarlo, devuelve el que quedó guardado y no toca nada más. La
 * transacción de recordEvent se deshace sola cuando el ID ya existe, así las cachés no se cuentan
 * dos veces. Solo agrega, nunca edita
 */
export async function recordEventOnce(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  event: AppEvent,
): Promise<AppEvent> {
  try {
    return await api.recordEvent(event);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'ConstraintError') throw error;
    // Los eventos de ese milisegundo son pocos, así que la consulta es chica
    const stored = (
      await api.repos.events.query({ userId: event.userId, from: event.at, to: event.at })
    ).find((candidate) => candidate.id === event.id);
    if (!stored) throw error;
    return stored;
  }
}
