import { describe, expect, it } from 'vitest';
import { createEvent } from '@/data/events/createEvent';
import type { AppEvent } from '@/data/schemas/events';
import { estimateAbility } from '@/engines/adaptive';
import { newId } from '@/data/testing/fixtures';
import { abilityFromEvents } from './adaptiveAbility';

const USER = newId();
const answer = (questionVersionId: string, correct: boolean): AppEvent =>
  createEvent(
    'question_answered',
    {
      questionVersionId,
      optionVersionId: newId(),
      correct,
      confidence: null,
      msToAnswer: 15_000,
      changeCount: 0,
      highlightEnabled: false,
    },
    { userId: USER, tz: 'America/Merida' },
  );

const measuredQuestion = (logit: number) => ({
  id: newId(),
  physicianDifficulty: 3,
  effectiveDifficulty: { logit, source: 'calibrated' as const, students: 120 },
});
const plainQuestion = () => ({ id: newId(), physicianDifficulty: 3 });

describe('habilidad del alumno desde sus respuestas', () => {
  it('sin respuestas queda en 0 y con la incertidumbre de la previa', () => {
    const estimate = abilityFromEvents([], [measuredQuestion(0)]);
    expect(estimate.theta).toBeCloseTo(0, 9);
    expect(estimate.se).toBeGreaterThan(0.99);
    expect(estimate.responses).toBe(0);
  });

  it('cuenta la primera respuesta a cada versión y deja fuera las repetidas', () => {
    const question = measuredQuestion(1);
    const events = [
      answer(question.id, true),
      answer(question.id, false),
      answer(question.id, false),
    ];
    const estimate = abilityFromEvents(events, [question]);
    expect(estimate.responses).toBe(1);
    expect(estimate).toEqual(estimateAbility([{ difficulty: 1, correct: true }]));
  });

  it('solo cuentan las preguntas con dificultad medida, no las que van con la del médico', () => {
    const measured = measuredQuestion(0.5);
    const plain = plainQuestion();
    const unknown = newId();
    const estimate = abilityFromEvents(
      [answer(measured.id, true), answer(plain.id, true), answer(unknown, true)],
      [measured, plain],
    );
    expect(estimate.responses).toBe(1);
  });

  it('ignora los eventos que no son respuestas', () => {
    const question = measuredQuestion(0);
    const other = createEvent(
      'visibility_changed',
      { hidden: true, awayMs: null },
      { userId: USER, tz: 'America/Merida' },
    );
    expect(abilityFromEvents([other, answer(question.id, true)], [question]).responses).toBe(1);
  });

  it('acertar las difíciles da más habilidad que acertar las fáciles', () => {
    const hard = Array.from({ length: 12 }, () => measuredQuestion(1.5));
    const easy = Array.from({ length: 12 }, () => measuredQuestion(-1.5));
    const wins = (list: typeof hard) => list.map((question) => answer(question.id, true));
    expect(abilityFromEvents(wins(hard), hard).theta).toBeGreaterThan(
      abilityFromEvents(wins(easy), easy).theta,
    );
  });
});
