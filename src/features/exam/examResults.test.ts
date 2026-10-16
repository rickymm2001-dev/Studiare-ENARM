import { describe, expect, it } from 'vitest';
import { makeEnglishCase } from '@/data/testing/english';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { formatClock } from './clock';
import {
  examAnswers,
  examInfos,
  examOutcome,
  examScoreOf,
  rankedTallies,
  sectionRows,
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

describe('resultados por sección (B13, 3.6)', () => {
  /** Un examen con dos preguntas en español y un caso de dos preguntas en inglés */
  function mixed() {
    const spanish = [makeQuestionWithOptions(), makeQuestionWithOptions()];
    const english = makeEnglishCase(2);
    const bundles = new Map(
      [...spanish, ...english.bundles].map(({ question, options }) => [
        question.id,
        { question, options, vignette: '' },
      ]),
    ) as ExamBundles;
    const ids = [...bundles.keys()];
    const state = createExamState({
      examId: newId(),
      userId: newId(),
      seed: 's',
      questionIds: ids,
      requested: 4,
      shortfall: 0,
      totalMs: 600_000,
      nowMs: T0,
      highlight: false,
      askConfidence: false,
      alerts: true,
    });
    return { state, ids, bundles };
  }

  it('la sección de cada pregunta sale del idioma que quedó en el banco local', () => {
    const { state, ids, bundles } = mixed();
    const infos = examInfos(state, bundles);
    expect(infos.map((info) => info.section)).toEqual([
      'clinical',
      'clinical',
      'english',
      'english',
    ]);
    expect(infos.filter((info) => info.section === 'english').map((info) => info.branch)).toEqual([
      'medical_english',
      'medical_english',
    ]);
    expect(ids).toHaveLength(4);
  });

  it('corta Español e Inglés con aciertos, en blanco y tiempo medio, y el inglés queda en su rama', () => {
    const { state: start, ids, bundles } = mixed();
    const [s1, s2, e1, e2] = ids as [string, string, string, string];
    const right = (id: string) =>
      optionsOf(bundles, id).find((option) => option.isCorrect)?.id ?? '';
    let state: ExamState = start;
    state = choose(state, s1, right(s1), T0 + 1000).state;
    state = choose(state, e1, right(e1), T0 + 2000).state;
    // El español acierta una y deja la otra en blanco. El inglés acierta una y deja la otra en blanco
    state = finishExamState(state, T0 + 60_000, 'completed');
    const score = examScoreOf(state, bundles);
    expect(score.bySection.clinical).toMatchObject({ total: 2, answered: 1, correct: 1, blank: 1 });
    expect(score.bySection.english).toMatchObject({ total: 2, answered: 1, correct: 1, blank: 1 });
    expect(score.byBranch.medical_english).toEqual({ total: 2, answered: 1, correct: 1 });
    expect(score.missedIds).toEqual([]);
    expect(score.blankIds).toEqual([s2, e2]);
    const rows = sectionRows(score);
    expect(rows.map((row) => row.section)).toEqual(['clinical', 'english']);
    expect(rows[1]).toMatchObject({ total: 2, correct: 1, blank: 1 });
  });

  it('un examen solo en español trae una fila y uno sin respuestas no inventa un promedio', () => {
    const { state, bundles } = build(2);
    const finished = finishExamState(state, T0 + 1000, 'completed');
    const rows = sectionRows(examScoreOf(finished, bundles));
    expect(rows).toEqual([
      { section: 'clinical', total: 2, answered: 0, correct: 0, blank: 2, averageSeconds: null },
    ]);
  });
});
