import { describe, expect, it } from 'vitest';
import { ItemStatsCacheSchema } from '@/data/schemas/caches';
import { topicTaxonomy } from '@/demo/content';
import { buildDemoBank } from '@/demo/content/bank';
import { createRng } from '@/engines/random';
import type { SimStudent } from './cohort';
import { buildItemStats } from './itemStats';
import { buildDemoSeed } from './seed';
import type { SimResponse } from './simulate';

const bank = buildDemoBank();
const AT = '2026-10-01T00:00:00.000Z';

/** Una respuesta simulada con lo mínimo que lee buildItemStats */
function response(
  student: number,
  index: number,
  item: (typeof bank.questions)[number],
  correct: boolean,
): SimResponse {
  const right = item.options.find((option) => option.isCorrect);
  const wrong = item.options.find((option) => !option.isCorrect);
  const chosen = (correct ? right : wrong) ?? item.options[0];
  if (!chosen) throw new Error('La pregunta de la demo no trae opciones');
  const shown = item.options.slice(0, 4);
  if (!shown.some((option) => option.id === chosen.id)) shown.push(chosen);
  const day = String(1 + (student % 20)).padStart(2, '0');
  const minute = String(index).padStart(2, '0');
  return {
    session: `s${String(student)}`,
    order: index,
    itemKey: item.key,
    versionId: item.question.id,
    branch: item.question.branch,
    topic: item.question.topic,
    polarity: item.question.structure.polarity,
    shownAt: `2026-09-${day}T10:${minute}:00.000Z`,
    at: `2026-09-${day}T10:${minute}:30.000Z`,
    minuteInSession: index,
    shown: shown.map((option, position) => ({
      optionId: option.id,
      position,
      biasTag: option.biasTag,
      isCorrect: option.isCorrect,
    })),
    correctPosition: 0,
    chosenOptionId: chosen.id,
    chosenPosition: shown.findIndex((option) => option.id === chosen.id),
    chosenTag: chosen.biasTag,
    correct,
    previousOptionIds: [],
    msToAnswer: 30_000,
    confidence: 'sure',
    words: 100,
    samplingSeed: 'prueba',
    truth: { misread: false, probability: 0.5 },
  };
}

interface Plan {
  /** Cuántos de los alumnos contestan esta pregunta. Los primeros n */
  answeredBy: number;
  /** Dificultad verdadera con la que se simulan los aciertos */
  difficulty: number;
  /** Todos aciertan, como una pregunta que no mide nada */
  allCorrect?: boolean;
}

/** Una cohorte simulada a mano, con los aciertos que da un modelo de Rasch y una semilla fija */
function cohort(
  students: number,
  plans: readonly Plan[],
): Pick<SimStudent, 'userId' | 'history'>[] {
  const rng = createRng('item-stats-prueba');
  return Array.from({ length: students }, (_, student) => {
    const ability = rng.normal(0, 1);
    const responses = plans.flatMap((plan, planIndex) => {
      const item = bank.questions[planIndex];
      if (!item || student >= plan.answeredBy) return [];
      const probability = 1 / (1 + Math.exp(-(ability - plan.difficulty)));
      const correct = plan.allCorrect === true || rng.next() < probability;
      return [response(student, planIndex, item, correct)];
    });
    return {
      userId: `alumno-${String(student)}`,
      history: { sessions: [], responses, reviews: [], activeDays: [] },
    };
  });
}

// Ocho preguntas que contestan todos, una con 40 alumnos, una con 20 y una que todos aciertan
const PLANS: Plan[] = [
  ...[-1, -0.6, -0.2, 0, 0.2, 0.6, 1, 1.4].map((difficulty) => ({ answeredBy: 120, difficulty })),
  { answeredBy: 40, difficulty: 0.3 },
  { answeredBy: 20, difficulty: -0.3 },
  { answeredBy: 40, difficulty: -2, allCorrect: true },
];

describe('estadísticas de las preguntas de la demostración (B14, 4.4)', () => {
  const rows = buildItemStats({ students: cohort(120, PLANS), bank, at: AT });
  const byQuestion = new Map(rows.map((row) => [row.questionVersionId, row]));
  const row = (index: number) => {
    const found = byQuestion.get(bank.questions[index]?.question.id ?? '');
    if (!found) throw new Error(`La pregunta ${String(index)} no trae fila`);
    return found;
  };

  it('deja una fila por pregunta contestada y ninguna por las que nadie contestó', () => {
    expect(rows).toHaveLength(PLANS.length);
    expect(byQuestion.has(bank.questions[PLANS.length]?.question.id ?? '')).toBe(false);
    for (const item of rows) expect(ItemStatsCacheSchema.parse(item)).toEqual(item);
    expect(rows.every((item) => item.updatedAt === AT)).toBe(true);
  });

  it('con 100 alumnos o más y poco error queda calibrada, con 30 provisional y con menos, la del médico', () => {
    // Las ocho de todos los alumnos
    for (let index = 0; index < 8; index += 1) {
      expect(row(index).calibration).toBe('calibrated');
      expect(row(index).responses).toBe(120);
      expect(row(index).raschDifficulty).not.toBeNull();
    }
    expect(row(8).calibration).toBe('provisional');
    expect(row(8).responses).toBe(40);
    expect(row(8).raschDifficulty).not.toBeNull();
    expect(row(9).calibration).toBe('physician_estimate');
    expect(row(9).responses).toBe(20);
  });

  it('una pregunta que todos aciertan no tiene estimación y queda con la del médico', () => {
    expect(row(10)).toMatchObject({
      calibration: 'physician_estimate',
      raschDifficulty: null,
      responses: 40,
      correct: 40,
    });
  });

  it('la dificultad de Rasch sigue a la verdadera con que se simularon las respuestas', () => {
    const truth = PLANS.slice(0, 8).map((plan) => plan.difficulty);
    const estimated = truth.map((_, index) => row(index).raschDifficulty ?? Number.NaN);
    const average = (values: readonly number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    const mt = average(truth);
    const me = average(estimated);
    const covariance = truth.reduce(
      (sum, value, i) => sum + (value - mt) * ((estimated[i] ?? 0) - me),
      0,
    );
    const spread = (values: readonly number[], mean: number) =>
      Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0));
    const correlation = covariance / (spread(truth, mt) * spread(estimated, me));
    expect(correlation).toBeGreaterThan(0.9);
    // Y las cuatro más fáciles salen más fáciles que las cuatro más difíciles por un buen margen
    expect(average(estimated.slice(4)) - average(estimated.slice(0, 4))).toBeGreaterThan(0.8);
  });

  it('cuenta aciertos y las elecciones y exposiciones de cada opción de los primeros intentos', () => {
    const item = row(0);
    const options = Object.values(item.optionStats);
    expect(item.correct).toBeGreaterThan(0);
    expect(item.correct).toBeLessThan(item.responses);
    // Cada primer intento elige una opción que vio, y cada opción se vio a lo más una vez por intento
    expect(options.reduce((sum, option) => sum + option.choices, 0)).toBe(item.responses);
    expect(Math.max(...options.map((option) => option.exposures))).toBeLessThanOrEqual(
      item.responses,
    );
    expect(options.every((option) => option.choices <= option.exposures)).toBe(true);
  });

  it('solo cuenta el primer intento de cada alumno en cada pregunta', () => {
    const [student] = cohort(1, [{ answeredBy: 1, difficulty: 0 }]);
    const first = student?.history.responses[0];
    const item = bank.questions[0];
    if (!student || !first || !item) throw new Error('Sin datos de prueba');
    const again = { ...first, at: '2026-09-30T10:00:00.000Z', correct: !first.correct };
    const once = buildItemStats({ students: [student], bank, at: AT });
    const twice = buildItemStats({
      students: [{ ...student, history: { ...student.history, responses: [first, again] } }],
      bank,
      at: AT,
    });
    expect(twice).toEqual(once);
    expect(once[0]).toMatchObject({ responses: 1 });
  });

  it('con la misma cohorte sale siempre lo mismo', () => {
    expect(buildItemStats({ students: cohort(120, PLANS), bank, at: AT })).toEqual(rows);
  });

  it('sin alumnos simulados no hay estadísticas', () => {
    expect(buildItemStats({ students: [], bank, at: AT })).toEqual([]);
  });
});

describe('la siembra de la demostración trae las estadísticas (B14, 4.4)', () => {
  const seed = buildDemoSeed(bank, topicTaxonomy, {
    seed: 'prueba-estadisticas',
    endDay: '2026-10-01',
    examDate: null,
    cohortSize: 4,
    cohortDays: 20,
    demoDays: 12,
  });

  it('cada fila es de una pregunta del banco y cumple su esquema', () => {
    const versions = new Set(seed.questions.map((entry) => entry.question.id));
    expect(seed.itemStats.length).toBeGreaterThan(0);
    for (const item of seed.itemStats) {
      expect(versions.has(item.questionVersionId)).toBe(true);
      expect(ItemStatsCacheSchema.parse(item)).toEqual(item);
    }
  });

  it('con una cohorte chica ninguna pasa de la estimada por el médico', () => {
    // Cuatro alumnos no llegan a los 30 de una provisional
    expect(seed.itemStats.every((item) => item.calibration === 'physician_estimate')).toBe(true);
    expect(seed.itemStats.every((item) => item.responses <= 4)).toBe(true);
  });
});
