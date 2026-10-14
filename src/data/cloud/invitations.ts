// Registro solo con invitación hasta el lanzamiento (B9 del plan del cambio, respuesta 52). El dueño y
// los admins invitan correos en signup_invitations y ven si ya crearon su cuenta. Quien decide es el
// gancho Before User Created del servidor, que corre con el correo y con Google. El interruptor
// registration_open de platform_settings abre el registro para todos el día del lanzamiento.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AccountSchema } from '../schemas/people.ts';

export interface Invitation {
  email: string;
  invitedAt: string;
  /** true si ese correo ya tiene cuenta en la nube */
  registered: boolean;
}

export type InvitationsFailure = 'not_admin' | 'no_session' | 'network' | 'unknown';

export const REGISTRATION_SETTING_KEY = 'registration_open';

const RowSchema = z.object({
  email: z.string(),
  invited_at: z.string(),
  registered: z.boolean(),
});

interface DbError {
  code?: string | undefined;
}

function failureOf(error: DbError): InvitationsFailure {
  // 42501 es la política por fila o la función que pide ser admin
  if (error.code === '42501') return 'not_admin';
  if (error.code === '28000') return 'no_session';
  // Sin código es que la petición ni llegó al servidor
  if (!error.code) return 'network';
  return 'unknown';
}

/** El correo como lo guarda la base. null si no es un correo válido */
export function normalizeInvitationEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return AccountSchema.shape.email.safeParse(email).success ? email : null;
}

export async function listInvitations(
  cloud: Pick<SupabaseClient, 'rpc'>,
): Promise<{ ok: true; invitations: Invitation[] } | { ok: false; reason: InvitationsFailure }> {
  try {
    const reply = await cloud.rpc('admin_list_invitations');
    if (reply.error) return { ok: false, reason: failureOf(reply.error) };
    const parsed = z.array(RowSchema).safeParse(reply.data);
    if (!parsed.success) return { ok: false, reason: 'unknown' };
    return {
      ok: true,
      invitations: parsed.data.map((row) => ({
        email: row.email,
        invitedAt: row.invited_at,
        registered: row.registered,
      })),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export type InviteResult =
  { ok: true } | { ok: false; reason: InvitationsFailure | 'invalid' | 'duplicate' };

/** Invita un correo. La base lo guarda en minúsculas y anota quién invitó */
export async function inviteEmail(
  cloud: Pick<SupabaseClient, 'from'>,
  raw: string,
): Promise<InviteResult> {
  const email = normalizeInvitationEmail(raw);
  if (!email) return { ok: false, reason: 'invalid' };
  try {
    const { error } = await cloud.from('signup_invitations').insert({ email });
    if (!error) return { ok: true };
    if (error.code === '23505') return { ok: false, reason: 'duplicate' };
    if (error.code === '23514') return { ok: false, reason: 'invalid' };
    return { ok: false, reason: failureOf(error) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Quita una invitación. Quien ya creó su cuenta la conserva */
export async function revokeInvitation(
  cloud: Pick<SupabaseClient, 'from'>,
  email: string,
): Promise<{ ok: true } | { ok: false; reason: InvitationsFailure }> {
  try {
    const { error } = await cloud.from('signup_invitations').delete().eq('email', email);
    return error ? { ok: false, reason: failureOf(error) } : { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Si el registro está abierto para todos. null si no se pudo saber. Sin la clave, cerrado */
export async function readRegistrationOpen(
  cloud: Pick<SupabaseClient, 'from'>,
): Promise<boolean | null> {
  try {
    const { data, error } = await cloud
      .from('platform_settings')
      .select('value')
      .eq('key', REGISTRATION_SETTING_KEY)
      .maybeSingle();
    if (error) return null;
    return (data as { value?: unknown } | null)?.value === true;
  } catch {
    return null;
  }
}

/** Abre o cierra el registro. Solo el dueño y los admins pueden, por el permiso por fila de la tabla */
export async function setRegistrationOpen(
  cloud: Pick<SupabaseClient, 'from'>,
  open: boolean,
): Promise<boolean> {
  try {
    const { error } = await cloud.from('platform_settings').upsert({
      key: REGISTRATION_SETTING_KEY,
      value: open,
      updated_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}
