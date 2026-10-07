// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/DataProvider';
import { useDataApi } from '@/data/context';
import { newId } from '@/data/testing/fixtures';
import { useVisibilityLog, visibilityPayload } from './useVisibilityLog';

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <DataProvider kind="real">{children}</DataProvider>
);

describe('visibilidad de la pestaña', () => {
  it('al salir no trae duración y al volver trae el tiempo fuera', () => {
    expect(visibilityPayload(true, null, 5000)).toEqual({ hidden: true, awayMs: null });
    expect(visibilityPayload(false, 2000, 5400)).toEqual({ hidden: false, awayMs: 3400 });
    // Volver sin haber visto la salida, como al recargar, no inventa una duración
    expect(visibilityPayload(false, null, 5000)).toEqual({ hidden: false, awayMs: null });
    expect(visibilityPayload(false, 9000, 5000).awayMs).toBe(0);
  });

  it('registra la salida y el regreso dentro de la sesión', async () => {
    const userId = newId();
    const sessionId = newId();
    const { result } = renderHook(
      () => {
        useVisibilityLog({ userId, timeZone: 'America/Merida', sessionId });
        return useDataApi();
      },
      { wrapper },
    );
    setVisibility('hidden');
    setVisibility('visible');
    await waitFor(async () => {
      const events = await result.current.repos.events.query({ userId });
      expect(events.map((event) => event.type)).toEqual([
        'visibility_changed',
        'visibility_changed',
      ]);
    });
    const events = await result.current.repos.events.query({ userId });
    expect(events.every((event) => event.sessionId === sessionId)).toBe(true);
    const [out, back] = events;
    expect(out?.payload).toEqual({ hidden: true, awayMs: null });
    expect(back?.payload).toMatchObject({ hidden: false });
  });

  it('sin sesión no registra nada', async () => {
    const userId = newId();
    const { result } = renderHook(
      () => {
        useVisibilityLog({ userId, timeZone: 'America/Merida', sessionId: null });
        return useDataApi();
      },
      { wrapper },
    );
    setVisibility('hidden');
    setVisibility('visible');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await result.current.repos.events.query({ userId })).toEqual([]);
  });
});
