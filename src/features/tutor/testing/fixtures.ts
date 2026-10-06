// Eventos y banco armados a mano para las pruebas del tutor. Solo los usan las pruebas.
import type { Option, Question } from '@/data/schemas/bank';
import type { FsrsCardState } from '@/data/schemas/common';
import { createEvent } from '@/data/events/createEvent';
import type { AppEvent, EventPayload, EventType } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';

export const USER = newId();
export const SESSION = newId();
export const T0 = Date.UTC(2026, 9, 1, 15, 0, 0);
export const minute = (value: number) => T0 + value * 60_000;

export function event<T extends EventType>(
  type: T,
  payload: EventPayload<T>,
  at: number,
  sessionId: string | null = SESSION,
): AppEvent {
  return createEvent(type, payload, {
    userId: USER,
    tz: 'America/Merida',
    sessionId,
    clock: { now: () => new Date(at) },
  });
}

export function question(overrides: Partial<Question> & { id: string }): Question {
  return {
    questionId: newId(),
    caseId: null,
    caseOrder: null,
    vignette: 'Paciente con disnea',
    prompt: '¿Cuál es el tratamiento?',
    branch: 'internal_medicine',
    topic: 'cardiology',
    subtopic: 'heart_failure',
    structure: { polarity: 'affirmative', task: 'diagnosis', format: 'direct', source: 'auto' },
    physicianDifficulty: 3,
    ...overrides,
  } as unknown as Question;
}

export const option = (id: string, isCorrect: boolean, text: string): Option =>
  ({ id, isCorrect, text, biasTag: isCorrect ? null : 'anchoring' }) as unknown as Option;

export function state(overrides: Partial<FsrsCardState> = {}): FsrsCardState {
  return {
    due: new Date(minute(0)).toISOString(),
    stability: 5,
    difficulty: 6,
    scheduledDays: 10,
    learningSteps: 0,
    reps: 4,
    lapses: 1,
    state: 'review',
    lastReview: new Date(minute(0) - 30 * 86_400_000).toISOString(),
    ...overrides,
  };
}

export const answered = (
  q: Question,
  optionId: string,
  correct: boolean,
  at: number,
  overrides: Partial<EventPayload<'question_answered'>> = {},
  sessionId: string | null = SESSION,
) =>
  event(
    'question_answered',
    {
      questionVersionId: q.id,
      optionVersionId: optionId,
      correct,
      confidence: 'unsure',
      msToAnswer: 40_000,
      changeCount: 0,
      highlightEnabled: false,
      ...overrides,
    },
    at,
    sessionId,
  );
