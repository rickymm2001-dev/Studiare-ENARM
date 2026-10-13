// Une la cuenta de la nube con el perfil de este navegador (D-075). Si ya hay un perfil con ese
// correo se usa. Si no, se crea uno con el alias de la nube, así el alumno entra igual desde un
// dispositivo nuevo. La bitácora todavía vive en el navegador y se sincroniza en el bloque 9.
import type { DataApi } from '@/data/context';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readCloudAvatar, saveCloudAccount, type CloudIdentity } from '@/data/cloud/account';
import { downloadAvatar } from '@/data/cloud/avatars';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount } from './account';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;

/** Alias para un perfil nuevo. El de la nube o la parte del correo antes de la arroba */
export function aliasFor(identity: Pick<CloudIdentity, 'alias' | 'email'>): string {
  const fromCloud = identity.alias?.trim();
  if (fromCloud && fromCloud !== 'Alumno') return fromCloud.slice(0, 40);
  const local = identity.email.split('@')[0]?.trim() ?? '';
  return (local || 'Alumno').slice(0, 40);
}

export interface LinkedProfile {
  /** ID del perfil local que corresponde a la cuenta de la nube */
  userId: string;
  /** true si el perfil se creó en este momento, porque es un dispositivo nuevo para la cuenta */
  created: boolean;
}

/** Perfil local que corresponde a la cuenta de la nube */
export async function linkCloudIdentity(api: Api, identity: CloudIdentity): Promise<LinkedProfile> {
  const existing = await findAccountByEmail(api, identity.email);
  if (existing) return { userId: existing.userId, created: false };
  const result = await registerAccount(api, {
    alias: aliasFor(identity),
    email: identity.email,
    dailyGoal: { metric: 'cards', value: 20 },
    details: EMPTY_DETAILS,
  });
  if (result.ok) return { userId: result.user.id, created: true };
  // Otra pestaña lo creó al mismo tiempo
  const again = await findAccountByEmail(api, identity.email);
  if (again) return { userId: again.userId, created: false };
  throw new Error('No se pudo unir la cuenta de la nube');
}

/**
 * Sube el alias y los datos de cuenta locales a la nube. false si algo falló. Con pullPhoto, que
 * CloudBridge pasa solo cuando el perfil local acaba de nacer en un dispositivo nuevo, antes baja la
 * foto de perfil que la nube tenga y la guarda en este navegador. Fuera de ese caso lo local manda,
 * porque un alumno que eligió iniciales no debe recuperar la foto sin querer (B2 del plan del cambio)
 */
export async function pushLocalAccount(
  api: Pick<DataApi, 'repos'>,
  cloud: SupabaseClient,
  authId: string,
  userId: string,
  options: { pullPhoto?: boolean } = {},
): Promise<boolean> {
  const [user, account] = await Promise.all([
    api.repos.users.get(userId),
    api.repos.accounts.get(userId),
  ]);
  if (!user || !account) return false;
  const remote = await readCloudAvatar(cloud, authId);
  let current = account;
  if (options.pullPhoto && account.avatar.kind !== 'photo' && remote?.kind === 'photo') {
    const dataUrl = await downloadAvatar(cloud, remote.path);
    if (dataUrl) {
      current = await api.repos.accounts.put({
        ...account,
        avatar: { kind: 'photo', dataUrl },
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return saveCloudAccount(cloud, authId, current, user.alias, remote);
}
