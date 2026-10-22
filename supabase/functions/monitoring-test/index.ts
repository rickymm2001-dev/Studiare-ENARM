// Prueba de alertas desde las funciones (B15, 2.4). El botón Mandar error de prueba de Plataforma, Correos y
// alertas la llama con la sesión del admin, y manda a Sentry el mensaje fijo "Prueba de alertas de Studiare,
// funciones" para comprobar que el correo de la regla de alerta llega. Esta sí verifica el JWT de Supabase, y
// además comprueba por su cuenta que quien llama es admin con su segundo factor. Sin SENTRY_DSN responde que
// falta el DSN y no manda nada.
//   supabase functions deploy monitoring-test
import { withMonitoring } from '../_shared/monitoring.ts';
import { handleMonitoringTest } from '../_shared/monitoringTest.ts';
import { monitoringDeps, monitoringTestDeps } from '../_shared/runtime.ts';

Deno.serve(
  withMonitoring(
    'monitoring-test',
    (request) => handleMonitoringTest(request, monitoringTestDeps()),
    monitoringDeps,
  ),
);
