// Lectura reactiva para las pantallas. Se vuelve a ejecutar cuando cambian los datos que lee.
import { useLiveQuery } from 'dexie-react-hooks';
import type { DependencyList } from 'react';

/** undefined mientras carga. Las pantallas lo muestran con LoadingState */
export function useLiveData<T>(querier: () => Promise<T>, deps: DependencyList): T | undefined {
  return useLiveQuery(querier, [...deps]);
}

/**
 * Como useLiveData, pero el resultado queda atado a la clave que lo produjo (por lo general el alumno). useLiveQuery
 * conserva el resultado anterior mientras la consulta nueva no responde, y eso es cómodo para pintar pero engañoso
 * para decidir. Si la clave cambia de A a B, durante ese rato quien lee vería lo de A como si fuera de B. Aquí vale
 * undefined (todavía se lee) hasta que llegue lo de B. Es para quien decide algo con el resultado en vez de pintarlo,
 * como las compuertas de permisos. null es una clave válida (sin sesión)
 */
export function useLiveDataFor<T>(
  key: string | null,
  querier: () => Promise<T>,
  deps: DependencyList,
): T | undefined {
  const result = useLiveQuery(async () => ({ key, value: await querier() }), [key, ...deps]);
  return result?.key === key ? result.value : undefined;
}
