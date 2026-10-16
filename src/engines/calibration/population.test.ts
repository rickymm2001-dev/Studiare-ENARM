// Población que publica la noche (B14, 3.7 del plan de B14). Cada dato sale solo con 30 alumnos o más
import { describe, expect, it } from 'vitest';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { answer, bankItem, exposure, optionId } from '../../../tests/calibration/builders';
import { buildPopulation } from './population';
import type {
  AnswerRow,
  BankItemRow,
  ExposureRow,
  FatigueValidation,
  FirstAttempt,
  ItemResult,
  MotiveRow,
} from './types';

const fatigue: FatigueValidation = {
  state: 'calibrating',
  students: 25,
  longSessions: 120,
  splitHalfKappa: null,
  motiveReports: 10,
  ratioLower: null,
};

function build(
  input: Partial<{
    attempts: FirstAttempt[];
    answers: AnswerRow[];
    exposures: ExposureRow[];
    motives: MotiveRow[];
    items: ItemResult[];
    bank: BankItemRow[];
    populationMinStudents: number;
  }>,
) {
  const bank = input.bank ?? [];
  return buildPopulation({
    attempts: input.attempts ?? [],
    answers: input.answers ?? [],
    exposures: input.exposures ?? [],
    motives: input.motives ?? [],
    items: input.items ?? [],
    bank: new Map(bank.map((item) => [item.versionId, item])),
    fatigue,
    thresholds: FACTORY_THRESHOLDS,
    settings: {
      thresholds: {
        ...FACTORY_MODEL_SETTINGS.thresholds,
        populationMinStudents: input.populationMinStudents ?? 30,
      },
    },
  });
}

function attempt(
  person: string,
  item: BankItemRow,
  letter: string,
  exposed: readonly string[] | null,
  seq: number,
): FirstAttempt {
  const key = item.versionId.slice(2);
  return {
    person,
    questionId: item.questionId,
    versionId: item.versionId,
    optionId: optionId(key, letter),
    correct: letter === 'A',
    daysBefore: 2,
    seq,
    exposed: exposed === null ? null : exposed.map((shown) => optionId(key, shown)),
  };
}

const itemResult = (
  item: BankItemRow,
  state: ItemResult['state'],
  difficulty: number | null,
): ItemResult => ({
  versionId: item.versionId,
  questionId: item.questionId,
  students: 50,
  difficulty,
  se: difficulty === null ? null : 0.2,
  elo: 0,
  eloResponses: 50,
  state,
  extreme: false,
  variantReady: null,
});

describe('temas que más cuestan', () => {
  const t1 = bankItem('t1', { topic: 'neonatology' });
  const t2 = bankItem('t2', { topic: 'neonatology' });
  const t3 = bankItem('t3', { topic: 'infectious_diseases' });
  const attempts: FirstAttempt[] = [];
  for (let index = 0; index < 30; index += 1) {
    attempts.push(attempt(`p${index}`, t1, index < 12 ? 'A' : 'B', null, index));
    attempts.push(attempt(`p${index}`, t2, index < 18 ? 'A' : 'C', null, 100 + index));
  }
  for (let index = 0; index < 29; index += 1)
    attempts.push(attempt(`p${index}`, t3, 'A', null, 200 + index));

  it('publica el tema con 30 alumnos, su acierto medio y la dificultad media publicada', () => {
    const { population } = build({
      attempts,
      bank: [t1, t2, t3],
      items: [
        itemResult(t1, 'provisional', 0.4),
        itemResult(t2, 'calibrated', 0.2),
        itemResult(t3, 'calibrated', 1),
      ],
    });
    // 12 + 18 aciertos de 60 respuestas, y la media de 0.4 y 0.2
    expect(population.topics['pediatrics/neonatology']).toEqual({
      students: 30,
      accuracy: 0.5,
      difficulty: 0.3,
    });
    // 29 alumnos no llegan
    expect(population.topics['pediatrics/infectious_diseases']).toBeUndefined();
  });

  it('sin dificultad publicada deja la dificultad en null', () => {
    const { population } = build({ attempts, bank: [t1, t2, t3], items: [] });
    expect(population.topics['pediatrics/neonatology']?.difficulty).toBeNull();
  });

  it('el mínimo de alumnos que manda el admin sube el piso, pero nunca lo baja de 30', () => {
    expect(
      build({ attempts, bank: [t1, t2, t3], populationMinStudents: 31 }).population.topics,
    ).toEqual({});
    expect(
      Object.keys(
        build({ attempts, bank: [t1, t2, t3], populationMinStudents: 5 }).population.topics,
      ),
    ).toEqual(['pediatrics/neonatology']);
  });
});

describe('línea base de sesgos', () => {
  const q = bankItem('b1', {}, 5);
  const attempts: FirstAttempt[] = [];
  let seq = 0;
  // 40 alumnos con 5 errores, con las opciones A a D a la vista. 3 van a B (anchoring), 1 a C y 1 a D
  for (let index = 0; index < 40; index += 1) {
    for (const letter of ['B', 'B', 'B', 'C', 'D']) {
      seq += 1;
      attempts.push(attempt(`p${index}`, q, letter, ['A', 'B', 'C', 'D'], seq));
    }
  }
  // 29 alumnos con la opción E (availability_heuristic) a la vista y un error en ella
  for (let index = 0; index < 29; index += 1) {
    seq += 1;
    attempts.push(attempt(`e${index}`, q, 'E', ['A', 'E'], seq));
  }

  it('publica la atracción por etiqueta con el método de la parte de los errores y sus alumnos', () => {
    const { population } = build({ attempts, bank: [q] });
    expect(population.bias.anchoring).toEqual({ students: 40, rate: 0.6 });
    expect(population.bias.premature_closure).toEqual({ students: 40, rate: 0.2 });
    expect(population.bias.framing_effect).toEqual({ students: 40, rate: 0.2 });
  });

  it('una etiqueta vista por menos de 30 alumnos no sale', () => {
    expect(build({ attempts, bank: [q] }).population.bias.availability_heuristic).toBeUndefined();
  });

  it('un intento sin pantalla de opciones o con aciertos no mueve la línea base', () => {
    const noise = Array.from({ length: 50 }, (_, index) => [
      attempt(`n${index}`, q, 'A', ['A', 'B', 'C', 'D'], 9000 + index),
      attempt(`m${index}`, q, 'B', null, 9500 + index),
    ]).flat();
    const { population } = build({ attempts: [...attempts, ...noise], bank: [q] });
    expect(population.bias.anchoring).toEqual({ students: 40, rate: 0.6 });
  });
});

describe('motivos de error por rama', () => {
  const motive = (person: string, branch: string | null, value: string): MotiveRow => ({
    person,
    daysBefore: 3,
    branch,
    motive: value,
    lastThird: false,
  });
  const rows: MotiveRow[] = [];
  for (let index = 0; index < 31; index += 1) {
    rows.push(motive(`p${index}`, 'pediatrics', index % 2 === 0 ? 'knowledge' : 'time'));
  }
  rows.push(motive('p0', 'pediatrics', 'forgot'), motive('p1', 'pediatrics', 'fatigue'));
  for (let index = 0; index < 29; index += 1)
    rows.push(motive(`s${index}`, 'general_surgery', 'knowledge'));

  it('reparte los siete motivos con la rama que tiene 30 alumnos que reportaron', () => {
    const { population } = build({ motives: rows });
    const shares = population.motives.pediatrics as Record<string, number>;
    // 16 knowledge de los pares más 1 de forgot, 15 time, 1 fatigue y 33 en total
    expect(shares.reports).toBe(33);
    expect(shares.knowledge).toBeCloseTo(17 / 33, 4);
    expect(shares.time).toBeCloseTo(15 / 33, 4);
    expect(shares.fatigue).toBeCloseTo(1 / 33, 4);
    expect(shares.anxiety).toBe(0);
    const total = [
      'knowledge',
      'time',
      'misinterpretation',
      'superficial_reading',
      'anxiety',
      'overconfidence',
      'fatigue',
    ]
      .map((key) => shares[key] ?? 0)
      .reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 3);
    expect(population.motives.general_surgery).toBeUndefined();
  });

  it('ignora lo que no es un motivo, una causa sin motivo y un reporte sin rama', () => {
    const junk = [
      ...rows,
      ...Array.from({ length: 40 }, (_, index) => motive(`x${index}`, 'pediatrics', 'otra cosa')),
      ...Array.from({ length: 40 }, (_, index) => motive(`y${index}`, 'pediatrics', 'other')),
      ...Array.from({ length: 40 }, (_, index) => motive(`z${index}`, null, 'knowledge')),
    ];
    expect(build({ motives: junk }).population.motives).toEqual(
      build({ motives: rows }).population.motives,
    );
  });
});

describe('indicadores de conducta', () => {
  const q = bankItem('i1');
  const answers: AnswerRow[] = [];
  const exposures: ExposureRow[] = [];
  let seq = 0;
  // 31 alumnos, una sesión de 10 respuestas. Ocho con Seguro, 4 de ellas erróneas, y dos con Dudé
  for (let index = 0; index < 31; index += 1) {
    for (let n = 0; n < 10; n += 1) {
      seq += 2;
      const sure = n < 8;
      exposures.push(exposure(`p${index}`, 'i1', seq - 1));
      answers.push(
        answer({
          person: `p${index}`,
          key: 'i1',
          seq,
          letter: n % 2 === 0 ? 'A' : 'C',
          confidence: sure ? 'sure' : 'unsure',
          session: `p${index}|s`,
          minute: n,
        }),
      );
    }
  }

  it('publica la tasa de cada indicador con los alumnos que lo tuvieron', () => {
    const { population } = build({ answers, exposures, bank: [q] });
    // De las 8 respuestas con Seguro, 4 son errores
    expect(population.indicators.overconfidence_effect).toEqual({ students: 31, rate: 0.5 });
    expect(Object.keys(population.indicators).length).toBeGreaterThan(3);
  });

  it('con menos de 30 alumnos no sale ningún indicador', () => {
    const few = answers.filter((row) => Number(row.person.slice(1)) < 29);
    expect(build({ answers: few, exposures, bank: [q] }).population.indicators).toEqual({});
  });

  it('las respuestas sin sesión o sin pantalla de opciones no entran', () => {
    const noSession = answers.map((row) => ({ ...row, session: null }));
    expect(build({ answers: noSession, exposures, bank: [q] }).population.indicators).toEqual({});
    expect(build({ answers, exposures: [], bank: [q] }).population.indicators).toEqual({});
  });
});

describe('preguntas por estado y fatiga', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((key) => bankItem(key));
  const old = bankItem('old', { current: false });

  it('cuenta las versiones publicadas por estado, con la estimada por el médico para las que no tienen fila', () => {
    const { population } = build({
      bank: [...items, old],
      items: [
        itemResult(items[0] as BankItemRow, 'calibrated', 0.1),
        itemResult(items[1] as BankItemRow, 'provisional', 0.2),
        itemResult(items[2] as BankItemRow, 'provisional', -0.2),
        itemResult(old, 'calibrated', 0.5),
      ],
    });
    expect(population.items).toEqual({ physician_estimate: 2, provisional: 2, calibrated: 1 });
  });

  it('pasa el estado del detector de fatiga con sus alumnos y sesiones', () => {
    expect(build({}).population.fatigue).toEqual({
      state: 'calibrating',
      students: 25,
      longSessions: 120,
    });
  });

  it('sin datos no publica nada de la población', () => {
    const { population, counts } = build({});
    expect(population.bias).toEqual({});
    expect(population.motives).toEqual({});
    expect(population.topics).toEqual({});
    expect(population.indicators).toEqual({});
    expect(counts).toEqual({
      populationTopics: 0,
      populationBiasTags: 0,
      populationMotiveBranches: 0,
      populationIndicators: 0,
    });
  });
});
