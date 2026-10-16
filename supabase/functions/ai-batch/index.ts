// Ciclo de lotes de IA (B12, 3.4). pg_cron la llama cada 10 minutos con el encabezado x-ai-tick, solo
// si hay trabajos pendientes o lotes sin procesar (supabase/manual/ia-lotes-cron.sql). Contesta 202
// enseguida y trabaja en segundo plano dentro de su plazo. Se despliega sin verificar JWT, porque cron
// no manda una sesión. Rechaza toda petición con Origin y toda la que no traiga el secreto de Vault.
//   supabase functions deploy ai-batch --no-verify-jwt
// Solo lee los nombres de 2.7. La clave ENARM_ANTHROPIC_KEY la pone Ricardo como secreto.
import { createAnthropicClients } from '../_shared/ai/anthropic.ts';
import { buildAiBatch, misconfigured, structuredLog } from '../_shared/ai/edge.ts';
import { readAiBatchEnv } from '../_shared/ai/env.ts';

const log = structuredLog((line) => {
  console.error(line);
});

const parsed = readAiBatchEnv({
  ENARM_ANTHROPIC_KEY: Deno.env.get('ENARM_ANTHROPIC_KEY'),
  AI_ALLOW_MOCK: Deno.env.get('AI_ALLOW_MOCK'),
  AI_TICK_DEADLINE_MS: Deno.env.get('AI_TICK_DEADLINE_MS'),
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
});

let handler: (request: Request) => Promise<Response>;
if (parsed.ok) {
  handler = buildAiBatch(parsed.env, {
    fetch,
    anthropic: createAnthropicClients,
    clock: () => Date.now(),
    log,
    waitUntil: (work) => {
      EdgeRuntime.waitUntil(work);
    },
  });
} else {
  for (const problem of parsed.problems) console.error(problem);
  handler = misconfigured(parsed.problems, log);
}

Deno.serve(handler);
