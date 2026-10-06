import { describe, expect, it } from 'vitest';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { formatClock } from './clock';
import {
  examAnswers,
  examOutcome,
  examScoreOf,
  rankedTallies,
  type ExamBundles,
} from './examResults';
import {
  choose,
  createExamState,
  finishExamState,
  toggleEliminated,
  toggleMarked,
  type ExamState,
} from './examState';

const T0 = 1_000_000;

function build(count: number) {
  const bundles = new Map<string, ReturnType<typeof bundleOf>>();
  function bundleOf() {
    const { question, options } = makeQuestionWithOptions();
    return { question, options, vignette: '' };
  }
  for (let index = 0; index < count; index += 1) {
    const bundle = bundleOf();
    bundles.set(bundle.question.id, bundle);
  }
  const ids = [...bundles.keys()];
  const state = createExamState({
    examId: newId(),
    userId: newId(),
    seed: 's',
    questionIds: ids,
    requested: count,
    shortfall: 0,
    totalMs: 600_000,
    nowMs: T0,
    highlight: false,
    askConfidence: false,
    alerts: true,
  });
  return { state, ids, bundles: bundles as ExamBundles };
}

const optionsOf = (bundles: ExamBundles, id: string) => bundles.get(id)?.options ?? [];

describe('resultados del examen', () => {
  it('califica lo que eligió, lo dejado en blanco y lo que descartó', () => {
    const { state: start, ids, bundles } = build(3);
    const [first, second, third] = ids as [string, string, string];
    let state: ExamState = start;
    // Primera correcta, con un descarte bueno y marcada
    const right = optionsOf(bundles, first).find((option) => option.isCorrect);
    const wrongOfFirst = optionsOf(bundles, first).find((option) => !option.isCorrect);
    state = choose(state, first, right?.id ?? '', T0 + 1000).state;
    state = toggleEliminated(state, first, wrongOfFirst?.id ?? '');
    state = toggleMarked(state, first);
    // Segunda fallada, habiendo descartado la correcta
    const rightOfSecond = optionsOf(bundles, second).find((option) => option.isCorrect);
    const wrongOfSecond = optionsOf(bundles, second).find((option) => !option.isCorrect);
    state = toggleEliminated(state, second, rightOfSecond?.id ?? '');
    state = choose(state, second, wrongOfSecond?.id ?? '', T0 + 2000).state;
    // La tercera queda en blanco
    state = finishExamState(state, T0 + 60_000, 'completed');

    const score = examScoreOf(state, bundles);
    expect(score).toMatchObject({ total: 3, answered: 2, correct: 1, blank: 1, marked: 1 });
    expect(score.missedIds).toEqual([second]);
    expect(score.blankIds).toEqual([third]);
    expect(score.biasTags).toEqual([{ tag: 'anchoring', wrongChoices: 1 }]);
    expect(score.elimination).toEqual({
      questionsWithElimination: 2,
      eliminated: 2,
      eliminatedCorrect: 1,
    });
  });

  it('una opción elegida que ya no existe cuenta como en blanco', () => {
    const { state: start, ids, bundles } = build(1);
    const [only] = ids as [string];
    const state = choose(start, only, newId(), T0 + 1000).state;
    const [answer] = examAnswers(state, bundles);
    expect(answer).toMatchObject({ optionId: null, correct: false });
    expect(examOutcome(answer as NonNullable<typeof answer>)).toBe('blank');
  });

  it('omite una pregunta que no se pudo cargar sin romper el resto', () => {
    const { state, ids, bundles } = build(2);
    const partial = new Map([...bundles].filter(([id]) => id === ids[0]));
    expect(examScoreOf(state, partial).total).toBe(1);
  });

  it('clasifica el desenlace de cada pregunta', () => {
    expect(examOutcome({ optionId: null, correct: false })).toBe('blank');
    expect(examOutcome({ optionId: 'a', correct: true })).toBe('correct');
    expect(examOutcome({ optionId: 'a', correct: false })).toBe('missed');
  });

  it('ordena los cortes por los que más se fallaron y filtra los muy pequeños', () => {
    const ranked = rankedTallies(
      {
        a: { total: 4, answered: 4, correct: 1 },
        b: { total: 6, answered: 5, correct: 5 },
        c: { total: 1, answered: 1, correct: 0 },
        d: { total: 4, answered: 4, correct: 1 },
      },
      2,
    );
    expect(ranked.map((row) => row.key)).toEqual(['a', 'd', 'b']);
    expect(ranked[0]?.missed).toBe(3);
  });
});

describe('reloj del examen', () => {
  it('da m:ss con menos de una hora y h:mm:ss con más', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(5 * 3_600_000 + 59 * 60_000 + 20_000)).toBe('5:59:20');
    expect(formatClock(-5)).toBe('0:00');
  });
});
