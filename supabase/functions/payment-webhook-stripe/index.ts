// Avisos de pago de Stripe. Verifica la firma, traduce el evento y lo aplica en la base una sola vez.
// Se publica sin verificación de JWT, porque quien llama es Stripe y se identifica con su firma:
//   supabase functions deploy payment-webhook-stripe --no-verify-jwt
import { handleStripeWebhook } from '../_shared/payments.ts';
import { paymentDeps } from '../_shared/runtime.ts';

Deno.serve((request) => handleStripeWebhook(request, paymentDeps()));
