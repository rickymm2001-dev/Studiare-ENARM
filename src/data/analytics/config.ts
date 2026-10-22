// Configuración de la analítica (B15, 1.4). Es el único archivo de la app que lee VITE_POSTHOG_KEY y
// VITE_POSTHOG_HOST, y una prueba de arquitectura lo vigila. Las dos variables son públicas por diseño, la
// llave de proyecto de PostHog (phc_) solo sirve para mandar eventos. Una llave personal (phx_) nunca se
// acepta aquí, porque lee datos, y el host solo puede ser uno de los dos de PostHog Cloud, así una variable
// mal puesta no manda los eventos a otro dominio (la CSP aplica la misma regla, src/config/csp.ts).
import { posthogOriginOf } from '@/config/csp';

export interface AnalyticsConfig {
  /** La llave pública del proyecto, la que empieza con phc_ */
  key: string;
  /** https://us.i.posthog.com o https://eu.i.posthog.com, sin diagonal final */
  host: string;
}

/** Forma de una llave de proyecto. Letras y números después de phc_, sin espacios ni símbolos */
const PROJECT_KEY = /^phc_[A-Za-z0-9]{20,64}$/;

/** Lee la configuración. null si falta la llave o el host, o si alguno no tiene la forma buena */
export function readAnalyticsConfig(
  env: Record<string, unknown> = import.meta.env,
): AnalyticsConfig | null {
  const key = typeof env.VITE_POSTHOG_KEY === 'string' ? env.VITE_POSTHOG_KEY.trim() : '';
  const host = posthogOriginOf(
    typeof env.VITE_POSTHOG_HOST === 'string' ? env.VITE_POSTHOG_HOST : undefined,
  );
  return PROJECT_KEY.test(key) && host !== undefined ? { key, host } : null;
}
