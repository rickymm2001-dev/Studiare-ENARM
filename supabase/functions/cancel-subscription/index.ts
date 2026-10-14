// Cancela la suscripción de Mercado Pago del alumno que inició sesión. Mercado Pago no tiene portal como
// Stripe, así que la app llama aquí. El plan vale hasta el fin de lo pagado. Esta sí verifica el JWT de
// Supabase, y además comprueba el token por su cuenta para saber de quién es la suscripción:
//   supabase functions deploy cancel-subscription
import { handleCancelSubscription } from '../_shared/mercadopago.ts';
import { cancelSubscriptionDeps } from '../_shared/runtime.ts';

Deno.serve((request) => handleCancelSubscription(request, cancelSubscriptionDeps()));
