// Abre el portal de facturación de Stripe del alumno que inició sesión, donde cancela su suscripción,
// cambia su tarjeta o ve sus facturas. Esta sí verifica el JWT de Supabase, y además comprueba el
// token por su cuenta para saber quién pide el portal.
//   supabase functions deploy create-portal-session
import { handleCreatePortal } from '../_shared/payments.ts';
import { portalDeps } from '../_shared/runtime.ts';

Deno.serve((request) => handleCreatePortal(request, portalDeps()));
