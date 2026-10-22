// Crea la sesión de pago del alumno que inició sesión. Esta sí verifica el JWT de Supabase, y
// además comprueba el token por su cuenta para saber quién paga.
//   supabase functions deploy create-checkout
import { withMonitoring } from '../_shared/monitoring.ts';
import { handleCreateCheckout } from '../_shared/payments.ts';
import { checkoutDeps, monitoringDeps } from '../_shared/runtime.ts';

Deno.serve(
  withMonitoring(
    'create-checkout',
    (request) => handleCreateCheckout(request, checkoutDeps()),
    monitoringDeps,
  ),
);
