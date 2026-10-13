// Cuenta del alumno (D-068). Registro con correo, entrar con correo y editar los datos de cuenta.
// Sin servidor todavía, así que vive en este navegador y no hay contraseña. Con Supabase el correo
// se verifica y se agrega la contraseña o el acceso con Google (D-060).
import type { DataApi } from '../context';
import { AccountSchema, type Account, type User, type UserSettings } from '../schemas/people';
import { createProfile } from './profile';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;

/** Lo que el alumno edita en Tus datos. La fecha de la elección de foto la pone la app */
export type AccountDetails = Omit<Account, 'userId' | 'email' | 'updatedAt' | 'avatarChangedAt'>;

export const EMPTY_DETAILS: AccountDetails = {
  birthYear: null,
  sex: null,
  state: null,
  situation: null,
  attempt: null,
  targetSpecialty: null,
  avatar: { kind: 'initials' },
  howHeard: null,
};

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
    updatedAt: now,
  });
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
    updatedAt: now,
  });
}

/**
 * Guarda lo que el alumno cambió en Tus datos. Si eligió otra foto o pasó a iniciales, cambia la
 * fecha de la elección, y con ella esta elección gana en sus otros dispositivos (B2). Guardar sin
 * tocar la foto no la cambia, para no pisar una elección más reciente hecha en otro dispositivo
 */
export async function updateAccount(
  api: Pick<DataApi, 'repos'>,
  account: Account,
  patch: Partial<AccountDetails>,
): Promise<Account> {
  const now = new Date().toISOString();
  const avatarChanged =
    patch.avatar !== undefined && !sameAvatarChoice(account.avatar, patch.avatar);
  return api.repos.accounts.put({
    ...account,
    ...patch,
    ...(avatarChanged ? { avatarChangedAt: now } : {}),
    updatedAt: now,
  });
}
