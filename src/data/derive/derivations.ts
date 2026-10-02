// Cachés derivadas. Al agregar un evento se actualizan en la misma transacción (PLAN.md 2.2) y
// rebuildDerivedState las recalcula desde cero leyendo la bitácora, por ejemplo si un motor cambia.
import type { EnarmDb } from '../db/database';
import { TABLES, type TableName } from '../db/tables';
import type { AppEvent } from '../schemas/events';
import { emptyXpCache, reduceXp } from './xp';

interface Derivation {
  name: string;
  /** Tabla de caché que escribe. Debe ser de tipo cache en TABLES */
  table: TableName;
  /** Tipos de evento que la mueven. Los demás no abren la caché */
  eventTypes: readonly AppEvent['type'][];
  applyIncremental(db: EnarmDb, event: AppEvent): Promise<void>;
  rebuild(db: EnarmDb): Promise<void>;
}

const xpDerivation: Derivation = {
  name: 'xp',
  table: 'xpCache',
  eventTypes: ['xp_awarded'],
  async applyIncremental(db, event) {
    const current = (await db.xpCache.get(event.userId)) ?? emptyXpCache(event.userId);
    await db.xpCache.put(reduceXp(current, event));
  },
  async rebuild(db) {
    await db.xpCache.clear();
    const byUser = new Map<string, ReturnType<typeof emptyXpCache>>();
    // [userId+at] recorre a cada alumno en orden de tiempo, con el ID como desempate
    await db.events.orderBy('[userId+at]').each((event) => {
      if (event.type !== 'xp_awarded') return;
      const current = byUser.get(event.userId) ?? emptyXpCache(event.userId);
      byUser.set(event.userId, reduceXp(current, event));
    });
    await db.xpCache.bulkPut([...byUser.values()]);
  },
};

export const DERIVATIONS: readonly Derivation[] = [xpDerivation];

for (const derivation of DERIVATIONS) {
  if (TABLES[derivation.table].kind !== 'cache') {
    throw new Error(`La derivación ${derivation.name} solo puede escribir en una tabla de caché`);
  }
}

export function derivationTables(db: EnarmDb) {
  return DERIVATIONS.map((derivation) => db.table(derivation.table));
}

/** Aplica las derivaciones que le tocan a un evento recién agregado */
export async function applyDerivations(db: EnarmDb, event: AppEvent): Promise<void> {
  for (const derivation of DERIVATIONS) {
    if (derivation.eventTypes.includes(event.type)) {
      await derivation.applyIncremental(db, event);
    }
  }
}

/** Borra y recalcula todas las cachés derivadas desde la bitácora */
export async function rebuildDerivedState(db: EnarmDb): Promise<void> {
  await db.transaction('rw', [db.events, ...derivationTables(db)], async () => {
    for (const derivation of DERIVATIONS) {
      await derivation.rebuild(db);
    }
  });
}
