import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import { buildTutorView, type TutorViewInput } from './tutorView';
import { answered, event, minute, option, question } from './testing/fixtures';

const NOW = new Date(minute(60 * 24));

function base(overrides: Partial<TutorViewInput> = {}): TutorViewInput {
  return {
    now: NOW,
    events: [],
    bank: { questions: new Map(), options: new Map(), cases: new Map() },
    questions: [],
    options: [],
    cards: new Map(),
    timeZone: 'America/Merida',
    today: '2026-10-02',
    desiredRetention: 0.9,
    thresholds: DEFAULT_THRESHOLDS,
    ...overrides,
  };
}

describe('vista del tutor', () => {
  it('sin actividad todo calibra y no hay nada que mostrar', () => {
    const view = buildTutorView(base());
    expect(view.confirmed).toEqual([]);
    expect(view.forming).toEqual([]);
    expect(view.recentErrors).toBe(0);
    expect(view.report).toMatchObject({ ready: false, have: 0 });
    expect(view.biasTips).toEqual([]);
    expect(view.baseTopics.get('nephrology')).toBe('endocrinology');
  });

  it('cinco fallos seguros en el mismo tema confirman una hipótesis y tres solo la forman', () => {
    const wrong = option(newId(), false, 'Mala');
    const right = option(newId(), true, 'Buena');
    const questions = Array.from({ length: 5 }, () =>
      question({ id: newId(), topic: 'cardiology' }),
    );
    const options = questions.flatMap((q) => [
      { ...right, id: newId(), questionVersionId: q.id },
      { ...wrong, id: newId(), questionVersionId: q.id },
    ]);
    const wrongOf = (q: (typeof questions)[number]) =>
      options.find((o) => o.questionVersionId === q.id && !o.isCorrect);
    const events: AppEvent[] = [
      event('session_started', { kind: 'practice', config: {} }, minute(60 * 20)),
      ...questions.map((q, index) =>
        answered(q, wrongOf(q)?.id ?? '', false, minute(60 * 20 + index * 3), {
          confidence: 'sure',
        }),
      ),
    ];
    const bank = {
      questions: new Map(questions.map((q) => [q.id, q])),
      options: new Map(options.map((o) => [o.id, o])),
      cases: new Map(),
    };
    const five = buildTutorView(base({ events, bank, questions, options }));
    expect(five.confirmed.map((h) => h.key)).toEqual(['high_confidence_error|cardiology']);
    expect(five.recentErrors).toBe(5);

    // Con solo 3 de los 5 se está formando y faltan 2
    const keep = new Set(questions.slice(0, 3).map((q) => q.id));
    const three = buildTutorView(
      base({
        events: events.filter(
          (e) => e.type !== 'question_answered' || keep.has(e.payload.questionVersionId),
        ),
        bank,
        questions,
        options,
      }),
    );
    expect(three.confirmed).toEqual([]);
    expect(three.forming[0]).toMatchObject({ recentFindings: 3, findingsNeeded: 2 });
  });
});
