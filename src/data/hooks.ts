// Lectura reactiva para las pantallas. Se vuelve a ejecutar cuando cambian los datos que lee.
import { useLiveQuery } from 'dexie-react-hooks';
import type { DependencyList } from 'react';

/** undefined mientras carga. Las pantallas lo muestran con LoadingState */
export function useLiveData<T>(querier: () => Promise<T>, deps: DependencyList): T | undefined {
  return useLiveQuery(querier, [...deps]);
}
