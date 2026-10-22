// Proxy de IA de producción (B12, sección 2). Atiende los cinco motores con la sesión de Supabase de
// cada alumno, los trabajos por lote y la configuración del admin. Se despliega sin verificar JWT,
// porque /health es público y las rutas de IA verifican la sesión por su cuenta con ai_whoami.
//   supabase functions deploy ai-proxy --no-verify-jwt
// Solo lee los nombres de 2.7. La clave ENARM_ANTHROPIC_KEY la pone Ricardo como secreto.
import { createAnthropicClients } from '../_shared/ai/anthropic.ts';
import { buildAiProxy, misconfigured, structuredLog } from '../_shared/ai/edge.ts';
import { readAiProxyEnv } from '../_shared/ai/env.ts';
import { withMonitoring } from '../_shared/monitoring.ts';
import { monitoringDeps } from '../_shared/monitoringRuntime.ts';

const log = structuredLog((line) => {
  console.error(line);
});

const parsed = readAiProxyEnv({
  ENARM_ANTHROPIC_KEY: Deno.env.get('ENARM_ANTHROPIC_KEY'),
  APP_ORIGINS: Deno.env.get('APP_ORIGINS'),
  AI_ALLOW_MOCK: Deno.env.get('AI_ALLOW_MOCK'),
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  // Las llaves nuevas de Supabase (B17, 4.2). Si existen, env.ts las prefiere a las dos de arriba
  SUPABASE_PUBLISHABLE_KEYS: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
  SUPABASE_SECRET_KEYS: Deno.env.get('SUPABASE_SECRET_KEYS'),
});

let handler: (request: Request) => Response | Promise<Response>;
if (parsed.ok) {
  const { app } = buildAiProxy(parsed.env, {
    fetch,
    anthropic: createAnthropicClients,
    clock: () => Date.now(),
    log,
  });
  handler = (request) => app.fetch(request);
} else {
  // Los problemas son textos fijos que nombran la variable, nunca su valor
  for (const problem of parsed.problems) console.error(problem);
  handler = misconfigured(parsed.problems, log);
}

// El aviso a Sentry lee SENTRY_DSN al avisar, no al cargar, y ese entorno lo lee monitoringRuntime.ts, que no carga
// el resto de runtime.ts. Aquí solo se leen los nombres de 2.7
Deno.serve(withMonitoring('ai-proxy', handler, monitoringDeps));
