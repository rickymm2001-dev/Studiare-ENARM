// Avisos de Mercado Pago de los temas payment, subscription_preapproval y
// subscription_authorized_payment. Verifica la firma, consulta el recurso con el token del servidor y lo
// aplica en la base una sola vez. Se publica sin verificación de JWT, porque quien llama es Mercado Pago
// y se identifica con su firma:
//   supabase functions deploy payment-webhook-mercadopago --no-verify-jwt
import { handleMercadoPagoWebhook } from '../_shared/mercadopago.ts';
import { withMonitoring } from '../_shared/monitoring.ts';
import { mercadoPagoWebhookDeps, monitoringDeps } from '../_shared/runtime.ts';

Deno.serve(
  withMonitoring(
    'payment-webhook-mercadopago',
    (request) => handleMercadoPagoWebhook(request, mercadoPagoWebhookDeps()),
    monitoringDeps,
  ),
);
