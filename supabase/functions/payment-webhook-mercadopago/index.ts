// Avisos de pago de Mercado Pago. Verifica la firma, consulta el pago con el token del servidor y lo
// aplica en la base una sola vez. Se publica sin verificación de JWT, porque quien llama es Mercado
// Pago y se identifica con su firma:
//   supabase functions deploy payment-webhook-mercadopago --no-verify-jwt
import { handleMercadoPagoWebhook } from '../_shared/payments.ts';
import { paymentDeps } from '../_shared/runtime.ts';

Deno.serve((request) => handleMercadoPagoWebhook(request, paymentDeps()));
