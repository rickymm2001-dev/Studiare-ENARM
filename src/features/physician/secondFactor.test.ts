// El 42501 de una función del banco con el segundo factor de B9 (B11). Con requireMfa, al equipo sin
// sesión aal2 se le pide su código con la pantalla de B9. Con la bandera apagada, ya en aal2 o siendo
// alumno, el 42501 es falta de permiso y no se pide nada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccess } from '@/app/accessState';
import { usePreferences } from '@/app/preferences';
import type * as FeatureFlags from '@/config/featureFlags';
import type * as Mfa from '@/data/cloud/mfa';
import type { MfaStatus } from '@/data/cloud/mfa';
import { requestSecondFactor } from './secondFactor';

const holder = vi.hoisted((): { requireMfa: boolean; status: MfaStatus; asked: number } => ({
  requireMfa: true,
  status: { kind: 'unknown' },
  asked: 0,
}));

vi.mock('@/config/featureFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof FeatureFlags>()),
  isFeatureEnabled: (name: string) => name === 'requireMfa' && holder.requireMfa,
}));
vi.mock('@/data/cloud/client', () => ({
  loadCloud: () => Promise.resolve({}),
  getCloud: () => ({}),
  cloudConfigured: () => true,
}));
vi.mock('@/data/cloud/mfa', async (importOriginal) => ({
  ...(await importOriginal<typeof Mfa>()),
  readMfaStatus: () => {
    holder.asked += 1;
    return Promise.resolve(holder.status);
  },
}));

beforeEach(() => {
  holder.requireMfa = true;
  holder.asked = 0;
  useAccess.setState({ mfa: { status: 'not-required' } });
  usePreferences.setState({ role: 'physician' });
});
afterEach(() => {
  usePreferences.setState({ role: 'student' });
  useAccess.setState({ mfa: { status: 'not-required' } });
});

describe('segundo factor ante un 42501 del banco', () => {
  it('con un factor dado de alta pide el código de ese factor', async () => {
    holder.status = { kind: 'challenge', factorId: 'factor-1' };
    expect(await requestSecondFactor()).toBe(true);
    expect(useAccess.getState().mfa).toEqual({ status: 'challenge', factorId: 'factor-1' });
  });

  it('sin factor pide darlo de alta', async () => {
    usePreferences.setState({ role: 'admin' });
    holder.status = { kind: 'enroll' };
    expect(await requestSecondFactor()).toBe(true);
    expect(useAccess.getState().mfa).toEqual({ status: 'enroll' });
  });

  it('ya en aal2 el 42501 es falta de permiso y no pide nada', async () => {
    holder.status = { kind: 'verified' };
    expect(await requestSecondFactor()).toBe(false);
    expect(useAccess.getState().mfa).toEqual({ status: 'not-required' });
  });

  it('con la bandera apagada o siendo alumno ni siquiera pregunta', async () => {
    holder.status = { kind: 'enroll' };
    holder.requireMfa = false;
    expect(await requestSecondFactor()).toBe(false);
    holder.requireMfa = true;
    usePreferences.setState({ role: 'student' });
    expect(await requestSecondFactor()).toBe(false);
    expect(holder.asked).toBe(0);
    expect(useAccess.getState().mfa).toEqual({ status: 'not-required' });
  });
});
