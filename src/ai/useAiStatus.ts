// Estado de la IA para la interfaz. Se consulta una vez y de nuevo al recuperar la conexión. En la base
// de demostración con el proxy alojado no se consulta nada, porque la demo usa sus respuestas fijas con
// la etiqueta de IA simulada y no llama a la función, así no gasta presupuesto ni choca con la
// compuerta (B12, 3.5).
import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/ui/hooks/use-online-status';
import { fetchAiStatus, type AiStatus } from './client';
import { aiIsHosted } from './endpoint';

const DEMO_STATUS: AiStatus = { kind: 'no-proxy' };

export function useAiStatus(options: { demo?: boolean } = {}): AiStatus {
  const online = useOnlineStatus();
  const [status, setStatus] = useState<AiStatus>({ kind: 'checking' });
  // La demo con el proxy alojado no habla con la función. Con el proxy local de desarrollo sí
  const skipProxy = options.demo === true && aiIsHosted();

  useEffect(() => {
    if (!online || skipProxy) return;
    let cancelled = false;
    void fetchAiStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [online, skipProxy]);

  if (skipProxy) return DEMO_STATUS;
  // Sin conexión no se consulta el proxy, para no llenar la consola de errores de red
  return online ? status : { kind: 'offline' };
}
