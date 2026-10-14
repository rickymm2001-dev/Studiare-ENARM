// Sincronización del banco con el Google Sheet (B11, sección 3 del plan de B11). Cron la llama cada hora
// con la ficha de Vault y el admin con su sesión desde Banco y Sheet. Se despliega sin verificar JWT,
// porque Cron no manda una sesión, y la función verifica por su cuenta la ficha o la sesión del admin.
// Cualquier otra petición recibe 401 sin tocar Google.
//   supabase functions deploy bank-sync --no-verify-jwt
import { handleBankSync } from '../_shared/bank/sync.ts';
import { bankSyncDeps } from '../_shared/runtime.ts';

let currentRun: string | null = null;
const deps = bankSyncDeps((runId) => {
  currentRun = runId;
});

// Si la función se apaga a media corrida, la corrida queda como interrumpida y no como en curso
addEventListener('beforeunload', () => {
  if (currentRun === null) return;
  void deps.store
    .finish(currentRun, { seenKeys: null, summary: {}, status: 'interrupted', reason: 'shutdown' })
    .catch(() => undefined);
});

Deno.serve((request) => handleBankSync(request, deps));
