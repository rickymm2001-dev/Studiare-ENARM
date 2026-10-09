import { describe, expect, it } from 'vitest';
import type { BiasLabel, Option, Question } from '@/data/schemas/bank';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { buildAgreementView, sampleQuestionIds } from './agreementView';

function bank(count: number) {
  const questions: Question[] = [];
  const optionsByQuestion = new Map<string, Option[]>();
  for (let index = 0; index < count; index += 1) {
    const { question, options } = makeQuestionWithOptions();
    questions.push(question);
    optionsByQuestion.set(question.id, options);
  }
  return { questions, optionsByQuestion };
}

const label = (optionId: string, physicianId: string, biasTag: string): BiasLabel => ({
  id: newId(),
  optionId,
  physicianId,
  biasTag,
  labeledAt: '2026-10-08T10:00:00.000Z',
});

describe('muestra de doble etiquetado', () => {
  it('toma el 20 % de las preguntas y siempre las mismas', () => {
    const { questions } = bank(50);
    const sample = sampleQuestionIds(questions);
    expect(sample).toHaveLength(10);
    expect(sampleQuestionIds(questions)).toEqual(sample);
    expect(sampleQuestionIds([...questions].reverse())).toEqual(sample);
  });

  it('una pregunta de una sola opción no entra, porque no tiene distractores', () => {
    const { questions } = bank(5);
    const single = { ...(questions[0] as Question), canonicalOptionIds: [newId()] };
    expect(sampleQuestionIds([single], 1)).toEqual([]);
  });
});

describe('vista del acuerdo', () => {
  const { questions, optionsByQuestion } = bank(20);
  const sample = new Set(sampleQuestionIds(questions));
  const inSample = questions.filter((question) => sample.has(question.questionId));

  it('al médico le tocan los distractores de la muestra y avanza al etiquetar', () => {
    const physicianId = newId();
    const first = inSample[0] as Question;
    const distractors = (optionsByQuestion.get(first.id) ?? []).filter((o) => !o.isCorrect);
    const labels = distractors
      .slice(0, 2)
      .map((option) => label(option.optionId, physicianId, 'anchoring'));
    const view = buildAgreementView({
      questions,
      optionsByQuestion,
      labels,
      physicianId,
      allowed: null,
    });
    expect(view.sampleSize).toBe(4);
    expect(view.sampleOptions).toBe(4 * 3);
    expect(view.mine).toEqual({ done: 2, total: 12 });
    expect(view.pending).toHaveLength(4);
    expect(view.pending.find((item) => item.question.id === first.id)?.done).toBe(2);
  });

  it('una pregunta con todos sus distractores etiquetados sale de la cola', () => {
    const physicianId = newId();
    const first = inSample[0] as Question;
    const labels = (optionsByQuestion.get(first.id) ?? [])
      .filter((option) => !option.isCorrect)
      .map((option) => label(option.optionId, physicianId, 'anchoring'));
    const view = buildAgreementView({
      questions,
      optionsByQuestion,
      labels,
      physicianId,
      allowed: null,
    });
    expect(view.pending.map((item) => item.question.id)).not.toContain(first.id);
    expect(view.mine.done).toBe(3);
  });

  it('solo cuenta las preguntas que le asignaron al médico', () => {
    const view = buildAgreementView({
      questions,
      optionsByQuestion,
      labels: [],
      physicianId: newId(),
      allowed: new Set([(inSample[0] as Question).questionId]),
    });
    expect(view.pending).toHaveLength(1);
    expect(view.mine).toEqual({ done: 0, total: 3 });
    // La muestra completa sigue siendo la misma
    expect(view.sampleSize).toBe(4);
  });

  it('admin y dueño ven el tablero y no tienen cola', () => {
    const view = buildAgreementView({
      questions,
      optionsByQuestion,
      labels: [],
      physicianId: null,
      allowed: null,
    });
    expect(view.pending).toEqual([]);
    expect(view.mine).toEqual({ done: 0, total: 0 });
    expect(view.sampleOptions).toBe(12);
  });

  it('el acuerdo sale de las etiquetas de todos los médicos', () => {
    const a = newId();
    const b = newId();
    const options = inSample.flatMap((question) =>
      (optionsByQuestion.get(question.id) ?? []).filter((option) => !option.isCorrect),
    );
    const labels = options.flatMap((option) => [
      label(option.optionId, a, 'anchoring'),
      label(option.optionId, b, 'anchoring'),
    ]);
    const view = buildAgreementView({
      questions,
      optionsByQuestion,
      labels,
      physicianId: null,
      allowed: null,
    });
    expect(view.report.pairs).toBe(12);
    // Todos etiquetaron igual, así kappa no está definido, y 12 pares tampoco bastan
    expect(view.report.calibrating).toBe(true);
    expect(view.report.vocabulary).toBe('trap');
  });
});
