// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { OVERRIDES_KEY, readStoredOverrides } from '@/config/overridesStore';

const loadCloud = vi.hoisted(() => vi.fn());
const saveRemoteOverrides = vi.hoisted(() => vi.fn());
vi.mock('@/data/cloud/client', () => ({
  loadCloud,
  cloudConfigured: () => false,
  getCloud: () => null,
}));
vi.mock('@/data/cloud/adminSettings', () => ({ saveRemoteOverrides }));

import { commitOverrides } from './commitOverrides';

const NEXT = { aiCostEstimateUsd: 4 };
const LINKED = {
  status: 'linked',
  identity: { authId: 'a', email: 'a@x.mx', role: 'admin', alias: null },
} as const;

beforeEach(() => {
  loadCloud.mockReset();
  saveRemoteOverrides.mockReset();
});
afterEach(() => {
  useCloud.setState({ state: { status: 'off' } });
  localStorage.clear();
});

describe('guardar los cambios del admin', () => {
  it('sin nube se guardan solo en el navegador', async () => {
    expect(await commitOverrides(NEXT)).toBe(true);
    expect(loadCloud).not.toHaveBeenCalled();
    expect(readStoredOverrides()).toEqual(NEXT);
  });

  it('con la cuenta conectada se guardan primero en el servidor y luego en el navegador', async () => {
    useCloud.setState({ state: LINKED });
    const cloud = {};
    loadCloud.mockResolvedValue(cloud);
    saveRemoteOverrides.mockResolvedValue(true);
    expect(await commitOverrides(NEXT)).toBe(true);
    expect(saveRemoteOverrides).toHaveBeenCalledWith(cloud, NEXT);
    expect(readStoredOverrides()).toEqual(NEXT);
  });

  it('si el servidor lo rechaza no cambia nada en el navegador', async () => {
    useCloud.setState({ state: LINKED });
    loadCloud.mockResolvedValue({});
    saveRemoteOverrides.mockResolvedValue(false);
    expect(await commitOverrides(NEXT)).toBe(false);
    expect(localStorage.getItem(OVERRIDES_KEY)).toBeNull();
  });

  it('si no se pudo cargar la nube tampoco guarda a medias', async () => {
    useCloud.setState({ state: LINKED });
    loadCloud.mockResolvedValue(null);
    expect(await commitOverrides(NEXT)).toBe(false);
    expect(saveRemoteOverrides).not.toHaveBeenCalled();
    expect(localStorage.getItem(OVERRIDES_KEY)).toBeNull();
  });

  it('con null restablece los valores de fábrica en el servidor y en el navegador', async () => {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(NEXT));
    useCloud.setState({ state: LINKED });
    loadCloud.mockResolvedValue({});
    saveRemoteOverrides.mockResolvedValue(true);
    expect(await commitOverrides(null)).toBe(true);
    expect(saveRemoteOverrides).toHaveBeenCalledWith({}, null);
    expect(localStorage.getItem(OVERRIDES_KEY)).toBeNull();
  });
});
