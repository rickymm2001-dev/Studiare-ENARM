// Restablece el segundo factor de alguien del equipo (B9). Solo el dueño, y lo revisa la base con su
// sesión. Esta función verifica el JWT de Supabase y usa la llave de servicio solo para la API de
// administración de Auth, que borra los factores y cierra las sesiones de esa persona.
//   supabase functions deploy admin-reset-mfa
// No se despliega desde la sesión de B9. Lo hace Ricardo o la sesión que tenga su autorización.
import {
  authorizeViaRest,
  deleteFactorViaRest,
  handleResetMfa,
  listFactorsViaRest,
} from '../_shared/mfaReset.ts';
import { resolveSupabaseKeys } from '../_shared/keys.ts';
import { monitoringDepsFrom, withMonitoring } from '../_shared/monitoring.ts';
import type { SupabaseEnv } from '../_shared/supabase.ts';

// Supabase inyecta la dirección y las llaves en toda función. No se piden ni se guardan en ningún otro lado.
// Las llaves nuevas (sb_secret_ y sb_publishable_) ganan si existen y, si no, siguen las de siempre (B17, 4.2)
const keys = resolveSupabaseKeys({
  SUPABASE_SECRET_KEYS: Deno.env.get('SUPABASE_SECRET_KEYS'),
  SUPABASE_PUBLISHABLE_KEYS: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
});
const env: SupabaseEnv = {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: keys.anonKey,
  serviceKey: keys.serviceKey,
};

Deno.serve(
  withMonitoring(
    'admin-reset-mfa',
    (request) =>
      handleResetMfa(request, {
        appUrl: Deno.env.get('APP_URL'),
        appOrigins: Deno.env.get('APP_ORIGINS'),
        authorize: (authorization, target) => authorizeViaRest(env, authorization, target),
        listFactors: (userId) => listFactorsViaRest(env, userId),
        deleteFactor: (userId, factorId) => deleteFactorViaRest(env, userId, factorId),
        log: (line) => {
          console.error(line);
        },
      }),
    // El aviso a Sentry lee SENTRY_DSN al avisar y no al cargar la función
    () =>
      monitoringDepsFrom(
        (name) => Deno.env.get(name),
        (work) => {
          EdgeRuntime.waitUntil(work);
        },
      ),
  ),
);
