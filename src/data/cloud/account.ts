// Cuenta en la nube (D-075). Entrar con un enlace al correo, sin contraseña, leer el rol que
// asigna el servidor y guardar los datos de cuenta y la aceptación del aviso de privacidad. Al
// servidor solo viajan el correo, el alias y los datos opcionales que el alumno dio. La foto de
// perfil va a Storage y en la fila queda solo su ruta (B2 del plan del cambio). Los datos opcionales
// solo viajan cuando el alumno los guardó, con su fecha (H29, B9).
import type { SupabaseClient } from '@supabase/supabase-js';
import { RoleSchema, type Role } from '@/data/schemas/common';
import {
  DETAIL_SELECT,
  parseRemoteDetails,
  utcOrNull,
  type DetailColumns,
  type DetailsSide,
} from './accountDetails';
import { parseRemoteAvatar, type CloudAvatarColumns, type RemoteAvatarState } from './avatars';

export interface CloudIdentity {
  authId: string;
  email: string;
  role: Role;
  alias: string | null;
  /**
   * Con qué entró por primera vez la cuenta, email o google. Lo dice Supabase en app_metadata.provider.
   * Falta si no se pudo leer
   */
  provider?: string | null;
}

export type LinkResult =
  { ok: true } | { ok: false; reason: 'rate_limited' | 'invitation_required' | 'failed' };

/**
 * Marca con la que el gancho Before User Created rechaza un correo sin invitación (migración
 * 20261019000001). El mensaje del gancho llega tal cual en el error de Supabase Auth
 */
export const INVITATION_REQUIRED_MARK = 'invitation_required';

/** Si un error de Auth es el rechazo del registro por invitación */
export function isInvitationRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('message' in error)) return false;
  const { message } = error;
  return typeof message === 'string' && message.includes(INVITATION_REQUIRED_MARK);
}

/** Envía el enlace de acceso. Crea la cuenta en la nube si no existe y el registro lo permite */
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
  if (isInvitationRejection(error)) return { ok: false, reason: 'invitation_required' };
  return { ok: false, reason: error.status === 429 ? 'rate_limited' : 'failed' };
}

export type CodeResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'rate_limited' | 'failed' };

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
  const provider = (user as { app_metadata?: { provider?: unknown } }).app_metadata?.provider;
  return {
    authId: user.id,
    email: user.email.toLowerCase(),
    role: parseRole(roleData?.role),
    alias: typeof profileData?.alias === 'string' ? profileData.alias : null,
    provider: typeof provider === 'string' ? provider : null,
  };
}

/**
 * Lo que va a la fila de private_accounts. La foto nunca va en la fila. avatar son las columnas que
 * decidió pushAvatar y details las que decidió planDetailsSync, o null para no tocarlas.
 * adultConfirmedAt solo se manda cuando la nube todavía no la tiene
 */
export function toCloudAccount(input: {
  avatar: CloudAvatarColumns | null;
  details: DetailColumns | null;
  adultConfirmedAt?: string | null;
}) {
  return {
    ...input.details,
    ...(input.adultConfirmedAt ? { adult_confirmed_at: input.adultConfirmedAt } : {}),
    ...input.avatar,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Lo que la nube sabe de la foto de perfil. failed si no se pudo leer, y entonces quien llama no
 * toca la foto ni Storage, porque no sabe qué elección es la más reciente
 */
export type CloudAvatarRead = ({ status: 'ok' } & RemoteAvatarState) | { status: 'failed' };

/**
 * Lee la foto que guarda la nube y cuándo se eligió. Sin fila responde ok sin foto ni fecha, como una
 * cuenta que nunca eligió. Un valor que no se reconoce cuenta como sin foto
 */
export async function readCloudAvatar(
  cloud: Pick<SupabaseClient, 'from'>,
  authId: string,
): Promise<CloudAvatarRead> {
  try {
    const { data, error } = await cloud
      .from('private_accounts')
      .select('avatar, avatar_changed_at')
      .eq('user_id', authId)
      .maybeSingle();
    if (error) return { status: 'failed' };
    const row = data as { avatar?: unknown; avatar_changed_at?: unknown } | null;
    return {
      status: 'ok',
      avatar: parseRemoteAvatar(row?.avatar),
      changedAt: utcOrNull(row?.avatar_changed_at),
    };
  } catch {
    return { status: 'failed' };
  }
}

/**
 * Lo que la nube sabe de la cuenta. La foto con su fecha, los datos opcionales con la suya y la
 * confirmación de mayoría de edad. failed si no se pudo leer, y entonces quien llama no toca nada,
 * porque no sabe qué es lo más reciente
 */
export type CloudAccountRead =
  | {
      status: 'ok';
      avatar: RemoteAvatarState;
      details: DetailsSide;
      adultConfirmedAt: string | null;
    }
  | { status: 'failed' };

/**
 * Lee la fila de la cuenta. Sin fila responde ok sin datos ni fechas, como una cuenta que nunca eligió
 * nada. Un valor que no se reconoce cuenta como sin dato
 */
export async function readCloudAccount(
  cloud: Pick<SupabaseClient, 'from'>,
  authId: string,
): Promise<CloudAccountRead> {
  try {
    const { data, error } = await cloud
      .from('private_accounts')
      .select(`avatar, avatar_changed_at, ${DETAIL_SELECT}, adult_confirmed_at`)
      .eq('user_id', authId)
      .maybeSingle();
    if (error) return { status: 'failed' };
    const row = data as Record<string, unknown> | null;
    return {
      status: 'ok',
      avatar: {
        avatar: parseRemoteAvatar(row?.avatar),
        changedAt: utcOrNull(row?.avatar_changed_at),
      },
      details: parseRemoteDetails(row),
      adultConfirmedAt: utcOrNull(row?.adult_confirmed_at),
    };
  } catch {
    return { status: 'failed' };
  }
}

/**
 * Guarda el alias y lo que decidió la sincronización de la cuenta. columns son las columnas de
 * private_accounts que cambian, sin datos ni foto cuando no hay nada que llevar
 */
export async function saveCloudAccount(
  cloud: SupabaseClient,
  authId: string,
  alias: string,
  columns: ReturnType<typeof toCloudAccount>,
): Promise<boolean> {
  const [accountResult, profileResult] = await Promise.all([
    cloud.from('private_accounts').update(columns).eq('user_id', authId),
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
 * Manda la respuesta de cómo nos conoció a la tabla privada signup_sources (B9). La primera gana, así
 * que repetirla no cambia nada. true si la nube ya la tiene, false si falló y hay que reintentar
 */
export async function recordSignupSource(
  cloud: Pick<SupabaseClient, 'rpc'>,
  heardFrom: { channel: string; influencerCode: string | null },
): Promise<boolean> {
  try {
    const { error } = await cloud.rpc('record_signup_source', {
      p_channel: heardFrom.channel,
      p_influencer_code: heardFrom.influencerCode,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Cierra la sesión de este navegador y de ningún otro. El valor por defecto de Supabase es global
 * y revoca las sesiones de todos los dispositivos. Con un solo dispositivo activo por cuenta eso
 * sacaría también al que acaba de ganar la cuenta, así que el alcance es siempre local
 */
export async function signOutCloud(cloud: SupabaseClient | null): Promise<void> {
  if (cloud) await cloud.auth.signOut({ scope: 'local' });
}
