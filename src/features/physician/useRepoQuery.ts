// Una lectura del repositorio editorial con su estado de carga, su falla y su recarga (B11). Las
// pantallas del médico y del admin ya no leen Dexie en vivo, porque con la nube no hay en vivo. Después
// de cada acción piden recargar, y la recarga deja a la vista lo que ya había hasta que llega lo nuevo.
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorCodeOf, type EditorialErrorCode } from '@/data/editorial/editorialRepo';

export type RepoQueryState<T> =
  | { status: 'loading' }
  | { status: 'failed'; code: EditorialErrorCode }
  | { status: 'ready'; value: T };

/**
 * Lee con load cuando cambia key y cada vez que se pide recargar. key junta todo lo que cambia la
 * lectura, como el repositorio y los filtros. Con enabled en false se queda cargando, por ejemplo
 * mientras el banco local todavía se guarda
 */
export function useRepoQuery<T>(
  load: () => Promise<T>,
  key: string,
  enabled = true,
): { state: RepoQueryState<T>; reload: () => void } {
  // Una marca por cada lectura distinta. Lo leído con otra marca ya no vale
  // eslint-disable-next-line react-hooks/exhaustive-deps -- key es la marca, el objeto no importa
  const generation = useMemo(() => ({}), [enabled, key]);
  const [result, setResult] = useState<{ generation: object; state: RepoQueryState<T> } | null>(
    null,
  );
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    loadRef
      .current()
      .then((value) => {
        if (!stopped) setResult({ generation, state: { status: 'ready', value } });
      })
      .catch((error: unknown) => {
        if (!stopped) {
          setResult({ generation, state: { status: 'failed', code: errorCodeOf(error) } });
        }
      });
    return () => {
      stopped = true;
    };
  }, [enabled, generation, tick]);
  return {
    state:
      result !== null && result.generation === generation ? result.state : { status: 'loading' },
    reload: () => {
      setTick((value) => value + 1);
    },
  };
}
