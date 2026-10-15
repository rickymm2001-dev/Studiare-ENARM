// @vitest-environment jsdom
// Qué banco editorial usa el equipo (B11, 5.7 del plan de B11). Con base real, nube configurada y rol del
// equipo nunca cae a la base local. Mientras se revisa la sesión carga y sin sesión o sin conexión dice
// que necesita conexión (M6 de la revisión). La demo sigue con la base local.
import 'fake-indexeddb/auto';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { DataProvider } from '@/data/DataProvider';
import { useEditorialKind, useEditorialRepo } from './useEditorialRepo';

const holder = vi.hoisted((): { configured: boolean } => ({ configured: true }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () =>
    holder.configured ? { rpc: () => Promise.resolve({ data: null, error: null }) } : null,
  cloudConfigured: () => holder.configured,
  loadCloud: () => Promise.resolve(null),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <DataProvider kind="real">{children}</DataProvider>
);

const LINKED = {
  status: 'linked',
  identity: { authId: 'yo', email: 'yo@ejemplo.mx', role: 'physician', alias: null },
} as const;

afterEach(() => {
  cleanup();
  holder.configured = true;
  useCloud.setState({ state: { status: 'off' } });
  usePreferences.setState({ role: 'student', database: 'demo' });
});

describe('banco editorial del equipo', () => {
  it('con base real, nube y rol del equipo usa la nube, carga mientras revisa y no cae a la local', () => {
    usePreferences.setState({ role: 'physician', database: 'real' });
    useCloud.setState({ state: LINKED });
    expect(renderHook(() => useEditorialKind(), { wrapper }).result.current).toBe('cloud');
    useCloud.setState({ state: { status: 'checking' } });
    expect(renderHook(() => useEditorialKind(), { wrapper }).result.current).toBe('checking');
    useCloud.setState({ state: { status: 'error' } });
    expect(renderHook(() => useEditorialKind(), { wrapper }).result.current).toBe('unavailable');
    useCloud.setState({ state: { status: 'signed-out' } });
    expect(renderHook(() => useEditorialKind(), { wrapper }).result.current).toBe('unavailable');
  });

  it('sin conexión el banco responde network y no lee la base local', async () => {
    usePreferences.setState({ role: 'admin', database: 'real' });
    useCloud.setState({ state: { status: 'error' } });
    const { result } = renderHook(() => useEditorialRepo(), { wrapper });
    expect(result.current.ready).toBe(true);
    expect(result.current.repo.kind).toBe('cloud');
    await expect(result.current.repo.list({}, { limit: 10, offset: 0 })).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('mientras revisa la sesión no está listo', () => {
    usePreferences.setState({ role: 'physician', database: 'real' });
    useCloud.setState({ state: { status: 'checking' } });
    const { result } = renderHook(() => useEditorialRepo(), { wrapper });
    expect(result.current.ready).toBe(false);
  });

  it('la demo, el alumno y una app sin nube siguen con la base local', async () => {
    usePreferences.setState({ role: 'physician', database: 'demo' });
    expect(renderHook(() => useEditorialKind(), { wrapper }).result.current).toBe('local');
    usePreferences.setState({ role: 'student', database: 'real' });
    expect(renderHook(() => useEditorialKind(), { wrapper }).result.current).toBe('local');
    holder.configured = false;
    usePreferences.setState({ role: 'physician', database: 'real' });
    const { result } = renderHook(() => useEditorialRepo(), { wrapper });
    expect(result.current.repo.kind).toBe('local');
    await waitFor(() => {
      expect(result.current.key.startsWith('local|')).toBe(true);
    });
  });
});
