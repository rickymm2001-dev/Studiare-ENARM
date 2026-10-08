// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutlineNode } from '@/engines/outline';
import { AUTOSAVE_DELAY_MS, useOutlineAutosave } from './useOutlineAutosave';

const payload = (text: string, title = 'Apunte') => ({
  title,
  nodes: [{ id: 'a', text, children: [] }] as OutlineNode[],
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useOutlineAutosave', () => {
  it('junta los cambios y guarda una sola vez con lo más reciente al detenerse', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useOutlineAutosave(save));
    act(() => {
      result.current.schedule(payload('uno'));
      result.current.schedule(payload('dos'));
      result.current.schedule(payload('tres'));
    });
    expect(result.current.status).toBe('unsaved');
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(payload('tres'));
    expect(result.current.status).toBe('saved');
  });

  it('no guarda dos veces a la vez y lo escrito durante un guardado se guarda después', async () => {
    let release: (() => void) | undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useOutlineAutosave(save));
    act(() => {
      result.current.schedule(payload('uno'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(result.current.status).toBe('saving');
    // Se escribe más y se vence otra vez el plazo mientras el primer guardado sigue abierto
    act(() => {
      result.current.schedule(payload('dos'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(payload('dos'));
    expect(result.current.status).toBe('saved');
  });

  it('si falla lo avisa, conserva el texto y lo reintenta con el siguiente cambio', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('sin espacio'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useOutlineAutosave(save));
    act(() => {
      result.current.schedule(payload('uno'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(result.current.status).toBe('error');
    act(() => {
      result.current.schedule(payload('uno y dos'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(save).toHaveBeenLastCalledWith(payload('uno y dos'));
    expect(result.current.status).toBe('saved');
  });

  it('al salir de la pantalla guarda lo que faltaba sin esperar el plazo', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useOutlineAutosave(save));
    act(() => {
      result.current.schedule(payload('pendiente'));
    });
    unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(payload('pendiente'));
  });

  it('al pasar a segundo plano guarda de inmediato', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useOutlineAutosave(save));
    act(() => {
      result.current.schedule(payload('rápido'));
    });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('guarda por qué falló el último guardado y lo limpia cuando uno sale bien', async () => {
    const failure = new RangeError('pasa de un tope');
    const save = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const { result } = renderHook(() => useOutlineAutosave(save));
    act(() => {
      result.current.schedule(payload('uno'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(failure);
    act(() => {
      result.current.schedule(payload('dos'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(result.current.status).toBe('saved');
    expect(result.current.error).toBeNull();
  });
});
