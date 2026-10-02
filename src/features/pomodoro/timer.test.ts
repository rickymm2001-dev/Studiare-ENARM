import { describe, expect, it } from 'vitest';
import { elapsedMinutes, formatClock, IDLE, nextPhase, remainingMs } from './timer';

const config = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLong: 4,
};

describe('Pomodoro (9.2)', () => {
  it('alterna enfoque y descanso con descanso largo cada 4 ciclos', () => {
    expect(nextPhase({ phase: 'focus', cycle: 1 }, config)).toEqual({
      phase: 'short_break',
      cycle: 1,
    });
    expect(nextPhase({ phase: 'short_break', cycle: 1 }, config)).toEqual({
      phase: 'focus',
      cycle: 2,
    });
    expect(nextPhase({ phase: 'focus', cycle: 4 }, config)).toEqual({
      phase: 'long_break',
      cycle: 4,
    });
    expect(nextPhase({ phase: 'long_break', cycle: 4 }, config)).toEqual({
      phase: 'focus',
      cycle: 1,
    });
  });

  it('cuenta con marcas de tiempo y no se desfasa', () => {
    const running = { ...IDLE, status: 'running' as const, endsAt: 1_000_000, startedAt: 0 };
    expect(remainingMs(running, 400_000)).toBe(600_000);
    expect(remainingMs(running, 2_000_000)).toBe(0);
    expect(elapsedMinutes(running, 600_000)).toBe(10);
    const paused = {
      ...IDLE,
      status: 'paused' as const,
      remainingMs: 90_000,
      elapsedBeforePauseMs: 120_000,
    };
    expect(remainingMs(paused, 5_000_000)).toBe(90_000);
    expect(elapsedMinutes(paused, 5_000_000)).toBe(2);
  });

  it('da formato de reloj', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00');
    expect(formatClock(61_000)).toBe('01:01');
    expect(formatClock(500)).toBe('00:01');
  });
});
