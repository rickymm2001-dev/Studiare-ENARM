// Entrar con Google y leer el error con el que regresa (B9)
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { readOAuthRedirectError, signInWithGoogle, withoutOAuthError } from './oauth';

const APP = 'https://app.studiare.example/';
const invitation = encodeURIComponent(
  'Studiare está abierto solo con invitación y este correo no tiene una (invitation_required)',
);

describe('el error con el que regresa Google', () => {
  it('reconoce el rechazo por invitación en la consulta o en el fragmento', () => {
    expect(
      readOAuthRedirectError(
        `${APP}?error=server_error&error_code=unexpected_failure&error_description=${invitation}`,
      ),
    ).toBe('invitation_required');
    expect(
      readOAuthRedirectError(`${APP}#error=server_error&error_description=${invitation}`),
    ).toBe('invitation_required');
  });

  it('distingue al alumno que canceló en Google de cualquier otra falla', () => {
    expect(
      readOAuthRedirectError(`${APP}#error=access_denied&error_description=The+user+denied`),
    ).toBe('cancelled');
    expect(readOAuthRedirectError(`${APP}?error=server_error&error_code=bad_oauth_state`)).toBe(
      'failed',
    );
  });

  it('una dirección sin error, como la de una sesión que sí entró, no es un error', () => {
    expect(
      readOAuthRedirectError(`${APP}#access_token=abc&refresh_token=def&type=magiclink`),
    ).toBeNull();
    expect(readOAuthRedirectError(`${APP}suscripcion?pago=ok`)).toBeNull();
    // Un parámetro error suelto de otra cosa no basta
    expect(readOAuthRedirectError(`${APP}?error=1`)).toBeNull();
    expect(readOAuthRedirectError('no es una dirección')).toBeNull();
  });

  it('quita solo los parámetros del error y deja lo demás', () => {
    expect(
      withoutOAuthError(`${APP}inicio?x=1&error=server_error&error_description=${invitation}`),
    ).toBe(`${APP}inicio?x=1`);
    expect(withoutOAuthError(`${APP}#error=access_denied&error_code=x&error_description=y`)).toBe(
      APP,
    );
  });
});

describe('signInWithGoogle', () => {
  it('pide Google a Supabase con la dirección de regreso de la app', async () => {
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
  });

  it('si Supabase no puede armar la dirección o la red falla, lo dice', async () => {
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
    expect(await signInWithGoogle(failing(new Error('sin red')), APP)).toEqual({ ok: false });
  });
});
