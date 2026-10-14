// @vitest-environment jsdom
// El código del enlace de invitación se canjea al conectar la cuenta en la nube (respuesta 77 del plan
// del cambio, B7). Va aparte de cloud.test.tsx para no mezclarse con las pruebas del dispositivo único.
// Una cuenta que todavía debe Completa tu registro lo canjea hasta terminarlo (B9).
import 'fake-indexeddb/auto';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { forgetDeviceClaim } from '@/data/cloud/device';
import { useDataApi, type DataApi } from '@/data/context';
import { DataProvider } from '@/data/DataProvider';
import {
  PENDING_REFERRAL_KEY,
  readPendingReferral,
  storePendingReferral,
} from '@/data/referrals/pendingReferral';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { completeSignup, findAccountByEmail } from '@/data/usecases/account';
import { decideAllConsents } from '@/data/usecases/profile';
import { useAccess } from './accessState';
import { CloudBridge } from './cloud';
import { useCloud } from './cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';

// getCloud devuelve el cliente falso que cada prueba arma. Sin él es como no tener nube configurada
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const captured: { api?: DataApi } = {};

function Capture() {
  const value = useDataApi();
  useEffect(() => {
    captured.api = value;
  });
  return null;
}

/**
 * Conecta la nube de la prueba. Por omisión la cuenta ya completó su registro en otro dispositivo y
 * aceptó el aviso, como las cuentas de antes de B9. Con registered en false nunca lo completó
 */
function connect(fake: FakeCloud, options: { registered?: boolean } = {}) {
  if (options.registered ?? true) fake.acceptances = [PRIVACY_NOTICE_VERSION];
  holder.cloud = fake.cloud;
  render(
    <DataProvider kind="real">
      <Capture />
      <CloudBridge />
    </DataProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'checking' } });
});

afterEach(() => {
  cleanup();
  useAccess.setState({ signup: { status: 'none' } });
  holder.cloud = null;
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'off' } });
});

describe('canje del enlace de invitación al conectar la cuenta', () => {
  it('con un código guardado lo canjea después de reclamar el dispositivo', async () => {
    storePendingReferral('ABCD2345');
    const fake = makeFakeCloud();
    connect(fake);
    await waitFor(() => {
      expect(fake.rpcCalls).toContain('redeem_referral_code');
    });
    // Primero el dispositivo, porque el canje pide el dispositivo activo
    expect(fake.rpcCalls.indexOf('claim_device')).toBeLessThan(
      fake.rpcCalls.indexOf('redeem_referral_code'),
    );
    // Este servidor de prueba no conoce la función, así que el código se queda para otro intento
    expect(readPendingReferral()).toBe('ABCD2345');
  });

  it('sin código guardado no llama al canje', async () => {
    const fake = makeFakeCloud();
    connect(fake);
    await waitFor(() => {
      expect(useCloud.getState().state.status).toBe('linked');
    });
    await waitFor(() => {
      expect(fake.rpcCalls).toContain('claim_device');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.rpcCalls).not.toContain('redeem_referral_code');
    expect(localStorage.getItem(PENDING_REFERRAL_KEY)).toBeNull();
  });

  it('una cuenta que debe Completa tu registro lo canjea hasta terminarlo, después del aviso (B9)', async () => {
    const EMAIL = 'referido@example.com';
    storePendingReferral('ABCD2345');
    const fake = makeFakeCloud({
      session: { id: '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10', email: EMAIL },
    });
    fake.remoteAccount = { adult_confirmed_at: null };
    fake.rpcReplies.redeem_referral_code = { data: 'ok', error: null };
    connect(fake, { registered: false });
    await waitFor(() => {
      expect(useAccess.getState().signup.status).toBe('required');
    });
    // Ya reclamó el dispositivo, pero sin aviso aceptado ni edad confirmada no manda el código
    expect(fake.rpcCalls).toContain('claim_device');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.rpcCalls).not.toContain('redeem_referral_code');
    expect(readPendingReferral()).toBe('ABCD2345');

    // Lo que guarda Completa tu registro
    const api = captured.api as DataApi;
    const account = await findAccountByEmail(api, EMAIL);
    const user = account ? await api.repos.users.get(account.userId) : undefined;
    if (!account || !user) throw new Error('falta el perfil');
    await completeSignup(api, account, { adultConfirmedAt: '2026-10-13T11:00:00.000Z' });
    await decideAllConsents(api, user, {});
    act(() => {
      useAccess.getState().finishSignup();
    });
    await waitFor(() => {
      expect(fake.rpcCalls).toContain('redeem_referral_code');
    });
    // El aviso se registra antes de canjear el código, y el canje lo borra
    expect(fake.acceptances).toEqual([PRIVACY_NOTICE_VERSION]);
    await waitFor(() => {
      expect(readPendingReferral()).toBeNull();
    });
  });
});
