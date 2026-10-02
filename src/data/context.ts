// Contexto y hooks de acceso a datos. El proveedor vive en DataProvider.tsx.
import { createContext, useContext } from 'react';
import type { Repositories } from './repos/types';
import type { AppEvent } from './schemas/events';
import type { SeedSummary } from './usecases/seedDemo';

/** Generar y regenerar los datos de demostración (11.2, 11.3). Solo existe en enarm_demo */
export interface DemoDataActions {
  /** Genera la cohorte y el alumno de la demo en un worker y los siembra */
  generate: () => Promise<SeedSummary>;
  /** Borra la base demo completa y la vuelve a sembrar desde cero */
  regenerate: () => Promise<SeedSummary>;
}

/** Lo que la interfaz puede usar. La base de Dexie queda escondida en src/data */
export interface DataApi {
  repos: Repositories;
  /** Agrega un evento y actualiza las cachés en la misma transacción */
  recordEvent: (event: AppEvent) => Promise<AppEvent>;
  rebuildDerivedState: () => Promise<void>;
  /** null en enarm_real */
  demo: DemoDataActions | null;
  /**
   * Borrar mis datos (4.5). Elimina la base completa de Mi cuenta. Es la excepción a la bitácora
   * inmutable de PLAN.md 2.2. null en la demo, que se regenera con sus propias acciones
   */
  deleteAllData: (() => Promise<void>) | null;
}

/** El contexto solo lleva la API. La base de Dexie queda capturada dentro de recordEvent y rebuild */
export const DataContext = createContext<DataApi | null>(null);

function useDataContext(): DataApi {
  const value = useContext(DataContext);
  if (!value) throw new Error('Los hooks de datos necesitan estar dentro de DataProvider');
  return value;
}

export function useRepositories(): Repositories {
  return useDataContext().repos;
}

export function useDataApi(): DataApi {
  const { repos, recordEvent, rebuildDerivedState, demo, deleteAllData } = useDataContext();
  return { repos, recordEvent, rebuildDerivedState, demo, deleteAllData };
}
