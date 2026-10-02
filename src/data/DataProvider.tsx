// Entrega a la interfaz los repositorios de la base activa. Las pantallas nunca ven Dexie.
import { useMemo, type ReactNode } from 'react';
import { DataContext, type DataApi } from './context';
import { createEnarmDb } from './db/database';
import type { DatabaseKind } from './databases';
import { rebuildDerivedState } from './derive/derivations';
import { createDexieRepositories } from './repos/dexie/createRepositories';
import { studyDayOf } from '@/engines/studyDay';
import { DEFAULT_TIME_ZONE } from './schemas/common';
import { recordEvent } from './usecases/recordEvent';
import { resetDemoDatabase, seedDemoDatabase } from './usecases/seedDemo';
import type { EnarmDb } from './db/database';

/** El generador corre en un worker que se carga bajo demanda (14.4) */
async function buildDemoRecords() {
  const { simulateWorker } = await import('@/workers/simulateClient');
  const now = new Date();
  // Nada de la bitácora simulada puede quedar en el futuro
  return simulateWorker().buildSeed({
    endDay: studyDayOf(now, DEFAULT_TIME_ZONE),
    notAfter: now.toISOString(),
  });
}

function demoActions(db: EnarmDb): DataApi['demo'] {
  if (db.kind !== 'demo') return null;
  return {
    generate: async () => seedDemoDatabase(db, await buildDemoRecords()),
    regenerate: async () => resetDemoDatabase(db, await buildDemoRecords()),
  };
}

// Una instancia por base durante toda la vida de la página. Dexie abre la base al primer uso
const instances = new Map<DatabaseKind, DataApi>();

function instanceFor(kind: DatabaseKind): DataApi {
  let instance = instances.get(kind);
  if (!instance) {
    const db = createEnarmDb(kind);
    const repos = createDexieRepositories(db);
    instance = {
      repos,
      recordEvent: (event) => recordEvent(db, repos.events, event),
      rebuildDerivedState: () => rebuildDerivedState(db),
      demo: demoActions(db),
    };
    instances.set(kind, instance);
  }
  return instance;
}

export function DataProvider({ kind, children }: { kind: DatabaseKind; children: ReactNode }) {
  const value = useMemo(() => instanceFor(kind), [kind]);
  return <DataContext value={value}>{children}</DataContext>;
}
