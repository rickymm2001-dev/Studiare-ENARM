// Las dependencias de withMonitoring con el entorno de Supabase (B15, 2.2). Van en su propio archivo, aparte de
// runtime.ts, para que ai-proxy y ai-batch las usen sin cargar el resto: runtime.ts importa Stripe, Mercado
// Pago, la sincronización del banco y Resend, y con él el cierre de archivos de las dos funciones de IA pasaba
// de unos 40 a 66 (de 280 KB a casi 700 KB) solo para leer SENTRY_DSN. Este archivo importa únicamente
// monitoring.ts. scripts/deploy/closure.test.ts lo vigila.
import { monitoringDepsFrom, type MonitoringDeps } from './monitoring.ts';

/**
 * Las dependencias de withMonitoring con el entorno de Supabase. Se arman al avisar y no al cargar la función,
 * y el aviso sale con EdgeRuntime.waitUntil para no retrasar la respuesta
 */
export function monitoringDeps(): MonitoringDeps {
  return monitoringDepsFrom(
    (name) => Deno.env.get(name),
    (work) => {
      EdgeRuntime.waitUntil(work);
    },
  );
}
