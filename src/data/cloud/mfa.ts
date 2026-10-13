// Segundo factor del equipo (B9 del plan del cambio, respuesta 30). Médicos, admins y el dueño dan de
// alta un código TOTP de una app de autenticación y lo escriben al entrar. Con el código correcto la
// sesión de Supabase sube a aal2, que es lo que piden los permisos por fila cuando la bandera requireMfa
// está prendida (migración 20261019000001). El alumno nunca pasa por aquí. El dueño puede quitar el
// factor de alguien del equipo que perdió su teléfono, con la función admin-reset-mfa del servidor.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../schemas/common.ts';

/** Los roles que piden segundo factor */
export const MFA_ROLES: readonly Role[] = ['physician', 'admin', 'owner'];
export const needsMfaRole = (role: Role) => MFA_ROLES.includes(role);

/**
 * Dónde está la sesión. verified, ya tiene aal2. challenge, tiene un factor y falta el código.
 * enroll, todavía no tiene factor. unknown, no se pudo saber, por ejemplo sin red
 */
export type MfaStatus =
  | { kind: 'verified' }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'enroll' }
  | { kind: 'unknown' };

type CloudAuth = Pick<SupabaseClient, 'auth'>;

export async function readMfaStatus(cloud: CloudAuth): Promise<MfaStatus> {
  try {
    const [level, factors] = await Promise.all([
      cloud.auth.mfa.getAuthenticatorAssuranceLevel(),
      cloud.auth.mfa.listFactors(),
    ]);
    if (level.error || factors.error) return { kind: 'unknown' };
    if (level.data.currentLevel === 'aal2') return { kind: 'verified' };
    // totp solo trae los factores verificados
    const factor = factors.data.totp[0];
    return factor ? { kind: 'challenge', factorId: factor.id } : { kind: 'enroll' };
  } catch {
    return { kind: 'unknown' };
  }
}

export interface TotpEnrollment {
  factorId: string;
  /** El código QR como dirección data: lista para una imagen */
  qrCode: string;
  /** La clave para escribirla a mano si no se puede escanear */
  secret: string;
}

const SVG_PREFIX = /^data:image\/svg\+xml;utf-?8,/i;

/**
 * El QR que manda Supabase es un SVG sin codificar dentro de una dirección data:. Se vuelve a codificar
 * para que un # o un espacio del SVG no lo corten. null si no es un SVG
 */
export function qrImageSource(raw: string): string | null {
  const svg = raw.replace(SVG_PREFIX, '').trim();
  if (!svg.startsWith('<svg') && !svg.startsWith('<?xml')) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Empieza el alta de un factor TOTP. Antes quita un alta que quedó a medias, porque Supabase no deja
 * dos factores sin verificar con el mismo nombre
 */
export async function startTotpEnrollment(
  cloud: CloudAuth,
): Promise<{ ok: true; enrollment: TotpEnrollment } | { ok: false }> {
  try {
    const listed = await cloud.auth.mfa.listFactors();
    for (const factor of listed.data?.all ?? []) {
      if (factor.factor_type === 'totp' && factor.status === 'unverified') {
        await cloud.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    const { data, error } = await cloud.auth.mfa.enroll({
      factorType: 'totp',
      // Único por alta, porque Supabase no deja dos factores con el mismo nombre
      friendlyName: `Studiare ${Date.now().toString(36)}`,
      issuer: 'Studiare',
    });
    if (error) return { ok: false };
    const qrCode = qrImageSource(data.totp.qr_code);
    if (!qrCode) return { ok: false };
    return { ok: true, enrollment: { factorId: data.id, qrCode, secret: data.totp.secret } };
  } catch {
    return { ok: false };
  }
}

export type VerifyResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'rate_limited' | 'failed' };

/** Los 6 dígitos que da la app de autenticación */
export const TOTP_CODE = /^\d{6}$/;

/**
 * Revisa el código de la app de autenticación. Sirve para terminar el alta y para entrar después. Con
 * el código correcto la sesión queda en aal2 y Supabase avisa MFA_CHALLENGE_VERIFIED
 */
export async function verifyTotp(
  cloud: CloudAuth,
  input: { factorId: string; code: string },
): Promise<VerifyResult> {
  try {
    const { error } = await cloud.auth.mfa.challengeAndVerify({
      factorId: input.factorId,
      code: input.code,
    });
    if (!error) return { ok: true };
    if (error.status === 429) return { ok: false, reason: 'rate_limited' };
    if (error.status !== undefined && error.status >= 400 && error.status < 500) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export type ResetMfaResult =
  | { ok: true; removed: number }
  | { ok: false; reason: 'not_owner' | 'self' | 'not_found' | 'not_configured' | 'failed' };

/** El estado de la respuesta y el código de error que mandó la función, si el cuerpo trae uno */
async function failureOf(error: unknown): Promise<{ status: number | null; code: string | null }> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return { status: null, code: null };
  try {
    const body: unknown = await context.clone().json();
    const code = (body as { error?: unknown } | null)?.error;
    return { status: context.status, code: typeof code === 'string' ? code : null };
  } catch {
    return { status: context.status, code: null };
  }
}

/**
 * El dueño quita el segundo factor de alguien del equipo, que lo vuelve a dar de alta al entrar. Lo
 * hace la función admin-reset-mfa del servidor, que revisa que quien pide sea el dueño
 */
export async function resetUserMfa(
  cloud: Pick<SupabaseClient, 'functions'>,
  userId: string,
): Promise<ResetMfaResult> {
  try {
    const reply = await cloud.functions.invoke<unknown>('admin-reset-mfa', { body: { userId } });
    if (reply.error) {
      const { status, code } = await failureOf(reply.error);
      if (code === 'not_owner' || code === 'self' || code === 'not_found') {
        return { ok: false, reason: code };
      }
      // Un 404 sin el código de la función lo da la puerta de Supabase. La función no está publicada
      if (status === 404) return { ok: false, reason: 'not_configured' };
      return { ok: false, reason: 'failed' };
    }
    const removed = (reply.data as { removed?: unknown } | null)?.removed;
    return { ok: true, removed: typeof removed === 'number' ? removed : 0 };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
