// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import { usePractice } from './practice';
import { startPracticeWithQuestions } from './practiceStart';

const user = { id: '01JA0000000000000000000001', timeZone: 'America/Merida' };

describe('startPracticeWithQuestions', () => {
  beforeEach(() => {
    usePractice.getState().set({
      sessionId: null,
      userId: null,
      questionIds: [],
      index: 0,
      answers: [],
      ended: false,
    });
  });

  it('deja el inicio de sesión en la bitácora y arma la práctica con esas preguntas, en ese orden', async () => {
    const recorded: AppEvent[] = [];
    const recordEvent = vi.fn((event: AppEvent) => {
      recorded.push(event);
      return Promise.resolve(event);
    });
    const started = await startPracticeWithQuestions(
      { recordEvent },
      user,
      ['q3', 'q1', 'q2'],
      'exam_missed',
    );
    expect(started).toBe(true);
    expect(recorded).toHaveLength(1);
    const [event] = recorded;
    expect(event?.type).toBe('session_started');
    expect(event?.payload).toMatchObject({
      kind: 'practice',
      config: { count: 3, sampling: 'exam_missed' },
    });
    const state = usePractice.getState();
    expect(state.questionIds).toEqual(['q3', 'q1', 'q2']);
    expect(state.userId).toBe(user.id);
    expect(state.sessionId).toBe(event?.sessionId);
    expect(state.index).toBe(0);
    expect(state.answers).toEqual([]);
    expect(state.kind).toBe('practice');
    expect(state.ended).toBe(false);
  });

  it('con una lista vacía no hace nada', async () => {
    const recordEvent = vi.fn((event: AppEvent) => Promise.resolve(event));
    expect(await startPracticeWithQuestions({ recordEvent }, user, [], 'exam_missed')).toBe(false);
    expect(recordEvent).not.toHaveBeenCalled();
    expect(usePractice.getState().sessionId).toBeNull();
  });

  it('no arma la práctica si la bitácora falla', async () => {
    const recordEvent = vi.fn((_event: AppEvent) => Promise.reject(new Error('sin espacio')));
    await expect(
      startPracticeWithQuestions({ recordEvent }, user, ['q1'], 'exam_missed'),
    ).rejects.toThrow('sin espacio');
    expect(usePractice.getState().sessionId).toBeNull();
  });
});
