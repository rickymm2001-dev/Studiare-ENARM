import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { EMAIL_CODE, normalizeEmailCode, verifyEmailCode } from './account';

interface VerifyReply {
  data: { session: unknown };
  error: { status?: number } | null;
}

function cloudReplying(reply: VerifyReply | Error) {
  const calls: unknown[] = [];
  const cloud = {
    auth: {
      verifyOtp: (params: unknown) => {
        calls.push(params);
        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
      },
    },
  } as unknown as SupabaseClient;
  return { cloud, calls };
}

describe('entrar con el código del correo (D-115)', () => {
  it('acepta el código pegado con espacios o guiones y pide de 6 a 10 dígitos', () => {
    expect(normalizeEmailCode(' 123 456 ')).toBe('123456');
    expect(normalizeEmailCode('12-34-56-78')).toBe('12345678');
    expect(EMAIL_CODE.test('123456')).toBe(true);
    expect(EMAIL_CODE.test('1234567890')).toBe(true);
    expect(EMAIL_CODE.test('12345')).toBe(false);
    expect(EMAIL_CODE.test('12345678901')).toBe(false);
    expect(EMAIL_CODE.test('12345a')).toBe(false);
  });

  it('verifica el código del correo con el tipo email y abre la sesión', async () => {
    const { cloud, calls } = cloudReplying({ data: { session: { access_token: 'x' } }, error: null });
    expect(await verifyEmailCode(cloud, { email: 'ana@x.mx', code: '123456' })).toEqual({
      ok: true,
    });
    expect(calls).toEqual([{ email: 'ana@x.mx', token: '123456', type: 'email' }]);
  });

  it('un código vencido o mal escrito es inválido', async () => {
    const { cloud } = cloudReplying({ data: { session: null }, error: { status: 403 } });
    expect(await verifyEmailCode(cloud, { email: 'ana@x.mx', code: '000000' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('distingue el exceso de intentos de una falla del servidor o de la red', async () => {
    const limited = cloudReplying({ data: { session: null }, error: { status: 429 } });
    expect(await verifyEmailCode(limited.cloud, { email: 'a@x.mx', code: '123456' })).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    const down = cloudReplying({ data: { session: null }, error: { status: 500 } });
    expect(await verifyEmailCode(down.cloud, { email: 'a@x.mx', code: '123456' })).toEqual({
      ok: false,
      reason: 'failed',
    });
    const offline = cloudReplying(new Error('sin red'));
    expect(await verifyEmailCode(offline.cloud, { email: 'a@x.mx', code: '123456' })).toEqual({
      ok: false,
      reason: 'failed',
    });
  });

  it('sin sesión en la respuesta no da por buena la entrada', async () => {
    const { cloud } = cloudReplying({ data: { session: null }, error: null });
    expect(await verifyEmailCode(cloud, { email: 'a@x.mx', code: '123456' })).toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});
