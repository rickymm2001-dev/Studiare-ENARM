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

export type CodeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'failed' };

/** El código del correo trae de 6 a 10 dígitos, según la configuración del proyecto de Supabase */
export const EMAIL_CODE = /^\d{6,10}$/;

/** Deja solo los dígitos, para aceptar el código pegado con espacios o guiones */
export function normalizeEmailCode(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Entra con el código que viene en el mismo correo del enlace (D-115). El enlace solo abre sesión en
 * el navegador donde se abre. Con el código, el alumno lee el correo en el teléfono y entra en la
 * computadora, o al revés. Al abrirse la sesión, el puente de la nube une la cuenta como con el enlace
 */
export async function verifyEmailCode(
  cloud: SupabaseClient,
  input: { email: string; code: string },
): Promise<CodeResult> {
  try {
    const { data, error } = await cloud.auth.verifyOtp({
      email: input.email,
      token: input.code,
      type: 'email',
    });
    if (!error && data.session) return { ok: true };
    if (error?.status === 429) return { ok: false, reason: 'rate_limited' };
    // Un código vencido, ya usado o mal escrito responde con un error 4xx
    if (error?.status !== undefined && error.status >= 400 && error.status < 500) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

function isRetryableNetworkError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AuthRetryableFetchError'
  );
}

/** Rol que guarda el servidor. Alumno si no hay fila o si el valor no se reconoce */
export function parseRole(value: unknown): Role {
  const parsed = RoleSchema.safeParse(value);
  return parsed.success ? parsed.data : 'student';
}

/** Quién entró y con qué rol. null sin sesión en la nube */
export async function readCloudIdentity(cloud: SupabaseClient): Promise<CloudIdentity | null> {
  const { data, error } = await cloud.auth.getSession();
  // Con el token vencido y sin red, Supabase no puede renovarlo y responde sin sesión y con un error
  // de red. Eso no es haber cerrado sesión, y tratarlo así volvería alumno a un médico o a un admin
  // que solo abrió la app sin conexión. Falla y el puente reintenta. Se revisa el nombre del error y
  // no se importa el SDK, que se baja aparte del JavaScript inicial
  if (!data.session && isRetryableNetworkError(error)) {
    throw new Error('No se pudo renovar la sesión por falta de red');
  }
  const user = data.session?.user;
  if (!user?.email) return null;
  const [roleRow, profileRow] = await Promise.all([
    cloud.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    cloud.from('profiles').select('alias').eq('id', user.id).maybeSingle(),
  ]);
  // Si no se pudo leer el rol no se sabe quién es, y volver alumno a un médico o a un admin que solo
  // perdió la conexión lo dejaría sin sus pantallas hasta recargar. Falla y el puente reintenta
  if (roleRow.error) throw new Error('No se pudo leer el rol de la cuenta');
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

/**
 * Cierra la sesión de este navegador y de ningún otro. El valor por defecto de Supabase es global
 * y revoca las sesiones de todos los dispositivos. Con un solo dispositivo activo por cuenta eso
 * sacaría también al que acaba de ganar la cuenta, así que el alcance es siempre local
 */
export async function signOutCloud(cloud: SupabaseClient | null): Promise<void> {
  if (cloud) await cloud.auth.signOut({ scope: 'local' });
}
