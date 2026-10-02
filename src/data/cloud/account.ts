// Cuenta en la nube (D-075). Entrar con un enlace al correo, sin contraseña, leer el rol que
// asigna el servidor y guardar los datos de cuenta y la aceptación del aviso de privacidad. Al
// servidor solo viajan el correo, el alias y los datos opcionales que el alumno dio.
import type { SupabaseClient } from '@supabase/supabase-js';
import { RoleSchema, type Role } from '@/data/schemas/common';
import type { Account } from '@/data/schemas/people';

export interface CloudIdentity {
  authId: string;
  email: string;
  role: Role;
  alias: string | null;
}

export type LinkResult = { ok: true } | { ok: false; reason: 'rate_limited' | 'failed' };

/** Envía el enlace de acceso. Crea la cuenta en la nube si no existe */
export async function requestEmailLink(
  cloud: SupabaseClient,
  input: { email: string; alias?: string; redirectTo: string },
): Promise<LinkResult> {
  const { error } = await cloud.auth.signInWithOtp({
    email: input.email,
    options: {
      emailRedirectTo: input.redirectTo,
      shouldCreateUser: true,
      ...(input.alias ? { data: { alias: input.alias } } : {}),
    },
  });
  if (!error) return { ok: true };
  return { ok: false, reason: error.status === 429 ? 'rate_limited' : 'failed' };
}

/** Rol que guarda el servidor. Alumno si no hay fila o si el valor no se reconoce */
export function parseRole(value: unknown): Role {
  const parsed = RoleSchema.safeParse(value);
  return parsed.success ? parsed.data : 'student';
}

/** Quién entró y con qué rol. null sin sesión en la nube */
export async function readCloudIdentity(cloud: SupabaseClient): Promise<CloudIdentity | null> {
  const { data } = await cloud.auth.getSession();
  const user = data.session?.user;
  if (!user?.email) return null;
  const [roleRow, profileRow] = await Promise.all([
    cloud.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    cloud.from('profiles').select('alias').eq('id', user.id).maybeSingle(),
  ]);
  const roleData = roleRow.data as { role?: unknown } | null;
  const profileData = profileRow.data as { alias?: unknown } | null;
  return {
    authId: user.id,
    email: user.email.toLowerCase(),
    role: parseRole(roleData?.role),
    alias: typeof profileData?.alias === 'string' ? profileData.alias : null,
  };
}

/** Datos de cuenta en el formato de la tabla private_accounts. La foto propia no se sube aún */
export function toCloudAccount(account: Account) {
  return {
    birth_year: account.birthYear,
    sex: account.sex,
    state: account.state,
    situation: account.situation,
    attempt: account.attempt,
    target_specialty: account.targetSpecialty,
    avatar: account.avatar.kind === 'photo' ? { kind: 'initials' } : account.avatar,
    updated_at: new Date().toISOString(),
  };
}

export async function saveCloudAccount(
  cloud: SupabaseClient,
  authId: string,
  account: Account,
  alias: string,
): Promise<boolean> {
  const [accountResult, profileResult] = await Promise.all([
    cloud.from('private_accounts').update(toCloudAccount(account)).eq('user_id', authId),
    cloud.from('profiles').update({ alias }).eq('id', authId),
  ]);
  return !accountResult.error && !profileResult.error;
}

/** Registra que aceptó el aviso de privacidad, una sola vez por versión */
export async function recordPrivacyAcceptance(
  cloud: SupabaseClient,
  authId: string,
  noticeVersion: string,
): Promise<void> {
  const existing = await cloud
    .from('privacy_acceptances')
    .select('id')
    .eq('user_id', authId)
    .eq('notice_version', noticeVersion)
    .limit(1);
  if ((existing.data ?? []).length > 0) return;
  await cloud
    .from('privacy_acceptances')
    .insert({ user_id: authId, notice_version: noticeVersion });
}

export async function signOutCloud(cloud: SupabaseClient | null): Promise<void> {
  if (cloud) await cloud.auth.signOut();
}
