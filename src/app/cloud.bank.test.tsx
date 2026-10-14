// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { forgetDeviceClaim } from '@/data/cloud/device';
import { DataProvider } from '@/data/DataProvider';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { CloudBridge } from './cloud';
import { useCloud } from './cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from './preferences';
import { useSyncStatus } from './syncState';

// Banco de la nube (B11, 5.3). Con la bandera cloudBank del servidor, el catálogo se baja al conectar
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

function useFake(fake: FakeCloud) {
  fake.acceptances = [PRIVACY_NOTICE_VERSION];
  fake.sync = 'ok';
  holder.cloud = fake.cloud;
  return fake;
}

const catalogCalls = (fake: FakeCloud) =>
  fake.rpcCalls.filter((name) => name === 'catalog_changes').length;

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

describe('CloudBridge y el catálogo del banco de la nube', () => {
  it('con cloudBank prendida en el servidor baja el catálogo al conectar', async () => {
    const fake = useFake(makeFakeCloud());
    fake.flags = { cloudBank: true };
    render(
      <DataProvider kind="real">
        <CloudBridge />
      </DataProvider>,
    );
    await waitFor(() => {
      expect(catalogCalls(fake)).toBeGreaterThan(0);
    });
    // Después de reclamar el dispositivo, que es lo que piden las funciones del banco
    expect(fake.rpcCalls.indexOf('claim_device')).toBeLessThan(
      fake.rpcCalls.indexOf('catalog_changes'),
    );
  });

  it('con la bandera apagada no le pide nada al banco', async () => {
    const fake = useFake(makeFakeCloud());
    fake.flags = { cloudBank: false };
    render(
      <DataProvider kind="real">
        <CloudBridge />
      </DataProvider>,
    );
    await waitFor(() => {
      expect(useSyncStatus.getState().state.outcome.status).toBe('ok');
    });
    expect(catalogCalls(fake)).toBe(0);
  });
});
