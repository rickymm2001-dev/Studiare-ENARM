// Une la cuenta de la nube con el perfil de este navegador (D-075). Si ya hay un perfil con ese
// correo se usa. Si no, se crea uno con el alias de la nube, así el alumno entra igual desde un
// dispositivo nuevo. La bitácora todavía vive en el navegador y se sincroniza en el bloque 9.
import type { DataApi } from '@/data/context';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveCloudAccount, type CloudIdentity } from '@/data/cloud/account';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount } from './account';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;

/** Alias para un perfil nuevo. El de la nube o la parte del correo antes de la arroba */
export function aliasFor(identity: Pick<CloudIdentity, 'alias' | 'email'>): string {
  const fromCloud = identity.alias?.trim();
  if (fromCloud && fromCloud !== 'Alumno') return fromCloud.slice(0, 40);
  const local = identity.email.split('@')[0]?.trim() ?? '';
  return (local || 'Alumno').slice(0, 40);
}

/** ID del perfil local que corresponde a la cuenta de la nube */
export async function linkCloudIdentity(api: Api, identity: CloudIdentity): Promise<string> {
  const existing = await findAccountByEmail(api, identity.email);
  if (existing) return existing.userId;
  const result = await registerAccount(api, {
    alias: aliasFor(identity),
    email: identity.email,
    dailyGoal: { metric: 'cards', value: 20 },
    details: EMPTY_DETAILS,
  });
  if (result.ok) return result.user.id;
  // Otra pestaña lo creó al mismo tiempo
  const again = await findAccountByEmail(api, identity.email);
  if (again) return again.userId;
  throw new Error('No se pudo unir la cuenta de la nube');
}

/** Sube el alias y los datos de cuenta locales a la nube. false si algo falló */
export async function pushLocalAccount(
  api: Pick<DataApi, 'repos'>,
  cloud: SupabaseClient,
  authId: string,
  userId: string,
): Promise<boolean> {
  const [user, account] = await Promise.all([
    api.repos.users.get(userId),
    api.repos.accounts.get(userId),
  ]);
  if (!user || !account) return false;
  return saveCloudAccount(cloud, authId, account, user.alias);
}
