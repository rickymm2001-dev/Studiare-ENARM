// @vitest-environment jsdom
// Entrar con Google y leer el error con el que regresa Supabase, de Google o del enlace del correo (B9).
// Las direcciones tienen la forma que arman redirectErrors (internal/api/external.go) y
// prepErrorRedirectURL (internal/api/verify.go) de supabase/auth
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GOOGLE_REDIRECT_KEY,
  GOOGLE_REDIRECT_TTL_MS,
  isLinkError,
  readOAuthRedirectError,
  signInWithGoogle,
  takeGoogleRedirect,
  withoutOAuthError,
} from './oauth';

const APP = 'https://app.studiare.example/';
const invitation = encodeURIComponent(
  'Studiare está abierto solo con invitación y este correo no tiene una (invitation_required)',
);
const GOOGLE = { fromGoogle: true };
const EMAIL = { fromGoogle: false };

afterEach(() => {
  sessionStorage.clear();
});

describe('el error con el que regresa Google', () => {
  it('reconoce el rechazo del gancho por invitación, que llega como access_denied sin código', () => {
    // El gancho responde 403 y sin código, así que la consulta lleva error_code vacío y el fragmento no
    const href = `${APP}?error=access_denied&error_code=&error_description=${invitation}#error=access_denied&error_description=${invitation}&sb=`;
    expect(readOAuthRedirectError(href, GOOGLE)).toBe('invitation_required');
    // Solo puede venir de Google, así que se reconoce aunque la marca de la salida se haya perdido
    expect(readOAuthRedirectError(href, EMAIL)).toBe('invitation_required');
    expect(
      readOAuthRedirectError(
        `${APP}#error=access_denied&error_description=${invitation}&sb=`,
        GOOGLE,
      ),
    ).toBe('invitation_required');
  });

  it('distingue al alumno que canceló en Google de cualquier otra falla', () => {
    // Google manda su propio access_denied, sin código ni descripción
    expect(
      readOAuthRedirectError(
        `${APP}?error=access_denied&error_description=#error=access_denied&sb=`,
        GOOGLE,
      ),
    ).toBe('cancelled');
    expect(readOAuthRedirectError(`${APP}#error=access_denied&sb=`, GOOGLE)).toBe('cancelled');
    // Un access_denied de Supabase con su código no es un alumno que canceló
    expect(
      readOAuthRedirectError(
        `${APP}#error=access_denied&error_code=user_banned&error_description=User+is+banned&sb=`,
        GOOGLE,
      ),
    ).toBe('failed');
    expect(
      readOAuthRedirectError(`${APP}?error=server_error&error_code=bad_oauth_state`, GOOGLE),
    ).toBe('failed');
  });

  it('una dirección sin error, como la de una sesión que sí entró, no es un error', () => {
    for (const options of [GOOGLE, EMAIL]) {
      expect(
        readOAuthRedirectError(`${APP}#access_token=abc&refresh_token=def&type=magiclink`, options),
      ).toBeNull();
      expect(readOAuthRedirectError(`${APP}suscripcion?pago=ok`, options)).toBeNull();
      // Un parámetro error suelto de otra cosa no basta
      expect(readOAuthRedirectError(`${APP}?error=1`, options)).toBeNull();
      expect(readOAuthRedirectError('no es una dirección', options)).toBeNull();
    }
  });

  it('quita los parámetros del error y la marca sb, y deja lo demás', () => {
    expect(
      withoutOAuthError(`${APP}inicio?x=1&error=server_error&error_description=${invitation}`),
    ).toBe(`${APP}inicio?x=1`);
    expect(
      withoutOAuthError(`${APP}#error=access_denied&error_code=x&error_description=y&sb=`),
    ).toBe(APP);
  });
});

describe('el error del enlace del correo', () => {
  it('un enlace vencido o ya usado se avisa como del correo y nunca como cancelar en Google', () => {
    const expired = `${APP}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=`;
    expect(readOAuthRedirectError(expired, EMAIL)).toBe('link_expired');
    expect(isLinkError('link_expired')).toBe(true);
    expect(isLinkError('cancelled')).toBe(false);
  });

  it('cualquier otra falla del enlace también se avisa como del correo', () => {
    expect(
      readOAuthRedirectError(
        `${APP}#error=server_error&error_code=unexpected_failure&error_description=x&sb=`,
        EMAIL,
      ),
    ).toBe('link_failed');
    // Sin la marca de la salida a Google, un access_denied sin código tampoco se lee como de Google
    expect(readOAuthRedirectError(`${APP}#error=access_denied&sb=`, EMAIL)).toBe('link_failed');
  });
});

/** La marca que dejó la página anterior, antes de ir a Google */
const markedBeforeThisPage = () => String(performance.timeOrigin - 1_000);
/** La hora de inicio de la página que carga al volver de Google */
const nextPage = () => Date.now() + 1;

describe('la marca de la salida a Google', () => {
  it('cuenta para un solo regreso y caduca', () => {
    expect(takeGoogleRedirect()).toBe(false);
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, markedBeforeThisPage());
    expect(takeGoogleRedirect()).toBe(true);
    expect(takeGoogleRedirect()).toBe(false);
    const old = Date.now() - GOOGLE_REDIRECT_TTL_MS - 1;
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, String(old));
    expect(takeGoogleRedirect()).toBe(false);
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, 'basura');
    expect(takeGoogleRedirect()).toBe(false);
    expect(sessionStorage.getItem(GOOGLE_REDIRECT_KEY)).toBeNull();
  });

  it('una marca que puso esta misma página se queda para el regreso de Google', () => {
    // El alumno pulsó Continuar con Google antes de que el puente de la nube terminara de cargar
    const marked = String(Date.now());
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, marked);
    expect(takeGoogleRedirect()).toBe(false);
    expect(sessionStorage.getItem(GOOGLE_REDIRECT_KEY)).toBe(marked);
    // La página que carga al volver de Google sí la toma
    expect(takeGoogleRedirect(Date.now(), nextPage())).toBe(true);
    expect(sessionStorage.getItem(GOOGLE_REDIRECT_KEY)).toBeNull();
  });
});

describe('signInWithGoogle', () => {
  it('marca la salida y pide Google a Supabase con la dirección de regreso de la app', async () => {
    const calls: unknown[] = [];
    const cloud = {
      auth: {
        signInWithOAuth: (params: unknown) => {
          calls.push(params);
          return Promise.resolve({ data: { url: 'https://x' }, error: null });
        },
      },
    } as unknown as SupabaseClient;
    expect(await signInWithGoogle(cloud, APP)).toEqual({ ok: true });
    expect(calls).toEqual([{ provider: 'google', options: { redirectTo: APP } }]);
    expect(takeGoogleRedirect(Date.now(), nextPage())).toBe(true);
  });

  it('si Supabase no puede armar la dirección o la red falla, lo dice y quita la marca', async () => {
    const failing = (reply: unknown) =>
      ({
        auth: {
          signInWithOAuth: () =>
            reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply),
        },
      }) as unknown as SupabaseClient;
    expect(await signInWithGoogle(failing({ data: null, error: { message: 'x' } }), APP)).toEqual({
      ok: false,
    });
    expect(sessionStorage.getItem(GOOGLE_REDIRECT_KEY)).toBeNull();
    expect(await signInWithGoogle(failing(new Error('sin red')), APP)).toEqual({ ok: false });
    expect(sessionStorage.getItem(GOOGLE_REDIRECT_KEY)).toBeNull();
  });
});
