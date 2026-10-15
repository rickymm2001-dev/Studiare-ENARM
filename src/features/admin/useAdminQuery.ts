// Una lectura del admin contra la nube, con su estado de carga, su falla y su recarga (B10). La usan las
// tarjetas de Admin, Pagos, para no repetir en cada una la misma espera de loadCloud y del resultado.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { loadCloud } from '@/data/cloud/client';
import type { AdminFailure, AdminResult } from '@/data/cloud/adminBilling';

export type AdminQueryState<T> =
  | { status: 'loading' }
  | { status: 'failed'; reason: AdminFailure }
  | { status: 'ready'; value: T };

/** Lee con load cada vez que cambia key o se pide recargar. reload deja la tarjeta en Cargando */
export function useAdminQuery<T>(
  load: (cloud: SupabaseClient) => Promise<AdminResult<T>>,
  key = '',
): { state: AdminQueryState<T>; reload: () => void } {
  const [state, setState] = useState<AdminQueryState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let stopped = false;
    void loadCloud()
      .then((cloud) =>
        cloud ? loadRef.current(cloud) : ({ ok: false, reason: 'network' } as const),
      )
      .then((result) => {
        if (stopped) return;
        setState(
          result.ok
            ? { status: 'ready', value: result.value }
            : { status: 'failed', reason: result.reason },
        );
      });
    return () => {
      stopped = true;
    };
  }, [key, tick]);
  return {
    state,
    reload: () => {
      setState({ status: 'loading' });
      setTick((value) => value + 1);
    },
  };
}
