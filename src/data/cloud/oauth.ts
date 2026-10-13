// Entrar con Google (B9 del plan del cambio, respuesta 26). Supabase lleva al alumno a Google y lo
// regresa a la app con la sesión en la dirección (flujo implicit, como el enlace del correo). Desde ahí
// el puente de la nube une la cuenta y reclama el dispositivo igual que con el correo. Si Supabase no
// deja entrar, por ejemplo porque el gancho del registro por invitación rechazó el correo o porque el
// alumno canceló en Google, regresa con el error en la dirección y aquí se traduce.
import type { SupabaseClient } from '@supabase/supabase-js';
import { INVITATION_REQUIRED_MARK } from './account';

/** Lleva al alumno a Google. Solo vuelve si Supabase no pudo armar la dirección */
export async function signInWithGoogle(
  cloud: Pick<SupabaseClient, 'auth'>,
  redirectTo: string,
): Promise<{ ok: boolean }> {
  try {
    const { error } = await cloud.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/**
 * Por qué no se pudo entrar con Google. invitation_required, el correo no tiene invitación y el
 * registro sigue cerrado. cancelled, el alumno no dio permiso en Google. failed, cualquier otra cosa
 */
export type OAuthRedirectError = 'invitation_required' | 'cancelled' | 'failed';

const ERROR_PARAMS = ['error', 'error_code', 'error_description'] as const;

function paramsOf(href: string): { url: URL; hash: URLSearchParams } | null {
  try {
    const url = new URL(href);
    return { url, hash: new URLSearchParams(url.hash.replace(/^#/, '')) };
  } catch {
    return null;
  }
}

/**
 * El error con el que Supabase regresó a la app, o null si la dirección no trae uno. Supabase lo pone
 * en la consulta y en el fragmento, con error, error_code y error_description
 */
export function readOAuthRedirectError(href: string): OAuthRedirectError | null {
  const parsed = paramsOf(href);
  if (!parsed) return null;
  const read = (name: (typeof ERROR_PARAMS)[number]) =>
    parsed.url.searchParams.get(name) ?? parsed.hash.get(name);
  const description = read('error_description');
  const code = read('error_code');
  if (description === null && code === null) return null;
  if (description?.includes(INVITATION_REQUIRED_MARK)) return 'invitation_required';
  return read('error') === 'access_denied' ? 'cancelled' : 'failed';
}

/** La misma dirección sin los parámetros del error, para que recargar no vuelva a mostrar el aviso */
export function withoutOAuthError(href: string): string | null {
  const parsed = paramsOf(href);
  if (!parsed) return null;
  for (const name of ERROR_PARAMS) {
    parsed.url.searchParams.delete(name);
    parsed.hash.delete(name);
  }
  const hash = parsed.hash.toString();
  parsed.url.hash = hash === '' ? '' : `#${hash}`;
  return parsed.url.toString();
}
