// Contexto y hooks de acceso a datos. El proveedor vive en DataProvider.tsx.
import { createContext, useContext } from 'react';
import type { EnarmDb } from './db/database';
import type { Repositories } from './repos/types';
import type { AppEvent } from './schemas/events';

/** Lo que la interfaz puede usar. La base de Dexie queda escondida en src/data */
export interface DataApi {
  repos: Repositories;
  /** Agrega un evento y actualiza las cachés en la misma transacción */
  recordEvent: (event: AppEvent) => Promise<AppEvent>;
  rebuildDerivedState: () => Promise<void>;
}

export interface DataContextValue extends DataApi {
  db: EnarmDb;
}

export const DataContext = createContext<DataContextValue | null>(null);

function useDataContext(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('Los hooks de datos necesitan estar dentro de DataProvider');
  return value;
}

export function useRepositories(): Repositories {
  return useDataContext().repos;
}

export function useDataApi(): DataApi {
  const { repos, recordEvent, rebuildDerivedState } = useDataContext();
  return { repos, recordEvent, rebuildDerivedState };
}
