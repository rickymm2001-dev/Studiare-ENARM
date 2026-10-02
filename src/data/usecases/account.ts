// Cuenta del alumno (D-068). Registro con correo, entrar con correo y editar los datos de cuenta.
// Sin servidor todavía, así que vive en este navegador y no hay contraseña. Con Supabase el correo
// se verifica y se agrega la contraseña o el acceso con Google (D-060).
import type { DataApi } from '../context';
import { AccountSchema, type Account, type User, type UserSettings } from '../schemas/people';
import { createProfile } from './profile';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;

export type AccountDetails = Omit<Account, 'userId' | 'email' | 'updatedAt'>;

export const EMPTY_DETAILS: AccountDetails = {
  birthYear: null,
  sex: null,
  state: null,
  situation: null,
  attempt: null,
  targetSpecialty: null,
  avatar: { kind: 'initials' },
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

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
  await api.repos.accounts.put({
    userId: user.id,
    email,
    ...input.details,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, user };
}

export async function updateAccount(
  api: Pick<DataApi, 'repos'>,
  account: Account,
  patch: Partial<AccountDetails>,
): Promise<Account> {
  return api.repos.accounts.put({ ...account, ...patch, updatedAt: new Date().toISOString() });
}
