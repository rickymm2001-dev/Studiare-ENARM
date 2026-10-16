// Estado de la IA para la interfaz. Se consulta una vez y de nuevo al recuperar la conexión. En la base
// de demostración con el proxy alojado no se consulta nada, porque la demo usa sus respuestas fijas con
// la etiqueta de IA simulada y no llama a la función, así no gasta presupuesto ni choca con la
// compuerta (B12, 3.5).
import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/ui/hooks/use-online-status';
import { fetchAiStatus, type AiStatus } from './client';
import { aiIsHosted } from './endpoint';

const DEMO_STATUS: AiStatus = { kind: 'no-proxy' };

export interface AiStatusOptions {
  /** La base de demostración. Con el proxy alojado no consulta nada */
  demo?: boolean;
  /**
   * Cuando cambia, se vuelve a preguntar. Lo usa la pantalla que abre y cierra motores, para que el
   * estado de los alumnos que ve sea el de después del cambio y no el de cuando abrió la pantalla
   */
  refreshKey?: string;
}

export function useAiStatus(options: AiStatusOptions = {}): AiStatus {
  const online = useOnlineStatus();
  const key = options.refreshKey ?? '';
  const [fetched, setFetched] = useState<{ key: string; status: AiStatus } | null>(null);
  // La demo con el proxy alojado no habla con la función. Con el proxy local de desarrollo sí
  const skipProxy = options.demo === true && aiIsHosted();

  useEffect(() => {
    if (!online || skipProxy) return;
    let cancelled = false;
    void fetchAiStatus().then((next) => {
      if (!cancelled) setFetched({ key, status: next });
    });
    return () => {
      cancelled = true;
    };
  }, [online, skipProxy, key]);

  if (skipProxy) return DEMO_STATUS;
  // Sin conexión no se consulta el proxy, para no llenar la consola de errores de red
  if (!online) return { kind: 'offline' };
  // Con otra clave se espera la respuesta nueva. Mientras llega no se sabe, no se usa la vieja
  return fetched?.key === key ? fetched.status : { kind: 'checking' };
}
