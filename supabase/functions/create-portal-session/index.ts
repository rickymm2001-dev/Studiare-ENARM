// Abre el portal de facturación de Stripe del alumno que inició sesión, donde cambia de plan, cancela
// su suscripción, cambia su tarjeta o ve sus facturas. Esta sí verifica el JWT de Supabase, y además
// comprueba el token por su cuenta para saber quién pide el portal.
//   supabase functions deploy create-portal-session
import { withMonitoring } from '../_shared/monitoring.ts';
import { handleCreatePortal } from '../_shared/payments.ts';
import { monitoringDeps, portalDeps } from '../_shared/runtime.ts';

Deno.serve(
  withMonitoring(
    'create-portal-session',
    (request) => handleCreatePortal(request, portalDeps()),
    monitoringDeps,
  ),
);
