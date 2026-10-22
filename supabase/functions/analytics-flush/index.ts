// Envío a PostHog de los eventos de dinero de la cola (B15, 1.7). pg_cron la llama cada 5 minutos con la
// ficha analytics_tick de Vault, solo si analytics está prendido y hay eventos pendientes
// (supabase/migrations/20261029000003). Se despliega sin verificar JWT, porque Cron no manda una sesión, y la
// función verifica por su cuenta la ficha: sin ella responde 401 sin tocar la cola. Sin POSTHOG_PROJECT_KEY
// o POSTHOG_HOST responde que falta la configuración y no manda nada.
//   supabase functions deploy analytics-flush --no-verify-jwt
// Solo lee los nombres de 5.3 del plan de B15. Las llaves las pone Ricardo como secretos de las funciones.
import { handleAnalyticsFlush } from '../_shared/analyticsFlush.ts';
import { withMonitoring } from '../_shared/monitoring.ts';
import { analyticsFlushDeps, monitoringDeps } from '../_shared/runtime.ts';

Deno.serve(
  withMonitoring(
    'analytics-flush',
    (request) => handleAnalyticsFlush(request, analyticsFlushDeps()),
    monitoringDeps,
  ),
);
