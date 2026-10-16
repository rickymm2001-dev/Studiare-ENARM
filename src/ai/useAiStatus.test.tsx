// @vitest-environment jsdom
// El estado de la IA para la interfaz (B12, 3.5). Se consulta una vez, no se consulta sin conexión y,
// en la base de demostración con el proxy alojado, no se consulta nada: la demo usa sus respuestas fijas
// con la etiqueta de IA simulada y no llama a la función, así no gasta presupuesto ni choca con la
// compuerta. Con el proxy local de desarrollo la demo sí lo usa, porque ahí no hay presupuesto que cuidar.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiStatus } from './client';

const holder = vi.hoisted(() => ({ hosted: false, fetchAiStatus: vi.fn() }));
vi.mock('./client', () => ({ fetchAiStatus: holder.fetchAiStatus }));
vi.mock('./endpoint', () => ({ aiIsHosted: () => holder.hosted }));

import { useAiStatus } from './useAiStatus';

const REAL: AiStatus = { kind: 'real', engines: { bias_tips: 'open' } };

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(() => {
  holder.hosted = false;
  holder.fetchAiStatus.mockReset();
  holder.fetchAiStatus.mockResolvedValue(REAL);
  setOnline(true);
});
afterEach(() => {
  cleanup();
  setOnline(true);
});

describe('useAiStatus', () => {
  it('empieza revisando y luego dice lo que contestó el proxy', async () => {
    const { result } = renderHook(() => useAiStatus());
    expect(result.current).toEqual({ kind: 'checking' });
    await waitFor(() => {
      expect(result.current).toEqual(REAL);
    });
    expect(holder.fetchAiStatus).toHaveBeenCalledTimes(1);
  });

  it('en la demo con el proxy alojado no consulta nada y usa las respuestas fijas', async () => {
    holder.hosted = true;
    const { result } = renderHook(() => useAiStatus({ demo: true }));
    expect(result.current).toEqual({ kind: 'no-proxy' });
    // Ni al montar ni después
    await act(() => Promise.resolve());
    expect(holder.fetchAiStatus).not.toHaveBeenCalled();
    expect(result.current).toEqual({ kind: 'no-proxy' });
  });

  it('con una cuenta real y el proxy alojado sí lo consulta', async () => {
    holder.hosted = true;
    const { result } = renderHook(() => useAiStatus({ demo: false }));
    await waitFor(() => {
      expect(result.current).toEqual(REAL);
    });
    expect(holder.fetchAiStatus).toHaveBeenCalledTimes(1);
  });

  it('en la demo con el proxy local de desarrollo sí lo consulta', async () => {
    holder.hosted = false;
    const { result } = renderHook(() => useAiStatus({ demo: true }));
    await waitFor(() => {
      expect(result.current).toEqual(REAL);
    });
    expect(holder.fetchAiStatus).toHaveBeenCalledTimes(1);
  });

  it('con otra clave de refresco pregunta de nuevo y mientras llega no usa la respuesta vieja', async () => {
    const closed: AiStatus = { kind: 'real', engines: { bias_tips: 'gated' } };
    holder.fetchAiStatus.mockResolvedValueOnce(closed).mockResolvedValueOnce(REAL);
    const { result, rerender } = renderHook(({ refreshKey }) => useAiStatus({ refreshKey }), {
      initialProps: { refreshKey: 'cerrado' },
    });
    await waitFor(() => {
      expect(result.current).toEqual(closed);
    });
    rerender({ refreshKey: 'abierto' });
    // La respuesta de antes ya no vale para la clave nueva
    expect(result.current).toEqual({ kind: 'checking' });
    await waitFor(() => {
      expect(result.current).toEqual(REAL);
    });
    expect(holder.fetchAiStatus).toHaveBeenCalledTimes(2);
  });

  it('sin conexión no consulta y dice offline, y al volver la red pregunta de nuevo', async () => {
    setOnline(false);
    const { result } = renderHook(() => useAiStatus());
    expect(result.current).toEqual({ kind: 'offline' });
    expect(holder.fetchAiStatus).not.toHaveBeenCalled();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(result.current).toEqual(REAL);
    });
    expect(holder.fetchAiStatus).toHaveBeenCalledTimes(1);
  });
});
