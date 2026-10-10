// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetDeviceClaim } from '@/data/cloud/device';
import { DataProvider } from '@/data/DataProvider';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { CloudBridge } from './cloud';
import { useCloud } from './cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';
import { INITIAL_SYNC_UI } from './syncScheduler';
import { useSyncStatus } from './syncState';

// getCloud devuelve el cliente falso que cada prueba arma. Sin él es como no tener nube configurada
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

function mount(kind: 'real' | 'demo' = 'real') {
  return render(
    <DataProvider kind={kind}>
      <CloudBridge />
    </DataProvider>,
  );
}

function useFake(fake: FakeCloud) {
  holder.cloud = fake.cloud;
  return fake;
}

const syncCalls = (fake: FakeCloud) => fake.rpcCalls.filter((name) => name === 'sync_clock').length;

beforeEach(() => {
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'checking' } });
  useSyncStatus.getState().reset();
});

afterEach(() => {
  cleanup();
  holder.cloud = null;
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'off' } });
  useSyncStatus.getState().reset();
});

describe('CloudBridge y la sincronización entre dispositivos', () => {
  it('al entrar con la nube sincroniza y deja el resultado a la vista', async () => {
    const fake = useFake(makeFakeCloud());
    fake.sync = 'ok';
    mount();
    await waitFor(() => {
      expect(useSyncStatus.getState().state.outcome.status).toBe('ok');
    });
    expect(syncCalls(fake)).toBe(1);
    expect(useSyncStatus.getState().state.lastSyncAt).not.toBeNull();
    expect(useSyncStatus.getState().syncNow).not.toBeNull();
    // Sincronizar ahora corre otra vez
    await act(async () => {
      await useSyncStatus.getState().syncNow?.();
    });
    expect(syncCalls(fake)).toBe(2);
  });

  it('no sincroniza antes de reclamar el dispositivo ni si otro dispositivo tiene la cuenta', async () => {
    const fake = useFake(makeFakeCloud({ row: { device_id: 'otro-navegador' } }));
    fake.sync = 'ok';
    localStorage.setItem('enarm.device-claim.v1', '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10');
    mount();
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fake.rpcCalls.filter((name) => name.startsWith('sync_'))).toHaveLength(0);
    expect(useSyncStatus.getState().syncNow).toBeNull();
  });

  it('si otro dispositivo gana la cuenta después, deja de sincronizar en el acto', async () => {
    const fake = useFake(makeFakeCloud());
    fake.sync = 'ok';
    mount();
    await waitFor(() => {
      expect(useSyncStatus.getState().state.outcome.status).toBe('ok');
    });
    const before = syncCalls(fake);
    fake.row = { device_id: 'otro-navegador' };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 120_000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(useCloud.getState().state).toEqual({ status: 'signed-out', reason: 'other_device' });
    });
    expect(useSyncStatus.getState().state).toEqual(INITIAL_SYNC_UI);
    expect(useSyncStatus.getState().syncNow).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(syncCalls(fake)).toBe(before);
  });

  it('si la nube no responde a la sincronización, el alumno sigue con su sesión', async () => {
    const fake = useFake(makeFakeCloud());
    mount();
    await waitFor(() => {
      expect(useSyncStatus.getState().state.outcome).toEqual({
        status: 'failed',
        failure: 'network',
      });
    });
    expect(useCloud.getState().state.status).toBe('linked');
    expect(fake.signOuts).toHaveLength(0);
  });

  it('en la demostración no sincroniza', async () => {
    const fake = useFake(makeFakeCloud());
    fake.sync = 'ok';
    mount('demo');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fake.rpcCalls).toHaveLength(0);
    expect(useSyncStatus.getState().state).toEqual(INITIAL_SYNC_UI);
  });

  it('al desmontar se detiene y no deja temporizadores', async () => {
    const fake = useFake(makeFakeCloud());
    fake.sync = 'ok';
    const view = mount();
    await waitFor(() => {
      expect(useSyncStatus.getState().state.outcome.status).toBe('ok');
    });
    view.unmount();
    expect(useSyncStatus.getState().syncNow).toBeNull();
    const before = syncCalls(fake);
    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(syncCalls(fake)).toBe(before);
  });
});
