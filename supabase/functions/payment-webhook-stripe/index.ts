// Avisos de pago de Stripe. Verifica la firma, traduce el evento y lo aplica en la base una sola vez.
// Después ejecuta las acciones pendientes con Stripe que decidió la base, como cancelar una prueba
// repetida. Se publica sin verificación de JWT, porque quien llama es Stripe y se identifica con su firma:
//   supabase functions deploy payment-webhook-stripe --no-verify-jwt
import { withMonitoring } from '../_shared/monitoring.ts';
import { handleStripeWebhook } from '../_shared/payments.ts';
import { monitoringDeps, stripeWebhookDeps } from '../_shared/runtime.ts';

Deno.serve(
  withMonitoring(
    'payment-webhook-stripe',
    (request) => handleStripeWebhook(request, stripeWebhookDeps()),
    monitoringDeps,
  ),
);
