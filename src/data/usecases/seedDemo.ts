// Siembra y regeneración de la base de demostración (11.2, 11.3, D-052). Solo funciona sobre
// enarm_demo. Escribe el contenido demo, la baraja sintética, los alumnos simulados con su SimTruth
// y la bitácora del alumno de la demo, y después reconstruye las cachés desde la bitácora.
import type { DemoSeedRecords } from '@/demo/generator/seed';
import type { EnarmDb } from '../db/database';
import { rebuildDerivedState } from '../derive/derivations';

export interface SeedSummary {
  questions: number;
  users: number;
  events: number;
  cards: number;
}

export class DemoOnlyError extends Error {
  constructor() {
    super('La siembra de datos simulados solo se permite en la base de demostración');
    this.name = 'DemoOnlyError';
  }
}

/** La base ya tiene al alumno de la demo */
export async function isDemoSeeded(db: EnarmDb, demoUserId: string): Promise<boolean> {
  return (await db.users.get(demoUserId)) !== undefined;
}

export async function seedDemoDatabase(db: EnarmDb, seed: DemoSeedRecords): Promise<SeedSummary> {
  if (db.kind !== 'demo') throw new DemoOnlyError();
  await db.transaction(
    'rw',
    [
      db.cases,
      db.questions,
      db.options,
      db.decks,
      db.notes,
      db.cards,
      db.users,
      db.simTruth,
      db.events,
    ],
    async () => {
      await db.cases.bulkPut(seed.cases);
      await db.questions.bulkPut(seed.questions.map((entry) => entry.question));
      await db.options.bulkPut(seed.questions.flatMap((entry) => entry.options));
      await db.decks.put(seed.deck);
      await db.notes.bulkPut(seed.notes);
      await db.cards.bulkPut(seed.cards);
      await db.users.bulkPut(seed.users);
      await db.simTruth.bulkPut(seed.simTruth);
      // La bitácora solo acepta agregar. Cada evento ya viene validado por su esquema
      await db.events.bulkAdd(seed.events);
    },
  );
  await rebuildDerivedState(db);
  return {
    questions: seed.questions.length,
    users: seed.users.length,
    events: seed.events.length,
    cards: seed.cards.length,
  };
}

/**
 * Regenera la demo desde cero. Borra la base demo completa, que es la excepción permitida a la
 * bitácora inmutable porque no tiene datos reales (PLAN.md 2.2), y vuelve a sembrar
 */
export async function resetDemoDatabase(db: EnarmDb, seed: DemoSeedRecords): Promise<SeedSummary> {
  if (db.kind !== 'demo') throw new DemoOnlyError();
  db.close();
  await db.delete();
  await db.open();
  return seedDemoDatabase(db, seed);
}
