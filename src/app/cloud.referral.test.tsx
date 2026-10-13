// @vitest-environment jsdom
// El código del enlace de invitación se canjea al conectar la cuenta en la nube (respuesta 77 del plan
// del cambio, B7). Va aparte de cloud.test.tsx para no mezclarse con las pruebas del dispositivo único.
import 'fake-indexeddb/auto';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetDeviceClaim } from '@/data/cloud/device';
import { DataProvider } from '@/data/DataProvider';
import {
  PENDING_REFERRAL_KEY,
  readPendingReferral,
  storePendingReferral,
} from '@/data/referrals/pendingReferral';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
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

function connect(fake: FakeCloud) {
  holder.cloud = fake.cloud;
  render(
    <DataProvider kind="real">
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
});
