// Une la cuenta de la nube con el perfil de este navegador (D-075). Si ya hay un perfil con ese
// correo se usa. Si no, se crea uno, así el alumno entra igual desde un dispositivo nuevo. Si entró con
// Google desde Crear cuenta, el perfil nace con lo que llenó en el registro (B9). Un perfil que nace
// sin formulario no vio el aviso, así que antes de entrar se revisa con la nube si la cuenta ya completó
// su registro en otro lado. Después pone de acuerdo con la nube la foto (B2) y los datos opcionales
// (H29), y gana lo más reciente.
import type { DataApi } from '@/data/context';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  readCloudAccount,
  readCloudSignup,
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
import { ConsentPurposeSchema } from '@/data/schemas/common';
import { ACCOUNT_DETAIL_KEYS, ConsentSchema, type Account } from '@/data/schemas/people';
import { newId } from '@/data/ids';
import { EMPTY_DETAILS, findAccountByEmail, registerAccount, sameAvatarChoice } from './account';
import { acceptedNoticeVersion } from './profile';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;

/**
 * Alias de un perfil que todavía no lo elige. Es el mismo que pone la base a una cuenta nueva
 * (handle_new_user). Completa tu registro lo deja vacío para que el alumno escriba el suyo
 */
export const PLACEHOLDER_ALIAS = 'Alumno';

/**
 * Alias para un perfil nuevo. El que el alumno eligió en la nube, o Alumno. Nunca sale del correo,
 * porque la parte antes de la arroba suele ser el nombre real (B9)
 */
export function aliasFor(identity: Pick<CloudIdentity, 'alias'>): string {
  const fromCloud = identity.alias?.trim();
  return fromCloud ? fromCloud.slice(0, 40) : PLACEHOLDER_ALIAS;
}

export interface LinkedProfile {
  /** ID del perfil local que corresponde a la cuenta de la nube */
  userId: string;
  /** true si el perfil se creó en este momento, porque es un dispositivo nuevo para la cuenta */
  created: boolean;
}

/**
 * Perfil local que corresponde a la cuenta de la nube. signup es lo que el alumno llenó en Crear cuenta
 * antes de ir a Google. Solo se usa si el perfil se crea ahora. Sin él, el perfil nace sin formulario,
 * sin decisiones bajo el aviso y sin la confirmación de edad, y no entra hasta completar su registro
 * o hasta que la nube diga que ya lo completó (B9)
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
          noticeSeen: false,
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
 * que el alumno haya guardado otra cosa mientras tanto. Lo que llenó en el registro entra campo por
 * campo y pierde su marca al juntarse. Devuelve las columnas que van a la fila, o null para no
 * tocarlas. Un dispositivo sin fecha nunca manda vacíos
 */
async function reconcileDetails(
  api: Pick<DataApi, 'repos'>,
  account: Account,
  remote: DetailsSide,
): Promise<DetailColumns | null> {
  const fromSignup = account.detailsFromSignup === true;
  const local = {
    values: detailValuesOf(account),
    changedAt: account.detailsChangedAt ?? null,
    fromSignup,
  };
  const plan = planDetailsSync(local, remote);
  if (plan.pull || fromSignup) {
    const fresh = await api.repos.accounts.get(account.userId);
    if (!fresh) return plan.push;
    const untouched =
      fresh.detailsChangedAt === account.detailsChangedAt &&
      ACCOUNT_DETAIL_KEYS.every((key) => fresh[key] === account[key]);
    if (untouched) {
      const next: Account = {
        ...fresh,
        ...plan.pull?.values,
        ...(plan.pull?.changedAt ? { detailsChangedAt: plan.pull.changedAt } : {}),
        updatedAt: new Date().toISOString(),
      };
      // Lo del registro ya se juntó. Si la subida falla, la siguiente vuelve a juntar campo por campo
      // sin fecha, o compara fechas si tomó la de la nube, y en los dos casos no se pierde nada
      delete next.detailsFromSignup;
      await api.repos.accounts.put(next);
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
 * Si el perfil de este navegador ya pasó por un registro con el aviso a la vista. Es así con la edad
 * confirmada (Crear cuenta, Completa tu registro o copiada de la nube) o con alguna decisión bajo una
 * versión del aviso, como los perfiles de antes de B9. Un perfil que nació sin formulario no tiene
 * ninguna de las dos (B9)
 */
export async function hasLocalSignup(
  api: Pick<DataApi, 'repos'>,
  userId: string,
): Promise<boolean> {
  const account = await api.repos.accounts.get(userId);
  if (account?.adultConfirmedAt) return true;
  return (await acceptedNoticeVersion(api, userId)) !== null;
}

/**
 * Qué falta para un perfil que nació sin formulario. complete, la nube ya tiene su registro y se copia
 * aquí. required, debe completar su registro. unknown, la nube no se pudo leer y no se deja pasar
 */
export type CloudSignupCheck = 'complete' | 'required' | 'unknown';

/**
 * La hora de las filas de permisos que solo cuentan qué versión del aviso aceptó la cuenta. Es la más
 * antigua posible, así ninguna decisión real, que lleva la hora de su evento, queda por debajo de ellas
 */
const NOTICE_PLACEHOLDER_AT = '1970-01-01T00:00:00.000Z';

/**
 * En un dispositivo nuevo de una cuenta que ya aceptó una versión del aviso, deja cada finalidad apagada
 * bajo esa versión, para que el aviso no se pida otra vez. No son decisiones del alumno y por eso no dejan
 * evento ni llevan la hora de hoy. Las decisiones de verdad llegan con la bitácora y las pone
 * reconcileProfile (B14, 2.2). Con un evento y la hora de hoy, estas filas valdrían más que las que
 * el alumno ya dio en otro dispositivo y las apagarían en todos
 */
async function recordAcceptedNotice(
  api: Pick<DataApi, 'repos'>,
  userId: string,
  noticeVersion: string,
): Promise<void> {
  await api.repos.consents.putMany(
    ConsentPurposeSchema.options.map((purpose) =>
      ConsentSchema.parse({
        id: newId(),
        userId,
        purpose,
        noticeVersion,
        status: 'revoked',
        decidedAt: NOTICE_PLACEHOLDER_AT,
      }),
    ),
  );
}

/**
 * Revisa con la nube un perfil que nació sin formulario (B9). Si la cuenta ya confirmó su edad o ya
 * aceptó una versión del aviso, como una cuenta de antes de B9 o una que completó su registro en otro
 * dispositivo, lo copia aquí. La edad con su fecha y, sin ninguna decisión todavía, cada finalidad
 * apagada bajo la versión que la cuenta aceptó, para que un aviso más nuevo se pida después como en
 * cualquier perfil. Decide por datos y no por cómo entró la cuenta
 */
export async function resolveCloudSignup(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  cloud: Pick<SupabaseClient, 'from'>,
  authId: string,
  userId: string,
): Promise<CloudSignupCheck> {
  const remote = await readCloudSignup(cloud, authId);
  if (remote.status === 'failed') return 'unknown';
  if (!remote.adultConfirmedAt && !remote.noticeVersion) return 'required';
  const account = await api.repos.accounts.get(userId);
  if (account && remote.adultConfirmedAt && !account.adultConfirmedAt) {
    await api.repos.accounts.put({ ...account, adultConfirmedAt: remote.adultConfirmedAt });
  }
  if (remote.noticeVersion && (await acceptedNoticeVersion(api, userId)) === null) {
    await recordAcceptedNotice(api, userId, remote.noticeVersion);
  }
  return 'complete';
}
