// Estado de la IA para la interfaz. Se consulta una vez y de nuevo al recuperar la conexión.
import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/ui/hooks/use-online-status';
import { fetchAiStatus, type AiStatus } from './client';

export function useAiStatus(): AiStatus {
  const online = useOnlineStatus();
  const [status, setStatus] = useState<AiStatus>({ kind: 'checking' });

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void fetchAiStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [online]);

  // Sin conexión no se consulta el proxy, para no llenar la consola de errores de red
  return online ? status : { kind: 'offline' };
}
