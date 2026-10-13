// Cuenta del alumno (D-068). Registro con correo, entrar con correo y editar los datos de cuenta.
// Sin la nube vive en este navegador y no hay contraseña. Con Supabase se entra con el enlace o el
// código del correo, o con Google (B9), y la cuenta se guarda también en la nube.
import type { HeardFromChannel } from '@/config/signup';
import type { DataApi } from '../context';
import type { ConsentPurposeSchema } from '../schemas/common';
import {
  ACCOUNT_DETAIL_KEYS,
  AccountSchema,
  type Account,
  type User,
  type UserSettings,
} from '../schemas/people';
import { createProfile, setConsent } from './profile';
import type { z } from 'zod';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

/** Lo que el alumno edita en Tus datos. Las fechas de cada elección y lo del registro los pone la app */
export type AccountDetails = Omit<
  Account,
  | 'userId'
  | 'email'
  | 'updatedAt'
  | 'avatarChangedAt'
  | 'detailsChangedAt'
  | 'adultConfirmedAt'
  | 'heardFrom'
>;

export const EMPTY_DETAILS: AccountDetails = {
  birthYear: null,
  sex: null,
  state: null,
  situation: null,
  attempt: null,
  targetSpecialty: null,
  avatar: { kind: 'initials' },
};

/**
 * Lo que pide el registro además de los datos (B9). La confirmación de mayoría de edad, la respuesta
 * opcional de cómo nos conoció y los permisos opcionales que el alumno prendió, cada uno por separado
 * (4.27 del plan del cambio)
 */
export interface SignupExtras {
  adultConfirmedAt?: string;
  heardFrom?: { channel: HeardFromChannel; influencerCode: string | null } | null;
  consents?: Partial<Record<ConsentPurpose, boolean>>;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** true si dos elecciones de foto se ven igual. Un avatar generado de antes se ve como iniciales */
export function sameAvatarChoice(a: Account['avatar'], b: Account['avatar']): boolean {
  if (a.kind === 'photo' || b.kind === 'photo') {
    return a.kind === 'photo' && b.kind === 'photo' && a.dataUrl === b.dataUrl;
  }
  return true;
}

/**
 * Fecha de la elección de foto de una cuenta nueva. Una foto es una elección del alumno y la lleva.
 * Las iniciales son lo de siempre, así que no, y la nube puede traer una elección más reciente (B2)
 */
const firstAvatarChoice = (avatar: Account['avatar'], now: string) =>
  avatar.kind === 'photo' ? { avatarChangedAt: now } : {};

/**
 * Fecha de los datos opcionales de una cuenta nueva. Solo si el alumno llenó alguno. Una cuenta vacía
 * no tiene fecha, así nunca borra en la nube lo que guardó en otro dispositivo (H29)
 */
const firstDetailsChoice = (details: AccountDetails, now: string) =>
  ACCOUNT_DETAIL_KEYS.some((key) => details[key] !== null) ? { detailsChangedAt: now } : {};

/** Lo del registro que se guarda con la cuenta, con su fecha */
function signupFields(extras: SignupExtras | undefined, now: string): Partial<Account> {
  if (!extras) return {};
  return {
    ...(extras.adultConfirmedAt ? { adultConfirmedAt: extras.adultConfirmedAt } : {}),
    ...(extras.heardFrom
      ? {
          heardFrom: {
            channel: extras.heardFrom.channel,
            influencerCode: extras.heardFrom.influencerCode,
            answeredAt: now,
          },
        }
      : {}),
  };
}

export async function findAccountByEmail(api: Pick<DataApi, 'repos'>, email: string) {
  const wanted = normalizeEmail(email);
  return (await api.repos.accounts.list()).find((account) => account.email === wanted);
}

export type RegisterResult = { ok: true; user: User } | { ok: false; reason: 'email_taken' };

export async function registerAccount(
  api: Api,
  input: {
    alias: string;
    email: string;
    dailyGoal: UserSettings['dailyGoal'];
    details: AccountDetails;
    signup?: SignupExtras;
  },
): Promise<RegisterResult> {
  if (await findAccountByEmail(api, input.email)) return { ok: false, reason: 'email_taken' };
  // El correo se valida antes de crear el perfil, así no queda un perfil sin cuenta
  const email = normalizeEmail(input.email);
  AccountSchema.shape.email.parse(email);
  const user = await createProfile(api, { alias: input.alias, dailyGoal: input.dailyGoal });
  const now = new Date().toISOString();
  await api.repos.accounts.put({
    userId: user.id,
    email,
    ...input.details,
    ...firstAvatarChoice(input.details.avatar, now),
    ...firstDetailsChoice(input.details, now),
    ...signupFields(input.signup, now),
    updatedAt: now,
  });
  // Los permisos opcionales nacen apagados (4.27). Solo se prenden los que el alumno marcó
  for (const [purpose, granted] of Object.entries(input.signup?.consents ?? {})) {
    if (granted) await setConsent(api, user, purpose as ConsentPurpose, true);
  }
  return { ok: true, user };
}

/** Agrega el correo, y con él la cuenta, a un perfil viejo que no la tenía (D-068) */
export async function addAccountToProfile(
  api: Pick<DataApi, 'repos'>,
  input: { userId: string; email: string; details: AccountDetails },
): Promise<Account> {
  const now = new Date().toISOString();
  return api.repos.accounts.put({
    userId: input.userId,
    email: input.email,
    ...input.details,
    ...firstAvatarChoice(input.details.avatar, now),
    ...firstDetailsChoice(input.details, now),
    updatedAt: now,
  });
}

/**
 * Guarda lo que el alumno cambió en Tus datos. Si eligió otra foto o pasó a iniciales, cambia la
 * fecha de la elección, y con ella esta elección gana en sus otros dispositivos (B2). Lo mismo con los
 * datos opcionales, que llevan su propia fecha (H29). Guardar sin cambiar nada no mueve ninguna fecha,
 * para no pisar una elección más reciente hecha en otro dispositivo
 */
export async function updateAccount(
  api: Pick<DataApi, 'repos'>,
  account: Account,
  patch: Partial<AccountDetails>,
): Promise<Account> {
  const now = new Date().toISOString();
  const avatarChanged =
    patch.avatar !== undefined && !sameAvatarChoice(account.avatar, patch.avatar);
  const detailsChanged = ACCOUNT_DETAIL_KEYS.some(
    (key) => patch[key] !== undefined && patch[key] !== account[key],
  );
  return api.repos.accounts.put({
    ...account,
    ...patch,
    ...(avatarChanged ? { avatarChangedAt: now } : {}),
    ...(detailsChanged ? { detailsChangedAt: now } : {}),
    updatedAt: now,
  });
}

/** Confirma la mayoría de edad y, si la dio, la respuesta de cómo nos conoció. Lo usa Completa tu registro */
export async function completeSignup(
  api: Pick<DataApi, 'repos'>,
  account: Account,
  extras: SignupExtras,
): Promise<Account> {
  const now = new Date().toISOString();
  return api.repos.accounts.put({
    ...account,
    ...signupFields(extras, now),
    // Una confirmación ya guardada se queda con su fecha, igual que en la nube
    ...(account.adultConfirmedAt ? { adultConfirmedAt: account.adultConfirmedAt } : {}),
    ...(account.heardFrom ? { heardFrom: account.heardFrom } : {}),
    updatedAt: now,
  });
}
