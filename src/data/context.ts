// Contexto y hooks de acceso a datos. El proveedor vive en DataProvider.tsx.
import { createContext, useContext } from 'react';
import type { Repositories } from './repos/types';
import type { AppEvent } from './schemas/events';
import type { SeedSummary } from './usecases/seedDemo';

/** Lo que el admin puede ajustar al generar los datos de demostración (pantalla 24) */
export interface DemoAdjustments {
  /** Alumnos simulados. 300 por omisión (11.2) */
  cohortSize?: number;
  /** Semilla del generador. La misma semilla da siempre los mismos datos */
  seed?: string;
  /** Fecha del ENARM del alumno de la demo, o null para quitarla (11.3) */
  examDate?: string | null;
}

/** Generar, borrar y regenerar los datos de demostración (11.2, 11.3). Solo existe en enarm_demo */
export interface DemoDataActions {
  /** Genera la cohorte y el alumno de la demo en un worker y los siembra */
  generate: (adjust?: DemoAdjustments) => Promise<SeedSummary>;
  /** Borra la base demo completa y la vuelve a sembrar desde cero */
  regenerate: (adjust?: DemoAdjustments) => Promise<SeedSummary>;
  /** Borra la base demo completa sin volver a sembrarla. Lo real no se toca */
  clear: () => Promise<void>;
}

/** Lo que la interfaz puede usar. La base de Dexie queda escondida en src/data */
export interface DataApi {
  repos: Repositories;
  /**
   * Agrega un evento y actualiza las cachés en la misma transacción. Lo que se guarda en este dispositivo
   * pasa además por el puente de la analítica (B15, 1.6), que sin el permiso Medición de uso no hace nada
   */
  recordEvent: (event: AppEvent) => Promise<AppEvent>;
  /**
   * Lo mismo que recordEvent, sin el puente de la analítica. Lo usa la sincronización para guardar lo que
   * baja de otros dispositivos, que ya se midió donde pasó, así no se mide dos veces (B15, 1.6)
   */
  recordEventQuiet: (event: AppEvent) => Promise<AppEvent>;
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
  const { repos, recordEvent, recordEventQuiet, rebuildDerivedState, demo, deleteAllData } =
    useDataContext();
  return { repos, recordEvent, recordEventQuiet, rebuildDerivedState, demo, deleteAllData };
}
