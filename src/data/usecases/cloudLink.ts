// Une la cuenta de la nube con el perfil de este navegador (D-075). Si ya hay un perfil con ese
// correo se usa. Si no, se crea uno con el alias de la nube, así el alumno entra igual desde un
// dispositivo nuevo. La bitácora todavía vive en el navegador y se sincroniza en el bloque 9.
import type { DataApi } from '@/data/context';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  readCloudAvatar,
  saveCloudAccount,
  type CloudAvatarRead,
  type CloudIdentity,
} from '@/data/cloud/account';
import {
  avatarPath,
  downloadAvatar,
  photoHash,
  planAvatarSync,
  pushAvatar,
  type CloudAvatarColumns,
  type RemoteAvatarState,
} from '@/data/cloud/avatars';
import type { Account } from '@/data/schemas/people';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount, sameAvatarChoice } from './account';

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
 * Trae a este navegador la elección de foto de la nube, con su fecha. Si la foto no se pudo bajar no
 * cambia nada y se reintenta en la siguiente sincronización. Si el alumno guardó otra elección aquí
 * mientras tanto, la suya es más reciente y tampoco se toca
 */
async function pullAvatar(
  api: Pick<DataApi, 'repos'>,
  cloud: SupabaseClient,
  authId: string,
  read: Account,
  remote: RemoteAvatarState,
): Promise<void> {
  let avatar: Account['avatar'] = { kind: 'initials' };
  if (remote.avatar?.kind === 'photo') {
    const { hash } = remote.avatar;
    if (read.avatar.kind === 'photo' && photoHash(read.avatar.dataUrl) === hash) {
      avatar = read.avatar;
    } else {
      // Siempre de la carpeta del alumno, diga lo que diga la fila
      const dataUrl = await downloadAvatar(cloud, avatarPath(authId));
      if (!dataUrl) return;
      avatar = { kind: 'photo', dataUrl };
    }
  }
  const fresh = await api.repos.accounts.get(read.userId);
  if (
    !fresh ||
    fresh.avatarChangedAt !== read.avatarChangedAt ||
    !sameAvatarChoice(fresh.avatar, read.avatar)
  ) {
    return;
  }
  await api.repos.accounts.put({
    ...fresh,
    avatar,
    ...(remote.changedAt ? { avatarChangedAt: remote.changedAt } : {}),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Pone de acuerdo la foto de este navegador y la de la nube (B2). Gana la elección más reciente,
 * según la fecha que solo cambia cuando el alumno guarda otra foto o pasa a iniciales en Tus datos.
 * Devuelve las columnas de la foto para la fila, o null para no tocarlas. Si la nube no se pudo leer
 * no toca nada, ni la fila ni Storage, porque no se sabe qué elección es la más reciente
 */
async function reconcileAvatar(
  api: Pick<DataApi, 'repos'>,
  cloud: SupabaseClient,
  authId: string,
  account: Account,
  remote: CloudAvatarRead,
): Promise<CloudAvatarColumns | null> {
  if (remote.status === 'failed') return null;
  const local = { avatar: account.avatar, changedAt: account.avatarChangedAt ?? null };
  switch (planAvatarSync(local, remote)) {
    case 'push':
      return pushAvatar(cloud, authId, local, remote.avatar);
    case 'pull':
      await pullAvatar(api, cloud, authId, account, remote);
      return null;
    case 'none':
      return null;
  }
}

/**
 * Sube el alias y los datos de cuenta locales a la nube. false si algo falló. Antes pone de acuerdo
 * la foto de perfil con la nube, así un dispositivo nuevo o uno que se quedó atrás baja la elección
 * más reciente, y uno donde el alumno acaba de elegir la sube o la quita
 */
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
  const remote = await readCloudAvatar(cloud, authId);
  const avatar = await reconcileAvatar(api, cloud, authId, account, remote);
  return saveCloudAccount(cloud, authId, account, user.alias, avatar);
}
