import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bestUnitSubset,
  branchQuotas,
  buildExam,
  englishTargetFor,
  examTotalMs,
  scoreExam,
  sectionOf,
  EXAM_SECONDS_PER_QUESTION,
  type ExamAnswer,
  type ExamPlan,
  type ExamQuestion,
  type ExamQuestionInfo,
} from './exam';

const BRANCHES = ['internal', 'pediatrics', 'obstetrics', 'surgery'];

/** Un banco con N preguntas por rama y un caso seriado de 3 en cada rama */
function bank(perBranch: number): ExamQuestion[] {
  const questions: ExamQuestion[] = [];
  for (const branch of BRANCHES) {
    for (let index = 0; index < perBranch - 3; index += 1)
      questions.push({
        id: `${branch}-${index}`,
        caseId: null,
        caseOrder: null,
        branch,
        section: 'clinical',
      });
    for (let order = 1; order <= 3; order += 1)
      questions.push({
        id: `${branch}-caso-${order}`,
        caseId: `${branch}-caso`,
        caseOrder: order,
        branch,
        section: 'clinical',
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
      { id: 'a', caseId: null, caseOrder: null, branch: 'internal', section: 'clinical' },
      { id: 'c1', caseId: 'c', caseOrder: 1, branch: 'internal', section: 'clinical' },
      { id: 'c2', caseId: 'c', caseOrder: 2, branch: 'internal', section: 'clinical' },
      { id: 'c3', caseId: 'c', caseOrder: 3, branch: 'internal', section: 'clinical' },
    ];
    const plan = buildExam({ questions, requested: 2, seed: 'k' });
    expect(plan.questionIds).toEqual(['a']);
    expect(plan.shortfall).toBe(1);
  });

  it('sin preguntas o sin pedir nada devuelve un examen vacío', () => {
    expect(buildExam({ questions: [], requested: 20, seed: 'x' }).questionIds).toEqual([]);
    expect(buildExam({ questions: bank(10), requested: 0, seed: 'x' }).totalMs).toBe(0);
  });

  it('con pesos cada rama recibe su cuota por residuo mayor (B11, sección 6 del plan del cambio)', () => {
    const quotas = branchQuotas(
      250,
      { mi: 75, ped: 50, go: 50, cir: 33, urg: 17, sp: 13, mf: 12 },
      ['cir', 'go', 'mf', 'mi', 'ped', 'sp', 'urg'],
    );
    expect(Object.fromEntries(quotas)).toEqual({
      mi: 75,
      ped: 50,
      go: 50,
      cir: 33,
      urg: 17,
      sp: 13,
      mf: 12,
    });
    // Solo entre las ramas que hay en el banco, y el residuo mayor reparte lo que sobra
    expect(
      Object.fromEntries(branchQuotas(10, { a: 1, b: 1, c: 1, z: 5 }, ['a', 'b', 'c'])),
    ).toEqual({ a: 4, b: 3, c: 3 });
    expect(Object.fromEntries(branchQuotas(4, { a: 1 }, ['a', 'b']))).toEqual({ a: 4 });
    expect(branchQuotas(10, { a: 0 }, ['a']).size).toBe(0);
    expect(branchQuotas(0, { a: 1 }, ['a']).size).toBe(0);
  });

  it('con pesos el examen se reparte por cuotas y no parejo', () => {
    const questions = bank(40);
    const weights = { internal: 3, pediatrics: 1, obstetrics: 0, surgery: 0 };
    const plan = buildExam({ questions, requested: 40, seed: 'pesos', branchWeights: weights });
    const byBranch = (branch: string) =>
      plan.questionIds.filter((id) => id.startsWith(`${branch}-`)).length;
    expect(plan.questionIds).toHaveLength(40);
    expect(byBranch('internal')).toBe(30);
    expect(byBranch('pediatrics')).toBe(10);
    expect(byBranch('obstetrics') + byBranch('surgery')).toBe(0);
    // Sin pesos sigue parejo
    const even = buildExam({ questions, requested: 40, seed: 'pesos' });
    expect(even.questionIds.filter((id) => id.startsWith('internal-'))).toHaveLength(10);
  });

  it('si una rama no alcanza su cuota, lo que falta se completa parejo con las demás', () => {
    const questions = [
      ...bank(20).filter((question) => !question.branch.startsWith('internal')),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `internal-${index}`,
        caseId: null,
        caseOrder: null,
        branch: 'internal',
        section: 'clinical' as const,
      })),
    ];
    const plan = buildExam({
      questions,
      requested: 40,
      seed: 'corta',
      branchWeights: { internal: 10, pediatrics: 1, obstetrics: 1, surgery: 1 },
    });
    const byBranch = (branch: string) =>
      plan.questionIds.filter((id) => id.startsWith(`${branch}-`)).length;
    expect(plan.questionIds).toHaveLength(40);
    expect(byBranch('internal')).toBe(4);
    expect(byBranch('pediatrics') + byBranch('obstetrics') + byBranch('surgery')).toBe(36);
    expect(Math.max(byBranch('pediatrics'), byBranch('obstetrics'), byBranch('surgery'))).toBe(12);
  });

  it('un caso que no cabe en la cuota de su rama no se parte y lo que falta se completa parejo', () => {
    const questions = [
      ...bank(4).filter((question) => question.branch === 'internal'),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `pediatrics-${index}`,
        caseId: null,
        caseOrder: null,
        branch: 'pediatrics',
        section: 'clinical' as const,
      })),
    ];
    const plan = buildExam({
      questions,
      requested: 4,
      seed: 'cuota',
      branchWeights: { internal: 1, pediatrics: 1 },
    });
    expect(plan.questionIds).toHaveLength(4);
    expect(plan.questionIds.filter((id) => id.includes('caso'))).toEqual([]);
    expect(plan.questionIds.filter((id) => id.startsWith('internal-'))).toEqual(['internal-0']);
  });

  it('Inglés médico se queda fuera del examen y no cuenta como disponible', () => {
    const questions = [
      ...bank(10),
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `english-${index}`,
        caseId: null,
        caseOrder: null,
        branch: 'english',
        section: 'clinical' as const,
      })),
    ];
    const plan = buildExam({
      questions,
      requested: 280,
      seed: 'ingles',
      branchWeights: { internal: 1, pediatrics: 1, obstetrics: 1, surgery: 1 },
      excludeBranches: ['english'],
    });
    expect(plan.questionIds.some((id) => id.startsWith('english'))).toBe(false);
    expect(plan.available).toBe(40);
    expect(plan.shortfall).toBe(240);
  });

  it('propiedad. Nunca repite, nunca pasa de lo pedido y nunca parte un caso', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 40 }),
        fc.integer({ min: 0, max: 400 }),
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.option(fc.array(fc.integer({ min: 0, max: 80 }), { minLength: 4, maxLength: 4 })),
        (perBranch, requested, seed, weights) => {
          const questions = bank(perBranch);
          const plan = buildExam({
            questions,
            requested,
            seed,
            ...(weights
              ? {
                  branchWeights: Object.fromEntries(
                    BRANCHES.map((branch, index) => [branch, weights[index] ?? 0]),
                  ),
                }
              : {}),
          });
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

describe('contratos de B13, paso 0', () => {
  it('la parte en inglés de un examen corto sigue la proporción de 30 en 280', () => {
    expect([280, 100, 50, 20].map((size) => englishTargetFor(size))).toEqual([30, 11, 5, 2]);
    expect(englishTargetFor(0)).toBe(0);
    expect(englishTargetFor(-10)).toBe(0);
    expect(englishTargetFor(100, { clinical: 90, english: 10 })).toBe(10);
    expect(englishTargetFor(100, { clinical: 0, english: 0 })).toBe(0);
  });

  it('el plan trae su detalle por sección y, sin parte en inglés, todo es clinical', () => {
    const questions = bank(30);
    const plan = buildExam({ questions, requested: 40, seed: 'secciones' });
    expect(plan.sections).toEqual({
      clinical: { requested: 40, picked: 40, shortfall: 0, secondsPerQuestion: 77 },
      english: { requested: 0, picked: 0, shortfall: 0, secondsPerQuestion: 77 },
    });
    // Lo demás del plan es igual con o sin el detalle y la sección de cada pregunta es opcional
    const tagged = questions.map((question) => ({ ...question, section: 'clinical' as const }));
    const again = buildExam({ questions: tagged, requested: 40, seed: 'secciones' });
    expect(again).toEqual(plan);
    const short = buildExam({
      questions: bank(4),
      requested: 40,
      seed: 'x',
      secondsPerQuestion: 60,
    });
    expect(short.sections.clinical).toMatchObject({
      requested: 40,
      picked: short.questionIds.length,
      shortfall: short.shortfall,
      secondsPerQuestion: 60,
    });
    expect(short.totalMs).toBe(short.questionIds.length * 60 * 1000);
  });
});

/** Casos de lectura en inglés. Cada número es cuántas preguntas trae un caso, y 1 es una pregunta suelta */
function englishBank(sizes: readonly number[]): ExamQuestion[] {
  return sizes.flatMap((size, caseIndex) =>
    Array.from({ length: size }, (_, order) => ({
      id: `en-${caseIndex}-${order + 1}`,
      caseId: size === 1 ? null : `en-caso-${caseIndex}`,
      caseOrder: size === 1 ? null : order + 1,
      branch: 'medical_english',
      section: 'english' as const,
    })),
  );
}

const english = (placement: 'mixed' | 'end' = 'mixed') => ({
  include: true,
  secondsPerQuestion: 90,
  placement,
});
const englishIdsOf = (plan: ExamPlan) => plan.questionIds.filter((id) => id.startsWith('en-'));
/** Doce casos que suman 30 reactivos, como la meta de B13 */
const TWELVE_CASES = [2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3];

describe('la parte en inglés del examen (B13)', () => {
  it('el examen de 280 trae 250 en español y 30 en inglés, con el tiempo de cada sección', () => {
    const questions = [...bank(80), ...englishBank(TWELVE_CASES)];
    const plan = buildExam({ questions, requested: 280, seed: 'completo', english: english() });
    expect(plan.questionIds).toHaveLength(280);
    expect(englishIdsOf(plan)).toHaveLength(30);
    expect(new Set(plan.questionIds).size).toBe(280);
    expect(plan.sections).toEqual({
      clinical: { requested: 250, picked: 250, shortfall: 0, secondsPerQuestion: 77 },
      english: { requested: 30, picked: 30, shortfall: 0, secondsPerQuestion: 90 },
    });
    expect(plan.shortfall).toBe(0);
    expect(plan.available).toBe(320 + 30);
    // 250 por 77 s y 30 por 90 s son 6 horas 5 minutos y 50 segundos, que la tarjeta redondea a 6 h 06 min
    expect(plan.totalMs).toBe(250 * 77_000 + 30 * 90_000);
    expect(plan.totalMs).toBe(6 * 3_600_000 + 5 * 60_000 + 50_000);
  });

  it('los exámenes cortos llevan la misma proporción, con casos completos', () => {
    const questions = [
      ...bank(80),
      ...englishBank(Array.from({ length: 20 }, (_, i) => 2 + (i % 2))),
    ];
    for (const [size, expected] of [
      [100, 11],
      [50, 5],
      [20, 2],
    ] as const) {
      const plan = buildExam({
        questions,
        requested: size,
        seed: `corto-${size}`,
        english: english(),
      });
      expect(englishIdsOf(plan), `tamaño ${size}`).toHaveLength(expected);
      expect(plan.questionIds).toHaveLength(size);
      expect(plan.sections.english.picked).toBe(expected);
      expect(plan.sections.clinical.picked).toBe(size - expected);
    }
  });

  it('toma la combinación de casos que más se acerca sin pasarse y lo que sobra pasa al español', () => {
    // Solo hay casos de 3. El objetivo de 5 se queda en 3 y los 2 que faltan los pone el español
    const questions = [...bank(40), ...englishBank([3, 3, 3, 3])];
    const plan = buildExam({ questions, requested: 50, seed: 'granos', english: english() });
    expect(englishIdsOf(plan)).toHaveLength(3);
    expect(plan.questionIds).toHaveLength(50);
    expect(plan.sections.english).toMatchObject({ requested: 3, picked: 3, shortfall: 0 });
    expect(plan.sections.clinical).toMatchObject({ requested: 47, picked: 47, shortfall: 0 });
    expect(plan.shortfall).toBe(0);
    // En el plan, requested ya no es el objetivo. Lo que pide la proporción sale de englishTargetFor, y con
    // eso la tarjeta del examen dice que entran 3 de los 5 aunque no haya faltante (hallazgo 9 de la revisión)
    expect(englishTargetFor(plan.requested)).toBe(5);
    expect(englishTargetFor(plan.requested)).toBeGreaterThan(plan.sections.english.picked);
  });

  it('sin inglés suficiente toma lo que hay, avisa cuántos faltaron y el español no lo rellena', () => {
    const questions = [...bank(80), ...englishBank([3, 3])];
    const plan = buildExam({ questions, requested: 280, seed: 'faltan', english: english() });
    expect(englishIdsOf(plan)).toHaveLength(6);
    expect(plan.sections.english).toEqual({
      requested: 30,
      picked: 6,
      shortfall: 24,
      secondsPerQuestion: 90,
    });
    // Los 250 en español siguen siendo 250
    expect(plan.sections.clinical).toMatchObject({ requested: 250, picked: 250, shortfall: 0 });
    expect(plan.questionIds).toHaveLength(256);
    expect(plan.shortfall).toBe(24);
    expect(plan.totalMs).toBe(250 * 77_000 + 6 * 90_000);
  });

  it('sin ningún caso en inglés todo el faltante es de la sección y el examen sigue en español', () => {
    const plan = buildExam({
      questions: bank(80),
      requested: 100,
      seed: 'nada',
      english: english(),
    });
    expect(plan.sections.english).toMatchObject({ requested: 11, picked: 0, shortfall: 11 });
    expect(plan.sections.clinical).toMatchObject({ requested: 89, picked: 89 });
    expect(plan.questionIds).toHaveLength(89);
    expect(plan.shortfall).toBe(11);
  });

  it('sin incluir la parte en inglés es solo en español y esas preguntas no cuentan como elegibles', () => {
    const questions = [...bank(40), ...englishBank(TWELVE_CASES)];
    const off = buildExam({
      questions,
      requested: 100,
      seed: 'solo-es',
      english: { include: false, secondsPerQuestion: 90, placement: 'mixed' },
    });
    const missing = buildExam({ questions, requested: 100, seed: 'solo-es' });
    for (const plan of [off, missing]) {
      expect(englishIdsOf(plan)).toEqual([]);
      expect(plan.questionIds).toHaveLength(100);
      expect(plan.available).toBe(160);
      expect(plan.sections.english).toMatchObject({ requested: 0, picked: 0, shortfall: 0 });
      expect(plan.sections.clinical).toMatchObject({ requested: 100, picked: 100 });
      expect(plan.totalMs).toBe(100 * 77_000);
    }
    // El ritmo del inglés queda anotado aunque no entre
    expect(off.sections.english.secondsPerQuestion).toBe(90);
  });

  it('mezclado reparte los casos de inglés entre el español y al final los junta en un bloque', () => {
    const questions = [...bank(80), ...englishBank(TWELVE_CASES)];
    const mixed = buildExam({ questions, requested: 280, seed: 'mezcla', english: english() });
    const lastClinical = mixed.questionIds.findLastIndex((id) => !id.startsWith('en-'));
    expect(mixed.questionIds.findIndex((id) => id.startsWith('en-'))).toBeLessThan(lastClinical);
    expect(englishIdsOf(mixed)).toHaveLength(30);

    const end = buildExam({ questions, requested: 280, seed: 'mezcla', english: english('end') });
    expect(end.questionIds.slice(250).every((id) => id.startsWith('en-'))).toBe(true);
    expect(end.questionIds.slice(0, 250).some((id) => id.startsWith('en-'))).toBe(false);
    // Es el mismo examen con otro acomodo
    expect(new Set(end.questionIds)).toEqual(new Set(mixed.questionIds));
    expect(end.totalMs).toBe(mixed.totalMs);
  });

  it('reproduce con la misma semilla y cambia con otra', () => {
    const questions = [...bank(40), ...englishBank(TWELVE_CASES)];
    const input = { questions, requested: 100, english: english() };
    const first = buildExam({ ...input, seed: 'a' });
    expect(buildExam({ ...input, seed: 'a' })).toEqual(first);
    expect(buildExam({ ...input, seed: 'b' }).questionIds).not.toEqual(first.questionIds);
  });

  it('un tamaño muy chico no pide inglés si no cabe un caso', () => {
    // 10 preguntas piden 1 de inglés y los casos son de 2 o 3, así que todo es español
    const questions = [...bank(20), ...englishBank([2, 3])];
    const plan = buildExam({ questions, requested: 10, seed: 'chico', english: english() });
    expect(englishIdsOf(plan)).toEqual([]);
    expect(plan.questionIds).toHaveLength(10);
    expect(plan.sections.english).toMatchObject({ picked: 0, shortfall: 0 });
  });

  it('propiedad. Los casos de inglés entran completos y en orden, sin pasarse del objetivo ni repetir', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 0, maxLength: 24 }),
        fc.integer({ min: 4, max: 30 }),
        fc.integer({ min: 0, max: 320 }),
        fc.constantFrom('mixed' as const, 'end' as const),
        fc.string({ minLength: 1, maxLength: 6 }),
        (sizes, perBranch, requested, placement, seed) => {
          const questions = [...bank(perBranch), ...englishBank(sizes)];
          const plan = buildExam({ questions, requested, seed, english: english(placement) });
          expect(new Set(plan.questionIds).size).toBe(plan.questionIds.length);
          const target = englishTargetFor(requested);
          const picked = englishIdsOf(plan);
          expect(picked.length).toBeLessThanOrEqual(target);
          // Si hay inglés de sobra no falta nada, y si no, no se rellena con español
          const available = sizes.reduce((sum, size) => sum + size, 0);
          expect(plan.sections.english.shortfall).toBe(
            available >= target ? 0 : target - picked.length,
          );
          expect(plan.sections.english.picked).toBe(picked.length);
          expect(plan.sections.clinical.picked + plan.sections.english.picked).toBe(
            plan.questionIds.length,
          );
          // Ningún caso de inglés queda partido y cada uno va en orden
          sizes.forEach((size, caseIndex) => {
            if (size === 1) return;
            const mine = [1, 2, 3, 4]
              .slice(0, size)
              .map((order) => plan.questionIds.indexOf(`en-${caseIndex}-${order}`));
            const inside = mine.filter((position) => position >= 0);
            expect([0, size]).toContain(inside.length);
            if (inside.length === size) {
              expect(mine).toEqual(mine.map((_, i) => (mine[0] as number) + i));
            }
          });
          if (placement === 'end' && picked.length > 0) {
            const first = plan.questionIds.findIndex((id) => id.startsWith('en-'));
            expect(plan.questionIds.slice(first).every((id) => id.startsWith('en-'))).toBe(true);
          }
          // El tiempo total es el de cada sección por su ritmo
          expect(plan.totalMs).toBe(
            plan.sections.clinical.picked * 77_000 + plan.sections.english.picked * 90_000,
          );
        },
      ),
    );
  });
});

describe('suma de casos que más se acerca sin pasarse', () => {
  it('toma la combinación exacta y la más temprana entre las que suman lo mismo', () => {
    expect(bestUnitSubset([3, 3, 2, 2], 5)).toEqual([0, 2]);
    expect(bestUnitSubset([3, 3, 3], 5)).toEqual([0]);
    expect(bestUnitSubset([2, 2, 2, 3, 3], 10)).toEqual([0, 1, 3, 4]);
    expect(bestUnitSubset([4], 3)).toEqual([]);
    expect(bestUnitSubset([], 3)).toEqual([]);
    expect(bestUnitSubset([2, 3], 0)).toEqual([]);
    expect(bestUnitSubset([2, 3], -4)).toEqual([]);
    // Si todo cabe, todo entra
    expect(bestUnitSubset([2, 3, 1], 30)).toEqual([0, 1, 2]);
  });

  it('propiedad. Suma lo máximo posible sin pasarse y es la combinación más temprana', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 0, maxLength: 9 }),
        fc.integer({ min: 0, max: 20 }),
        (sizes, target) => {
          const chosen = bestUnitSubset(sizes, target);
          const sum = chosen.reduce((acc, index) => acc + (sizes[index] as number), 0);
          expect(sum).toBeLessThanOrEqual(target);
          expect(chosen).toEqual([...chosen].sort((a, b) => a - b));
          // Fuerza bruta. Todos los subconjuntos con su suma. Gana la suma mayor y, si empatan, el que
          // tiene el primer índice distinto más chico
          let best = -1;
          let earliest: number[] = [];
          const before = (candidate: number[], other: number[]) => {
            const at = candidate.findIndex((value, i) => value !== other[i]);
            if (at < 0) return candidate.length < other.length;
            return other[at] === undefined || (candidate[at] as number) < other[at];
          };
          for (let mask = 0; mask < 1 << sizes.length; mask += 1) {
            const indexes = sizes.flatMap((_, index) => (mask & (1 << index) ? [index] : []));
            const total = indexes.reduce((acc, index) => acc + (sizes[index] as number), 0);
            if (total > target) continue;
            if (total > best || (total === best && before(indexes, earliest))) {
              best = total;
              earliest = indexes;
            }
          }
          expect(sum).toBe(best);
          expect(chosen).toEqual(earliest);
        },
      ),
    );
  });
});

describe('sección de una pregunta', () => {
  it('el inglés es la sección english y todo lo demás, incluido lo de antes de B13, la clinical', () => {
    expect(sectionOf({ language: 'en' })).toBe('english');
    expect(sectionOf({ language: 'es' })).toBe('clinical');
    expect(sectionOf({})).toBe('clinical');
  });
});

describe('calificación por sección (B13)', () => {
  it('corta aciertos, en blanco y tiempo medio de español y de inglés', () => {
    const rows: ExamQuestionInfo[] = [
      { ...(infos[0] as ExamQuestionInfo), id: 's1' },
      { ...(infos[1] as ExamQuestionInfo), id: 's2' },
      {
        ...(infos[2] as ExamQuestionInfo),
        id: 'e1',
        branch: 'medical_english',
        section: 'english',
      },
      {
        ...(infos[3] as ExamQuestionInfo),
        id: 'e2',
        branch: 'medical_english',
        section: 'english',
      },
      {
        ...(infos[3] as ExamQuestionInfo),
        id: 'e3',
        branch: 'medical_english',
        section: 'english',
      },
    ];
    const score = scoreExam({
      questions: rows,
      answers: [
        answer({ questionId: 's1', correct: true, msSpent: 50_000 }),
        answer({ questionId: 's2', msSpent: 70_000 }),
        answer({ questionId: 'e1', correct: true, msSpent: 100_000 }),
        answer({ questionId: 'e2', correct: true, msSpent: 140_000 }),
        // e3 queda en blanco, aunque pasó 30 s ahí
        answer({ questionId: 'e3', optionId: null, msSpent: 30_000 }),
      ],
    });
    expect(score.bySection.clinical).toEqual({
      total: 2,
      answered: 2,
      correct: 1,
      blank: 0,
      timeUsedMs: 120_000,
      averageMsPerAnswered: 60_000,
    });
    expect(score.bySection.english).toEqual({
      total: 3,
      answered: 2,
      correct: 2,
      blank: 1,
      timeUsedMs: 270_000,
      averageMsPerAnswered: 120_000,
    });
    // El corte por rama sigue mostrando Inglés médico aparte de las demás
    expect(score.byBranch.medical_english).toEqual({ total: 3, answered: 2, correct: 2 });
    // Las secciones suman el examen
    expect(score.bySection.clinical.total + score.bySection.english.total).toBe(score.total);
  });

  it('una sección sin reactivos queda en ceros y sin promedio', () => {
    const score = scoreExam({ questions: infos, answers: [] });
    expect(score.bySection.english).toEqual({
      total: 0,
      answered: 0,
      correct: 0,
      blank: 0,
      timeUsedMs: 0,
      averageMsPerAnswered: null,
    });
    expect(score.bySection.clinical).toMatchObject({
      total: 4,
      blank: 4,
      averageMsPerAnswered: null,
    });
  });
});
