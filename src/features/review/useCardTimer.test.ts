// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCardTimer } from './useCardTimer';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

const props = (overrides: Partial<Parameters<typeof useCardTimer>[0]> = {}) => ({
  enabled: true,
  seconds: 30,
  resetKey: 1,
  paused: false,
  ...overrides,
});

describe('temporizador de tarjeta', () => {
  it('cuenta hacia atrás y avisa al acabarse el tiempo sugerido', () => {
    const { result } = renderHook((input) => useCardTimer(input), { initialProps: props() });
    expect(result.current).toEqual({ remainingMs: 30_000, expired: false });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(Math.round(result.current.remainingMs / 1000)).toBe(20);
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(result.current).toEqual({ remainingMs: 0, expired: true });
  });

  it('apagado nunca vence y en pausa se detiene', () => {
    const off = renderHook((input) => useCardTimer(input), {
      initialProps: props({ enabled: false }),
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(off.result.current.expired).toBe(false);

    const { result, rerender } = renderHook((input) => useCardTimer(input), {
      initialProps: props(),
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    rerender(props({ paused: true }));
    const frozen = result.current.remainingMs;
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(result.current.remainingMs).toBe(frozen);
    // Al reanudar sigue desde donde se quedó y no cuenta el rato en pausa
    rerender(props({ paused: false }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(Math.round(result.current.remainingMs / 1000)).toBe(20);
  });

  it('con otra tarjeta empieza de nuevo', () => {
    const { result, rerender } = renderHook((input) => useCardTimer(input), {
      initialProps: props(),
    });
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(result.current.expired).toBe(true);
    rerender(props({ resetKey: 2 }));
    expect(result.current).toEqual({ remainingMs: 30_000, expired: false });
  });
});
