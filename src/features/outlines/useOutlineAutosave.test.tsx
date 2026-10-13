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

  it('flush dice si quedó guardado o por qué no, y lo que falló sigue pendiente', async () => {
    const failure = new Error('otra ventana');
    const save = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useOutlineAutosave(save));
    // Sin nada pendiente cuenta como guardado y no escribe
    await act(async () => {
      expect(await result.current.flush()).toEqual({ saved: true });
    });
    expect(save).not.toHaveBeenCalled();
    act(() => {
      result.current.schedule(payload('uno'));
    });
    await act(async () => {
      expect(await result.current.flush()).toEqual({ saved: false, error: failure });
    });
    // El siguiente flush lo vuelve a intentar con lo mismo
    await act(async () => {
      expect(await result.current.flush()).toEqual({ saved: false, error: failure });
    });
    expect(save).toHaveBeenLastCalledWith(payload('uno'));
    await act(async () => {
      expect(await result.current.flush()).toEqual({ saved: true });
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('saved');
  });

  it('flushThen corre después de guardar lo pendiente y ningún guardado se cruza con él', async () => {
    const order: string[] = [];
    const save = vi.fn((next: { title: string }) => {
      order.push(`guardar ${next.title}`);
      return Promise.resolve();
    });
    const { result } = renderHook(() => useOutlineAutosave(save));
    act(() => {
      result.current.schedule(payload('uno', 'antes'));
    });
    let release: (() => void) | undefined;
    let outcome: Promise<string> | undefined;
    act(() => {
      outcome = result.current.flushThen(async (flushed) => {
        order.push(`mazo con ${String(flushed.saved)}`);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        order.push('mazo listo');
        return 'hecho';
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Mientras el mazo escribe se vence el plazo de otro cambio, que espera su turno
    act(() => {
      result.current.schedule(payload('dos', 'después'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    expect(order).toEqual(['guardar antes', 'mazo con true']);
    await act(async () => {
      release?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(await outcome).toBe('hecho');
    expect(order).toEqual(['guardar antes', 'mazo con true', 'mazo listo', 'guardar después']);
  });

  it('flushThen pasa la falla del guardado y si su trabajo falla la fila sigue', async () => {
    const failure = new Error('otra ventana');
    const save = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const { result } = renderHook(() => useOutlineAutosave(save));
    act(() => {
      result.current.schedule(payload('uno'));
    });
    const seen = vi.fn();
    await act(async () => {
      await expect(
        result.current.flushThen((flushed) => {
          seen(flushed);
          return Promise.reject(new Error('no se pudo'));
        }),
      ).rejects.toThrow('no se pudo');
    });
    expect(seen).toHaveBeenCalledWith({ saved: false, error: failure });
    // Lo pendiente se guarda con el siguiente flush
    await act(async () => {
      expect(await result.current.flush()).toEqual({ saved: true });
    });
    expect(save).toHaveBeenCalledTimes(2);
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
