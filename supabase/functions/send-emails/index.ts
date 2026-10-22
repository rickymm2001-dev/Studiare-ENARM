// Envío de los correos de la cola con Resend (B15, 3.5). pg_cron la llama cada minuto con la ficha email_tick de
// Vault, solo si el envío está prendido y hay correos listos (supabase/migrations/20261029000003). Contesta
// 202 enseguida y manda el lote en segundo plano, a una petición cada 550 milisegundos. Se despliega sin
// verificar JWT, porque Cron no manda una sesión, y la función verifica por su cuenta la ficha: sin ella
// responde 401 sin tocar la cola. Sin RESEND_API_KEY o EMAIL_FROM responde que falta la configuración y no
// manda nada.
//   supabase functions deploy send-emails --no-verify-jwt
// Solo lee los nombres de 5.3 del plan de B15. Las llaves las pone Ricardo como secretos de las funciones.
import { withMonitoring } from '../_shared/monitoring.ts';
import { monitoringDeps, sendEmailsDeps } from '../_shared/runtime.ts';
import { handleSendEmails } from '../_shared/sendEmails.ts';

Deno.serve(
  withMonitoring(
    'send-emails',
    (request) => handleSendEmails(request, sendEmailsDeps()),
    monitoringDeps,
  ),
);
