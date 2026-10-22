// La baja de los recordatorios de repaso (B15, 3.6). El POST de un clic de Gmail y Yahoo, el de la página
// /correo/baja de la app y la redirección del GET. Se despliega sin verificar JWT, porque quien llama es el
// correo de una persona y se identifica con su ficha de baja, y responde 200 en blanco aunque la ficha no
// exista, para no revelar nada.
//   supabase functions deploy email-unsubscribe --no-verify-jwt
import { withMonitoring } from '../_shared/monitoring.ts';
import { emailUnsubscribeDeps, monitoringDeps } from '../_shared/runtime.ts';
import { handleEmailUnsubscribe } from '../_shared/unsubscribe.ts';

Deno.serve(
  withMonitoring(
    'email-unsubscribe',
    (request) => handleEmailUnsubscribe(request, emailUnsubscribeDeps()),
    monitoringDeps,
  ),
);
