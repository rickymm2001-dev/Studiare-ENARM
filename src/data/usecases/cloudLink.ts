// Une la cuenta de la nube con el perfil de este navegador (D-075). Si ya hay un perfil con ese
// correo se usa. Si no, se crea uno con el alias de la nube, así el alumno entra igual desde un
// dispositivo nuevo. Si entró con Google desde Crear cuenta, el perfil nace con lo que llenó en el
// registro (B9). Después pone de acuerdo con la nube la foto (B2) y los datos opcionales (H29), y gana
// lo más reciente.
import type { DataApi } from '@/data/context';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  readCloudAccount,
  recordSignupSource,
  saveCloudAccount,
  toCloudAccount,
  type CloudIdentity,
} from '@/data/cloud/account';
import {
  detailValuesOf,
  planDetailsSync,
  type DetailColumns,
  type DetailsSide,
} from '@/data/cloud/accountDetails';
import {
  avatarPath,
  downloadAvatar,
  photoHash,
  planAvatarSync,
  pushAvatar,
  type CloudAvatarColumns,
  type RemoteAvatarState,
} from '@/data/cloud/avatars';
import type { PendingSignup } from '@/data/cloud/pendingSignup';
import { ACCOUNT_DETAIL_KEYS, type Account } from '@/data/schemas/people';
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

/**
 * Perfil local que corresponde a la cuenta de la nube. signup es lo que el alumno llenó en Crear cuenta
 * antes de ir a Google. Solo se usa si el perfil se crea ahora
 */
export async function linkCloudIdentity(
  api: Api,
  identity: CloudIdentity,
  signup: PendingSignup | null = null,
): Promise<LinkedProfile> {
  const existing = await findAccountByEmail(api, identity.email);
  if (existing) return { userId: existing.userId, created: false };
  const result = await registerAccount(
    api,
    signup
      ? {
          alias: signup.alias,
          email: identity.email,
          dailyGoal: signup.dailyGoal,
          details: signup.details,
          signup: {
            adultConfirmedAt: signup.adultConfirmedAt,
            heardFrom: signup.heardFrom,
            consents: signup.consents,
          },
        }
      : {
          alias: aliasFor(identity),
          email: identity.email,
          dailyGoal: { metric: 'cards', value: 20 },
          details: EMPTY_DETAILS,
        },
  );
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
 * Devuelve las columnas de la foto para la fila, o null para no tocarlas
 */
async function reconcileAvatar(
  api: Pick<DataApi, 'repos'>,
  cloud: SupabaseClient,
  authId: string,
  account: Account,
  remote: RemoteAvatarState,
): Promise<CloudAvatarColumns | null> {
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
 * Pone de acuerdo los datos opcionales (H29). Lo que manda la nube se copia a este navegador, salvo
 * que el alumno haya guardado otra cosa mientras tanto. Devuelve las columnas que van a la fila, o null
 * para no tocarlas. Un dispositivo sin fecha nunca manda vacíos
 */
async function reconcileDetails(
  api: Pick<DataApi, 'repos'>,
  account: Account,
  remote: DetailsSide,
): Promise<DetailColumns | null> {
  const local = { values: detailValuesOf(account), changedAt: account.detailsChangedAt ?? null };
  const plan = planDetailsSync(local, remote);
  if (plan.pull) {
    const fresh = await api.repos.accounts.get(account.userId);
    if (!fresh) return plan.push;
    const untouched =
      fresh.detailsChangedAt === account.detailsChangedAt &&
      ACCOUNT_DETAIL_KEYS.every((key) => fresh[key] === account[key]);
    if (untouched) {
      await api.repos.accounts.put({
        ...fresh,
        ...plan.pull.values,
        ...(plan.pull.changedAt ? { detailsChangedAt: plan.pull.changedAt } : {}),
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return plan.push;
}

/**
 * La confirmación de mayoría de edad (pregunta 45). Si la nube ya la tiene y este navegador no, se
 * copia aquí. Si solo la tiene este navegador, devuelve la fecha para subirla. La nube conserva la
 * primera
 */
async function reconcileAdult(
  api: Pick<DataApi, 'repos'>,
  account: Account,
  remote: string | null,
): Promise<string | null> {
  if (account.adultConfirmedAt) return remote ? null : account.adultConfirmedAt;
  if (remote) {
    const fresh = await api.repos.accounts.get(account.userId);
    if (fresh && !fresh.adultConfirmedAt) {
      await api.repos.accounts.put({ ...fresh, adultConfirmedAt: remote });
    }
  }
  return null;
}

/** Manda una sola vez la respuesta de cómo nos conoció. Se marca en la cuenta para no repetirla */
async function recordHeardFrom(
  api: Pick<DataApi, 'repos'>,
  cloud: SupabaseClient,
  account: Account,
): Promise<void> {
  const answer = account.heardFrom;
  if (!answer || answer.recordedAt) return;
  if (!(await recordSignupSource(cloud, answer))) return;
  const fresh = await api.repos.accounts.get(account.userId);
  const stored = fresh?.heardFrom;
  // Si el alumno cambió la respuesta mientras tanto, la nueva se manda en la siguiente
  if (!fresh || stored?.answeredAt !== answer.answeredAt) return;
  await api.repos.accounts.put({
    ...fresh,
    heardFrom: { ...stored, recordedAt: new Date().toISOString() },
  });
}

/**
 * Sube el alias y lo que corresponde de la cuenta. false si algo falló. Antes pone de acuerdo con la
 * nube la foto y los datos opcionales, así un dispositivo nuevo o uno que se quedó atrás baja lo más
 * reciente y uno donde el alumno acaba de guardar lo sube. Si la nube no se pudo leer solo sube el
 * alias, porque no se sabe qué es lo más reciente
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
  const remote = await readCloudAccount(cloud, authId);
  let columns = toCloudAccount({ avatar: null, details: null });
  if (remote.status === 'ok') {
    const avatar = await reconcileAvatar(api, cloud, authId, account, remote.avatar);
    const details = await reconcileDetails(api, account, remote.details);
    const adultConfirmedAt = await reconcileAdult(api, account, remote.adultConfirmedAt);
    columns = toCloudAccount({ avatar, details, adultConfirmedAt });
  }
  const saved = await saveCloudAccount(cloud, authId, user.alias, columns);
  await recordHeardFrom(api, cloud, account);
  return saved;
}

/**
 * Si una cuenta que entró con Google, sin pasar por Crear cuenta, todavía debe confirmar su edad y
 * aceptar el aviso (B9). Las cuentas que entraron con el correo ya lo hicieron en el formulario. Si
 * la nube no se pudo leer no se pide nada, porque no se sabe
 */
export async function signupCompletionNeeded(
  api: Pick<DataApi, 'repos'>,
  cloud: Pick<SupabaseClient, 'from'>,
  identity: Pick<CloudIdentity, 'authId' | 'provider'>,
  userId: string,
): Promise<boolean> {
  if (!identity.provider || identity.provider === 'email') return false;
  const account = await api.repos.accounts.get(userId);
  if (!account || account.adultConfirmedAt) return false;
  const remote = await readCloudAccount(cloud, identity.authId);
  if (remote.status !== 'ok') return false;
  if (remote.adultConfirmedAt) {
    await api.repos.accounts.put({ ...account, adultConfirmedAt: remote.adultConfirmedAt });
    return false;
  }
  return true;
}
