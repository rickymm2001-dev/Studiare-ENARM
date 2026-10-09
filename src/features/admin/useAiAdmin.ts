// El proxy de IA visto desde las pantallas de admin. Lee el uso de hoy y la configuración cuando hay
// proxy, y deja guardar cambios. Sin proxy no hace ninguna petición.
import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdminConfig,
  fetchAdminUsage,
  proxyAvailable,
  saveAdminConfig,
  type AdminConfigPatch,
  type AdminConfigResponse,
  type AdminUsageResponse,
  type SaveResult,
} from '@/ai/admin';
import type { AiStatus } from '@/ai/client';
import { useAiStatus } from '@/ai/useAiStatus';

export interface AiAdmin {
  status: AiStatus;
  /** Hay proxy al que preguntarle */
  available: boolean;
  /** Ya se preguntó y llegó la respuesta o falló */
  loaded: boolean;
  config: AdminConfigResponse | null;
  usage: AdminUsageResponse | null;
  save: (patch: AdminConfigPatch) => Promise<SaveResult>;
  refresh: () => void;
}

export function useAiAdmin(): AiAdmin {
  const status = useAiStatus();
  const available = proxyAvailable(status);
  const [config, setConfig] = useState<AdminConfigResponse | null>(null);
  const [usage, setUsage] = useState<AdminUsageResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void Promise.all([fetchAdminConfig(), fetchAdminUsage()]).then(([nextConfig, nextUsage]) => {
      if (cancelled) return;
      setConfig(nextConfig);
      setUsage(nextUsage);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [available, version]);

  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const save = useCallback(async (patch: AdminConfigPatch) => {
    const result = await saveAdminConfig(patch);
    if (result.ok) setConfig(result.response);
    return result;
  }, []);

  // Sin proxy no hay nada que esperar: lo cargado queda vacío y la pantalla lo dice
  return {
    status,
    available,
    loaded: available ? loaded : status.kind !== 'checking',
    config: available ? config : null,
    usage: available ? usage : null,
    save,
    refresh,
  };
}
