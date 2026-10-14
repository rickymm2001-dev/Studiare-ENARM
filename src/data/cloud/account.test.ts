import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { makeFakeCloud } from '../testing/fakeCloud';
import {
  EMAIL_CODE,
  isInvitationRejection,
  normalizeEmailCode,
  readCloudAccount,
  readCloudAvatar,
  recordSignupSource,
  requestEmailLink,
  saveCloudAccount,
  toCloudAccount,
  verifyEmailCode,
} from './account';
import { photoHash } from './avatars';

const AUTH_ID = '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10';
const PATH = `${AUTH_ID}/avatar.jpg`;
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const CHOSEN = '2026-10-13T10:00:00.120Z';

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
    const { cloud, calls } = cloudReplying({
      data: { session: { access_token: 'x' } },
      error: null,
    });
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

describe('guardar la cuenta en la nube con su foto (B2)', () => {
  it('con las columnas de la foto, la fila lleva su ruta, su huella y la fecha de la elección', async () => {
    const fake = makeFakeCloud();
    const columns = {
      avatar: { kind: 'photo' as const, path: PATH, hash: photoHash(JPEG) },
      avatar_changed_at: CHOSEN,
    };
    expect(
      await saveCloudAccount(
        fake.cloud,
        AUTH_ID,
        'Rick',
        toCloudAccount({ avatar: columns, details: null }),
      ),
    ).toBe(true);
    const row = fake.accountUpdates[0];
    expect(row?.avatar).toEqual(columns.avatar);
    expect(row?.avatar_changed_at).toBe(CHOSEN);
    const sent = JSON.stringify(row);
    expect(sent).not.toContain('base64');
    expect(sent).not.toContain('rick@example.com');
    // Guardar la cuenta no toca Storage. De eso se encarga pushAvatar antes
    expect(fake.storageCalls).toEqual([]);
  });

  it('sin columnas de la foto ni de los datos, la fila deja todo como estaba (H29)', async () => {
    const fake = makeFakeCloud();
    await saveCloudAccount(
      fake.cloud,
      AUTH_ID,
      'Rick',
      toCloudAccount({ avatar: null, details: null }),
    );
    const row = fake.accountUpdates[0] ?? {};
    expect(Object.keys(row)).toEqual(['updated_at']);
  });

  it('la fila lleva los nombres de la tabla, la confirmación de edad si se da y nunca el correo', () => {
    const row = toCloudAccount({
      avatar: { avatar: { kind: 'initials' }, avatar_changed_at: null },
      details: { birth_year: 1998, details_changed_at: CHOSEN },
      adultConfirmedAt: CHOSEN,
    });
    expect(row).toMatchObject({
      birth_year: 1998,
      details_changed_at: CHOSEN,
      adult_confirmed_at: CHOSEN,
      avatar: { kind: 'initials' },
    });
    expect(JSON.stringify(row)).not.toContain('rick@example.com');
    expect(JSON.stringify(row)).not.toContain('base64');
    expect('adult_confirmed_at' in toCloudAccount({ avatar: null, details: null })).toBe(false);
  });
});

describe('leer la cuenta de la nube con sus datos y fechas (B9, H29)', () => {
  it('trae la foto, los datos opcionales con su fecha y la confirmación de edad', async () => {
    const fake = makeFakeCloud();
    fake.remoteAccount = {
      avatar: { kind: 'initials' },
      avatar_changed_at: null,
      birth_year: 1998,
      sex: 'female',
      state: 'YUC',
      situation: 'graduated',
      attempt: 2,
      target_specialty: 'pediatrics',
      details_changed_at: '2026-10-13T10:00:00.12+00:00',
      adult_confirmed_at: '2026-10-13T10:00:00.12+00:00',
    };
    expect(await readCloudAccount(fake.cloud, AUTH_ID)).toEqual({
      status: 'ok',
      avatar: { avatar: { kind: 'initials' }, changedAt: null },
      details: {
        values: {
          birthYear: 1998,
          sex: 'female',
          state: 'YUC',
          situation: 'graduated',
          attempt: 2,
          targetSpecialty: 'pediatrics',
        },
        changedAt: CHOSEN,
      },
      adultConfirmedAt: CHOSEN,
    });
  });

  it('un dato que no se reconoce cuenta como sin dato y una lectura fallida lo dice', async () => {
    const fake = makeFakeCloud();
    fake.remoteAccount = {
      birth_year: 1800,
      sex: 'robot',
      state: 'yuc',
      details_changed_at: 'ayer',
    };
    const read = await readCloudAccount(fake.cloud, AUTH_ID);
    expect(read.status === 'ok' && read.details).toEqual({
      values: {
        birthYear: null,
        sex: null,
        state: null,
        situation: null,
        attempt: null,
        targetSpecialty: null,
      },
      changedAt: null,
    });
    fake.failAccountRead = 'error';
    expect(await readCloudAccount(fake.cloud, AUTH_ID)).toEqual({ status: 'failed' });
    fake.failAccountRead = 'throw';
    expect(await readCloudAccount(fake.cloud, AUTH_ID)).toEqual({ status: 'failed' });
  });
});

describe('registro por invitación (B9)', () => {
  it('reconoce el rechazo del gancho por su marca y no confunde otros errores', () => {
    expect(
      isInvitationRejection({
        status: 403,
        message:
          'Studiare está abierto solo con invitación y este correo no tiene una (invitation_required)',
      }),
    ).toBe(true);
    expect(isInvitationRejection({ status: 403, message: 'Email logins are disabled' })).toBe(
      false,
    );
    expect(isInvitationRejection(null)).toBe(false);
    expect(isInvitationRejection('invitation_required')).toBe(false);
  });

  it('pedir el enlace sin invitación responde invitation_required y lo demás sigue igual', async () => {
    const replying = (error: { status: number; message: string } | null) =>
      ({
        auth: { signInWithOtp: () => Promise.resolve({ data: {}, error }) },
      }) as unknown as SupabaseClient;
    const input = { email: 'nadie@x.mx', redirectTo: 'https://app.example/' };
    expect(
      await requestEmailLink(
        replying({ status: 403, message: 'no tiene una (invitation_required)' }),
        input,
      ),
    ).toEqual({ ok: false, reason: 'invitation_required' });
    expect(await requestEmailLink(replying({ status: 429, message: 'too many' }), input)).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    expect(await requestEmailLink(replying({ status: 500, message: 'boom' }), input)).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(await requestEmailLink(replying(null), input)).toEqual({ ok: true });
  });

  it('cómo nos conoció viaja una vez a la función privada, con el canal y el código', async () => {
    const calls: unknown[] = [];
    const cloud = (reply: { error: unknown } | 'throw') =>
      ({
        rpc: (name: string, args: unknown) => {
          calls.push([name, args]);
          return reply === 'throw'
            ? Promise.reject(new TypeError('Failed to fetch'))
            : Promise.resolve({ data: true, ...reply });
        },
      }) as unknown as SupabaseClient;
    expect(
      await recordSignupSource(cloud({ error: null }), {
        channel: 'instagram',
        influencerCode: 'ANA_2026',
      }),
    ).toBe(true);
    expect(calls).toEqual([
      ['record_signup_source', { p_channel: 'instagram', p_influencer_code: 'ANA_2026' }],
    ]);
    expect(
      await recordSignupSource(cloud({ error: { code: '42501' } }), {
        channel: 'friend',
        influencerCode: null,
      }),
    ).toBe(false);
    expect(
      await recordSignupSource(cloud('throw'), { channel: 'friend', influencerCode: null }),
    ).toBe(false);
  });
});

describe('leer lo que la nube guarda como foto', () => {
  it('devuelve el valor de la fila y la fecha con el formato de la cuenta local', async () => {
    const fake = makeFakeCloud();
    fake.remoteAccount = {
      avatar: { kind: 'photo', path: PATH, hash: photoHash(JPEG) },
      // Así responde la base, con la zona y sin ceros al final
      avatar_changed_at: '2026-10-13T10:00:00.12+00:00',
    };
    expect(await readCloudAvatar(fake.cloud, AUTH_ID)).toEqual({
      status: 'ok',
      avatar: { kind: 'photo', path: PATH, hash: photoHash(JPEG) },
      changedAt: CHOSEN,
    });
  });

  it('sin fila responde como una cuenta que nunca eligió, y un valor extraño cuenta como sin foto', async () => {
    const fake = makeFakeCloud();
    expect(await readCloudAvatar(fake.cloud, AUTH_ID)).toEqual({
      status: 'ok',
      avatar: null,
      changedAt: null,
    });
    fake.remoteAccount = {
      avatar: { kind: 'photo', path: 'otra/avatar.jpg' },
      avatar_changed_at: 'ayer',
    };
    expect(await readCloudAvatar(fake.cloud, AUTH_ID)).toEqual({
      status: 'ok',
      avatar: null,
      changedAt: null,
    });
  });

  it('si la lectura falla lo dice, para que nadie toque la foto con dudas', async () => {
    const fake = makeFakeCloud();
    fake.remoteAccount = { avatar: { kind: 'initials' }, avatar_changed_at: CHOSEN };
    fake.failAccountRead = 'error';
    expect(await readCloudAvatar(fake.cloud, AUTH_ID)).toEqual({ status: 'failed' });
    fake.failAccountRead = 'throw';
    expect(await readCloudAvatar(fake.cloud, AUTH_ID)).toEqual({ status: 'failed' });
  });
});
