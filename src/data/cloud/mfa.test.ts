// Segundo factor del equipo con el Supabase falso (B9)
import { describe, expect, it } from 'vitest';
import { makeFakeCloud } from '../testing/fakeCloud';
import {
  needsMfaRole,
  qrImageSource,
  readMfaStatus,
  resetUserMfa,
  startTotpEnrollment,
  verifyTotp,
} from './mfa';

describe('quién da segundo factor', () => {
  it('médicos, admins y el dueño, y nunca el alumno', () => {
    expect(needsMfaRole('student')).toBe(false);
    expect(needsMfaRole('physician')).toBe(true);
    expect(needsMfaRole('admin')).toBe(true);
    expect(needsMfaRole('owner')).toBe(true);
  });
});

describe('estado del segundo factor', () => {
  it('sin factor pide el alta, con factor pide el código y con aal2 ya está', async () => {
    const fake = makeFakeCloud();
    expect(await readMfaStatus(fake.cloud)).toEqual({ kind: 'enroll' });
    fake.mfa.factors = [{ id: 'f1', factor_type: 'totp', status: 'verified' }];
    expect(await readMfaStatus(fake.cloud)).toEqual({ kind: 'challenge', factorId: 'f1' });
    fake.mfa.level = 'aal2';
    expect(await readMfaStatus(fake.cloud)).toEqual({ kind: 'verified' });
    fake.mfa.failRead = true;
    expect(await readMfaStatus(fake.cloud)).toEqual({ kind: 'unknown' });
  });

  it('un factor que quedó sin verificar no cuenta como dado de alta', async () => {
    const fake = makeFakeCloud();
    fake.mfa.factors = [{ id: 'f0', factor_type: 'totp', status: 'unverified' }];
    expect(await readMfaStatus(fake.cloud)).toEqual({ kind: 'enroll' });
  });
});

describe('alta y código', () => {
  it('quita un alta a medias, da el QR codificado y la clave, y el código correcto sube a aal2', async () => {
    const fake = makeFakeCloud();
    fake.mfa.factors = [{ id: 'viejo', factor_type: 'totp', status: 'unverified' }];
    const started = await startTotpEnrollment(fake.cloud);
    if (!started.ok) throw new Error('no empezó el alta');
    expect(fake.mfa.factors.map((factor) => factor.id)).toEqual([started.enrollment.factorId]);
    expect(started.enrollment.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(started.enrollment.qrCode.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(
      true,
    );
    // El # del SVG va codificado, para que no corte la imagen
    expect(started.enrollment.qrCode).not.toContain('#');

    expect(
      await verifyTotp(fake.cloud, { factorId: started.enrollment.factorId, code: '000000' }),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(
      await verifyTotp(fake.cloud, { factorId: started.enrollment.factorId, code: '654321' }),
    ).toEqual({ ok: true });
    expect(fake.mfa.level).toBe('aal2');
  });

  it('si Supabase no deja empezar el alta lo dice', async () => {
    const fake = makeFakeCloud();
    fake.mfa.failEnroll = true;
    expect(await startTotpEnrollment(fake.cloud)).toEqual({ ok: false });
  });

  it('solo acepta un QR que sea SVG', () => {
    expect(qrImageSource('data:image/svg+xml;utf-8,<svg></svg>')).toBe(
      'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
    );
    expect(qrImageSource('<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E');
    expect(qrImageSource('javascript:alert(1)')).toBeNull();
  });
});

describe('el dueño restablece el factor de alguien del equipo', () => {
  it('llama a la función del servidor con la cuenta y traduce su respuesta', async () => {
    const fake = makeFakeCloud();
    fake.functionReplies['admin-reset-mfa'] = { data: { removed: 1 } };
    expect(await resetUserMfa(fake.cloud, 'u-1')).toEqual({ ok: true, removed: 1 });
    expect(fake.functionCalls).toEqual([{ name: 'admin-reset-mfa', body: { userId: 'u-1' } }]);
    for (const [code, status] of [
      ['not_owner', 403],
      ['self', 403],
      ['not_found', 404],
    ] as const) {
      fake.functionReplies['admin-reset-mfa'] = { error: { body: { error: code }, status } };
      expect(await resetUserMfa(fake.cloud, 'u-1')).toEqual({ ok: false, reason: code });
    }
    fake.functionReplies['admin-reset-mfa'] = { error: { body: { error: 'failed' }, status: 502 } };
    expect(await resetUserMfa(fake.cloud, 'u-1')).toEqual({ ok: false, reason: 'failed' });
  });

  it('distingue la función sin publicar de una cuenta que no existe', async () => {
    const fake = makeFakeCloud();
    // Sin respuesta, el falso contesta como la puerta de Supabase, con 404 y sin el código de la función
    expect(await resetUserMfa(fake.cloud, 'u-1')).toEqual({ ok: false, reason: 'not_configured' });
    fake.functionReplies['admin-reset-mfa'] = {
      error: { body: { error: 'not_found' }, status: 404 },
    };
    expect(await resetUserMfa(fake.cloud, 'u-1')).toEqual({ ok: false, reason: 'not_found' });
  });
});
