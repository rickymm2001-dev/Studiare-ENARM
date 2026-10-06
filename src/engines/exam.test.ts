import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildExam,
  examTotalMs,
  scoreExam,
  EXAM_SECONDS_PER_QUESTION,
  type ExamAnswer,
  type ExamQuestion,
  type ExamQuestionInfo,
} from './exam';

const BRANCHES = ['internal', 'pediatrics', 'obstetrics', 'surgery'];

/** Un banco con N preguntas por rama y un caso seriado de 3 en cada rama */
function bank(perBranch: number): ExamQuestion[] {
  const questions: ExamQuestion[] = [];
  for (const branch of BRANCHES) {
    for (let index = 0; index < perBranch - 3; index += 1)
      questions.push({ id: `${branch}-${index}`, caseId: null, caseOrder: null, branch });
    for (let order = 1; order <= 3; order += 1)
      questions.push({
        id: `${branch}-caso-${order}`,
        caseId: `${branch}-caso`,
        caseOrder: order,
        branch,
      });
  }
  return questions;
}

describe('armado del examen', () => {
  it('toma el número pedido sin repetir y reproduce con la misma semilla', () => {
    const questions = bank(30);
    const first = buildExam({ questions, requested: 40, seed: 'a' });
    const again = buildExam({ questions, requested: 40, seed: 'a' });
    const other = buildExam({ questions, requested: 40, seed: 'b' });
    expect(first.questionIds).toHaveLength(40);
    expect(new Set(first.questionIds).size).toBe(40);
    expect(again).toEqual(first);
    expect(other.questionIds).not.toEqual(first.questionIds);
    expect(first.shortfall).toBe(0);
    expect(first.available).toBe(120);
    expect(first.totalMs).toBe(40 * EXAM_SECONDS_PER_QUESTION * 1000);
  });

  it('reparte parejo entre las ramas', () => {
    const questions = bank(30);
    const plan = buildExam({ questions, requested: 40, seed: 'x' });
    const branchOf = new Map(questions.map((question) => [question.id, question.branch]));
    const counts = new Map<string, number>();
    for (const id of plan.questionIds)
      counts.set(branchOf.get(id) ?? '', (counts.get(branchOf.get(id) ?? '') ?? 0) + 1);
    // Los casos seriados son de 3 preguntas, así que el reparto puede diferir hasta en 2
    expect([...counts.values()].every((count) => count >= 8 && count <= 12)).toBe(true);
    expect(counts.size).toBe(4);
  });

  it('mantiene juntos y en orden los casos seriados', () => {
    const questions = bank(12);
    const plan = buildExam({ questions, requested: 30, seed: 'caso' });
    const byId = new Map(questions.map((question) => [question.id, question]));
    for (const branch of BRANCHES) {
      const positions = ['1', '2', '3'].map((order) =>
        plan.questionIds.indexOf(`${branch}-caso-${order}`),
      );
      // Si el caso entró, entró completo y consecutivo
      if (positions.some((position) => position >= 0)) {
        expect(positions[1]).toBe((positions[0] ?? -9) + 1);
        expect(positions[2]).toBe((positions[0] ?? -9) + 2);
      }
    }
    expect(plan.questionIds.every((id) => byId.has(id))).toBe(true);
  });

  it('con menos preguntas que las pedidas toma todas y avisa cuántas faltaron', () => {
    const questions = bank(10);
    const plan = buildExam({ questions, requested: 280, seed: 's' });
    expect(plan.questionIds).toHaveLength(40);
    expect(new Set(plan.questionIds).size).toBe(40);
    expect(plan.requested).toBe(280);
    expect(plan.shortfall).toBe(240);
    expect(plan.totalMs).toBe(examTotalMs(40));
  });

  it('un caso que no cabe en lo que falta no se parte', () => {
    // 1 pregunta suelta y un caso de 3. Con 2 pedidas entra la suelta y el caso se queda fuera
    const questions: ExamQuestion[] = [
      { id: 'a', caseId: null, caseOrder: null, branch: 'internal' },
      { id: 'c1', caseId: 'c', caseOrder: 1, branch: 'internal' },
      { id: 'c2', caseId: 'c', caseOrder: 2, branch: 'internal' },
      { id: 'c3', caseId: 'c', caseOrder: 3, branch: 'internal' },
    ];
    const plan = buildExam({ questions, requested: 2, seed: 'k' });
    expect(plan.questionIds).toEqual(['a']);
    expect(plan.shortfall).toBe(1);
  });

  it('sin preguntas o sin pedir nada devuelve un examen vacío', () => {
    expect(buildExam({ questions: [], requested: 20, seed: 'x' }).questionIds).toEqual([]);
    expect(buildExam({ questions: bank(10), requested: 0, seed: 'x' }).totalMs).toBe(0);
  });

  it('propiedad. Nunca repite, nunca pasa de lo pedido y nunca parte un caso', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 40 }),
        fc.integer({ min: 0, max: 400 }),
        fc.string({ minLength: 1, maxLength: 8 }),
        (perBranch, requested, seed) => {
          const questions = bank(perBranch);
          const plan = buildExam({ questions, requested, seed });
          expect(new Set(plan.questionIds).size).toBe(plan.questionIds.length);
          expect(plan.questionIds.length).toBeLessThanOrEqual(Math.max(requested, 0));
          expect(plan.questionIds.length + plan.shortfall).toBeGreaterThanOrEqual(0);
          for (const branch of BRANCHES) {
            const inExam = ['1', '2', '3'].filter((order) =>
              plan.questionIds.includes(`${branch}-caso-${order}`),
            );
            expect([0, 3]).toContain(inExam.length);
          }
        },
      ),
    );
  });
});

const infos: ExamQuestionInfo[] = [
  {
    id: 'q1',
    branch: 'internal',
    topic: 'cardio',
    polarity: 'affirmative',
    task: 'diagnosis',
    kinds: [],
  },
  {
    id: 'q2',
    branch: 'internal',
    topic: 'cardio',
    polarity: 'negative',
    task: 'next_step',
    kinds: ['control'],
  },
  {
    id: 'q3',
    branch: 'pediatrics',
    topic: 'neo',
    polarity: 'affirmative',
    task: 'diagnosis',
    kinds: ['incoherent', 'patient_perspective'],
  },
  {
    id: 'q4',
    branch: 'pediatrics',
    topic: 'neo',
    polarity: 'negative',
    task: 'diagnosis',
    kinds: [],
  },
];

const answer = (overrides: Partial<ExamAnswer> & { questionId: string }): ExamAnswer => ({
  optionId: 'o',
  correct: false,
  chosenBiasTag: null,
  msSpent: 60_000,
  marked: false,
  eliminatedCount: 0,
  eliminatedCorrect: false,
  ...overrides,
});

describe('calificación del examen', () => {
  const score = scoreExam({
    questions: infos,
    answers: [
      answer({ questionId: 'q1', correct: true, eliminatedCount: 2 }),
      answer({
        questionId: 'q2',
        chosenBiasTag: 'anchoring',
        marked: true,
        eliminatedCount: 1,
        eliminatedCorrect: true,
      }),
      answer({ questionId: 'q3', chosenBiasTag: 'anchoring', msSpent: 120_000 }),
      // q4 queda en blanco y sin registro
    ],
  });

  it('cuenta contestadas, aciertos y en blanco', () => {
    expect(score).toMatchObject({ total: 4, answered: 3, correct: 1, blank: 1, accuracy: 0.25 });
    expect(score.missedIds).toEqual(['q2', 'q3']);
    expect(score.blankIds).toEqual(['q4']);
  });

  it('corta por rama, tema, polaridad y tarea', () => {
    expect(score.byBranch.internal).toEqual({ total: 2, answered: 2, correct: 1 });
    expect(score.byBranch.pediatrics).toEqual({ total: 2, answered: 1, correct: 0 });
    expect(score.byTopic.neo).toEqual({ total: 2, answered: 1, correct: 0 });
    expect(score.byPolarity.negative).toEqual({ total: 2, answered: 1, correct: 0 });
    expect(score.byTask.diagnosis).toEqual({ total: 3, answered: 2, correct: 1 });
  });

  it('ordena las trampas de las que cayó al fallar', () => {
    expect(score.biasTags).toEqual([{ tag: 'anchoring', wrongChoices: 2 }]);
  });

  it('reporta aparte los reactivos de control, incoherentes y de otros tipos', () => {
    expect(score.specialKinds.control).toEqual({ total: 1, answered: 1, correct: 0 });
    expect(score.specialKinds.incoherent).toEqual({ total: 1, answered: 1, correct: 0 });
    expect(score.specialKinds.patient_perspective).toEqual({ total: 1, answered: 1, correct: 0 });
    expect(score.specialKinds.inverse_resolution).toBeUndefined();
  });

  it('mide cómo descartó opciones y el tiempo', () => {
    expect(score.elimination).toEqual({
      questionsWithElimination: 2,
      eliminated: 3,
      eliminatedCorrect: 1,
    });
    expect(score.marked).toBe(1);
    expect(score.timeUsedMs).toBe(240_000);
    expect(score.averageMsPerAnswered).toBe(80_000);
  });

  it('un examen vacío no divide entre cero', () => {
    const empty = scoreExam({ questions: [], answers: [] });
    expect(empty.accuracy).toBeNull();
    expect(empty.averageMsPerAnswered).toBeNull();
  });
});
