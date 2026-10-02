// Entrega a la interfaz los repositorios de la base activa. Las pantallas nunca ven Dexie.
import { useMemo, type ReactNode } from 'react';
import { DataContext, type DataApi } from './context';
import { createEnarmDb } from './db/database';
import type { DatabaseKind } from './databases';
import { rebuildDerivedState } from './derive/derivations';
import { createDexieRepositories } from './repos/dexie/createRepositories';
import { recordEvent } from './usecases/recordEvent';

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
    };
    instances.set(kind, instance);
  }
  return instance;
}

export function DataProvider({ kind, children }: { kind: DatabaseKind; children: ReactNode }) {
  const value = useMemo(() => instanceFor(kind), [kind]);
  return <DataContext value={value}>{children}</DataContext>;
}
