// Entrar con Google (B9 del plan del cambio, respuesta 26). Supabase lleva al alumno a Google y lo
// regresa a la app con la sesión en la dirección (flujo implicit, como el enlace del correo). Desde ahí
// el puente de la nube une la cuenta y reclama el dispositivo igual que con el correo. Si Supabase no
// deja entrar, regresa con el error en la dirección y aquí se traduce. El enlace del correo vencido o
// ya usado regresa igual, así que la salida a Google se marca en la pestaña y solo con esa marca el
// error se lee como de Google.
import type { SupabaseClient } from '@supabase/supabase-js';
import { INVITATION_REQUIRED_MARK } from './account';

/** Marca de que esta pestaña salió a Google. Vive en sessionStorage, que sobrevive al viaje de ida y vuelta */
export const GOOGLE_REDIRECT_KEY = 'enarm.google-redirect.v1';
/** Después de esto la marca no cuenta. Ir a Google y volver toma segundos */
export const GOOGLE_REDIRECT_TTL_MS = 60 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    // El navegador puede negar el acceso, por ejemplo con el almacenamiento bloqueado
    return null;
  }
}

function forgetGoogleRedirect(): void {
  try {
    storage()?.removeItem(GOOGLE_REDIRECT_KEY);
  } catch {
    // Sin acceso no hay nada que quitar
  }
}

/** Cuándo empezó a cargar esta página. 0 si el navegador no lo dice */
function pageStartedAt(): number {
  return typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)
    ? performance.timeOrigin
    : 0;
}

/**
 * Si esta pestaña salió a Google hace poco. La marca se borra al leerla, así cuenta para un solo
 * regreso. Una marca que puso esta misma página no se toca, porque es de la salida que está por pasar.
 * Ocurre cuando el alumno pulsa Continuar con Google antes de que termine de cargar el puente de la
 * nube, que se baja aparte. nowMs y pageStartMs son la hora de ahora y la del inicio de la página, para
 * las pruebas
 */
export function takeGoogleRedirect(
  nowMs: number = Date.now(),
  pageStartMs: number = pageStartedAt(),
): boolean {
  let raw: string | null;
  try {
    raw = storage()?.getItem(GOOGLE_REDIRECT_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw === null) return false;
  const markedAt = Number(raw);
  if (Number.isFinite(markedAt) && markedAt >= pageStartMs && pageStartMs > 0) return false;
  forgetGoogleRedirect();
  const age = nowMs - markedAt;
  return Number.isFinite(age) && age >= 0 && age <= GOOGLE_REDIRECT_TTL_MS;
}

/**
 * Lleva al alumno a Google. Antes marca la salida en esta pestaña. Solo vuelve si Supabase no pudo
 * armar la dirección, y entonces quita la marca
 */
export async function signInWithGoogle(
  cloud: Pick<SupabaseClient, 'auth'>,
  redirectTo: string,
): Promise<{ ok: boolean }> {
  try {
    storage()?.setItem(GOOGLE_REDIRECT_KEY, String(Date.now()));
  } catch {
    // Sin la marca, un error al volver se avisa como del enlace del correo. Entrar sigue funcionando
  }
  try {
    const { error } = await cloud.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) forgetGoogleRedirect();
    return { ok: !error };
  } catch {
    forgetGoogleRedirect();
    return { ok: false };
  }
}

/**
 * Por qué Supabase regresó a la app con un error. De Google, invitation_required, el correo no tiene
 * invitación y el registro sigue cerrado. cancelled, el alumno no dio permiso en Google. failed,
 * cualquier otra cosa. Del enlace del correo, link_expired, venció o ya se usó (otp_expired), y
 * link_failed, cualquier otra cosa
 */
export type OAuthRedirectError =
  'invitation_required' | 'cancelled' | 'failed' | 'link_expired' | 'link_failed';

/** Si el error viene del enlace del correo y no de Google */
export const isLinkError = (error: OAuthRedirectError) =>
  error === 'link_expired' || error === 'link_failed';

/**
 * Lo que Supabase Auth pone en la dirección al regresar con un error. sb lo agrega a todo regreso suyo
 * para que se distinga de otros (redirectErrors y prepErrorRedirectURL de supabase/auth)
 */
const ERROR_PARAMS = ['error', 'error_code', 'error_description', 'sb'] as const;

function paramsOf(href: string): { url: URL; hash: URLSearchParams } | null {
  try {
    const url = new URL(href);
    return { url, hash: new URLSearchParams(url.hash.replace(/^#/, '')) };
  } catch {
    return null;
  }
}

/**
 * El error con el que Supabase regresó a la app, o null si la dirección no trae uno. Lo pone en el
 * fragmento y, al volver de Google, también en la consulta. Trae error y, según el caso, error_code y
 * error_description. Si el alumno cancela en Google llega error=access_denied sin código, y el enlace
 * del correo vencido o ya usado llega con error=access_denied y error_code=otp_expired. fromGoogle
 * dice si esta pestaña salió a Google, y solo con esa marca el error se lee como de Google. El rechazo
 * por invitación lleva su marca y solo puede venir de Google, porque con el correo la cuenta se crea al
 * pedir el código y no al abrir el enlace
 */
export function readOAuthRedirectError(
  href: string,
  options: { fromGoogle: boolean },
): OAuthRedirectError | null {
  const parsed = paramsOf(href);
  if (!parsed) return null;
  const read = (name: (typeof ERROR_PARAMS)[number]) =>
    parsed.url.searchParams.get(name) ?? parsed.hash.get(name);
  const error = read('error');
  const description = read('error_description');
  const code = read('error_code');
  // Un parámetro error suelto de otra cosa no basta. Supabase manda también la descripción, el código
  // o la marca sb
  const fromSupabase =
    description !== null || code !== null || (error !== null && read('sb') !== null);
  if (!fromSupabase) return null;
  if (description?.includes(INVITATION_REQUIRED_MARK)) return 'invitation_required';
  if (options.fromGoogle) return error === 'access_denied' && !code ? 'cancelled' : 'failed';
  return code === 'otp_expired' ? 'link_expired' : 'link_failed';
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
