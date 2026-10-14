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
import type { SupabaseEnv } from '../_shared/supabase.ts';

// Supabase inyecta estas tres en toda función. No se piden ni se guardan en ningún otro lado
const env: SupabaseEnv = {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
};

Deno.serve((request) =>
  handleResetMfa(request, {
    appUrl: Deno.env.get('APP_URL'),
    authorize: (authorization, target) => authorizeViaRest(env, authorization, target),
    listFactors: (userId) => listFactorsViaRest(env, userId),
    deleteFactor: (userId, factorId) => deleteFactorViaRest(env, userId, factorId),
    log: (line) => {
      console.error(line);
    },
  }),
);
