// Una lectura de la auditoría de la IA contra la nube, con su carga, su falla y su recarga (B12, 5.3).
// Un 42501 pide el segundo factor del equipo (B9), igual que el resto de las pantallas del banco.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { useCloud } from '@/app/cloudState';
import { loadCloud } from '@/data/cloud/client';
import type { AiRpcFailure, AiRpcResult, ForbiddenHandler } from '@/data/cloud/aiGate';
import { askSecondFactor } from './secondFactor';

export type AuditQueryState<T> =
  | { status: 'loading' }
  | { status: 'failed'; reason: AiRpcFailure; message: string | null }
  | { status: 'ready'; value: T };

/** La cuenta de la nube está conectada, que es lo que pide toda la auditoría */
export const useAuditLinked = (): boolean => useCloud((store) => store.state.status === 'linked');

/** Lee con load mientras la cuenta de la nube está conectada. key cambia lo que se lee */
export function useAuditQuery<T>(
  load: (cloud: SupabaseClient, onForbidden: ForbiddenHandler) => Promise<AiRpcResult<T>>,
  key: string,
  enabled = true,
): { state: AuditQueryState<T>; reload: () => void } {
  const linked = useAuditLinked();
  const [state, setState] = useState<AuditQueryState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    if (!linked || !enabled) return;
    let stopped = false;
    void loadCloud()
      .then((cloud) =>
        cloud
          ? loadRef.current(cloud, askSecondFactor)
          : ({ ok: false, reason: 'network', message: null } as const),
      )
      .then((result) => {
        if (stopped) return;
        setState(
          result.ok
            ? { status: 'ready', value: result.value }
            : { status: 'failed', reason: result.reason, message: result.message },
        );
      });
    return () => {
      stopped = true;
    };
  }, [linked, enabled, key, tick]);
  return {
    state,
    reload: () => {
      setState({ status: 'loading' });
      setTick((value) => value + 1);
    },
  };
}
