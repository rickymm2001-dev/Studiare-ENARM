import { describe, expect, it } from 'vitest';
import {
  checkIdle,
  closeActive,
  IDLE_LIMIT_MS,
  NEW_ACTIVE_TIME,
  resume,
  touch,
} from './activeTime';

describe('tiempo de estudio activo', () => {
  it('suma los tramos cortos entre interacciones', () => {
    let state = touch(NEW_ACTIVE_TIME, 0);
    state = touch(state, 30_000);
    state = touch(state, 90_000);
    expect(state.activeMs).toBe(90_000);
    expect(closeActive(state, 100_000)).toBe(100_000);
  });

  it('pausa tras el límite y no cuenta el hueco', () => {
    let state = touch(NEW_ACTIVE_TIME, 0);
    state = touch(state, 60_000);
    state = checkIdle(state, 60_000 + IDLE_LIMIT_MS + 1);
    expect(state.paused).toBe(true);
    expect(touch(state, 999_999)).toBe(state);
    expect(closeActive(state, 999_999)).toBe(60_000);
    state = resume(state, 1_000_000);
    state = touch(state, 1_020_000);
    expect(state.activeMs).toBe(80_000);
  });

  it('una interacción después de un hueco largo también pausa', () => {
    let state = touch(NEW_ACTIVE_TIME, 0);
    state = touch(state, IDLE_LIMIT_MS + 5);
    expect(state.paused).toBe(true);
    expect(state.activeMs).toBe(0);
  });
});
