// Cohorte de alumnos simulados y alumno de la demo (11.2, 11.3). Todo sale de una semilla: con la
// misma semilla y el mismo banco, los parámetros verdaderos y los historiales son idénticos.
import { DEMO_STUDENT_ALIAS } from '../constants';
import type { TopicTaxonomy } from '@/data/schemas/content';
import { physicianToLogit } from '@/engines/difficulty';
import { createRng } from '@/engines/random';
import type { DemoBank } from '../content/bank';
import { bankTaxonomy } from './bankTaxonomy';
import { DEMO_CONTENT_TIME, stableUlid } from '../stableId';
import {
  DEFAULT_MIX,
  GENERATOR_VERSION,
  sampleTruth,
  type CohortMix,
  type SimItem,
  type StudentTruth,
} from './model';
import { simulateStudent, syntheticCards, type SimCard, type SimHistory } from './simulate';

export interface SimStudent {
  userId: string;
  alias: string;
  seed: string;
  truth: StudentTruth;
  history: SimHistory;
}

export interface Cohort {
  seed: string;
  generatorVersion: string;
  /** Dificultad verdadera de cada pregunta por clave, en logits */
  difficulties: Record<string, number>;
  cards: SimCard[];
  students: SimStudent[];
}

export interface CohortOptions {
  seed: string;
  size: number;
  days: number;
  /** Último día de estudio AAAA-MM-DD. El historial termina ahí */
  endDay: string;
  mix?: CohortMix;
  /** Simular tarjetas con FSRS. Es lo más costoso, por eso se puede apagar en pruebas */
  simulateCards?: boolean;
  /** Tarjetas sintéticas por tema mientras no existan los mazos (D-050) */
  cardsPerTopic?: number;
  /** Tarjetas a simular, por ejemplo las de los mazos de Paco. Sin ellas se usan sintéticas */
  cards?: readonly SimCard[];
  /** Nada después de este momento UTC (ver SimulateOptions) */
  notAfter?: string;
}

/** Preguntas del banco tal como las usa el generador */
export function simItemsFrom(bank: DemoBank): SimItem[] {
  return bank.questions.map((entry) => ({
    key: entry.key,
    versionId: entry.question.id,
    branch: entry.question.branch,
    topic: entry.question.topic,
    polarity: entry.question.structure.polarity,
    physicianDifficulty: entry.question.physicianDifficulty,
    stemWords: entry.stemWords,
    options: entry.options.map((option) => ({
      id: option.id,
      isCorrect: option.isCorrect,
      biasTag: option.biasTag,
      words: entry.optionWords[option.id] ?? 1,
    })),
    canonicalOptionIds: entry.question.canonicalOptionIds,
  }));
}

/** Dificultad verdadera. La del médico en logits más ruido, porque el médico no es exacto */
export function trueDifficulties(items: readonly SimItem[], seed: string): Record<string, number> {
  const rng = createRng(`difficulty|${seed}`);
  const result: Record<string, number> = {};
  for (const item of items)
    result[item.key] = physicianToLogit(item.physicianDifficulty) + rng.normal(0, 0.6);
  return result;
}

const shiftDay = (day: string, amount: number) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + amount)).toISOString().slice(0, 10);
};

/** ID seudónimo estable de un alumno simulado */
export const simUserId = (seed: string, index: number) =>
  stableUlid(`sim-user|${seed}|${index}`, DEMO_CONTENT_TIME);

export function generateCohort(
  bank: DemoBank,
  fullTaxonomy: TopicTaxonomy,
  options: CohortOptions,
): Cohort {
  const taxonomy = bankTaxonomy(fullTaxonomy, bank);
  const items = simItemsFrom(bank);
  const difficulties = trueDifficulties(items, options.seed);
  const branches = taxonomy.branches.map((branch) => branch.key);
  const topics = taxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => ({ branch: branch.key, topic: topic.key })),
  );
  const cards =
    options.simulateCards === false
      ? []
      : options.cards
        ? [...options.cards]
        : syntheticCards(topics, options.cardsPerTopic ?? 5, options.seed);
  const startDay = shiftDay(options.endDay, -(options.days - 1));
  const rng = createRng(`cohort|${options.seed}`);
  const students: SimStudent[] = [];
  for (let index = 0; index < options.size; index += 1) {
    const truth = sampleTruth(rng, branches, options.mix ?? DEFAULT_MIX);
    const seed = `${options.seed}|${index}`;
    students.push({
      userId: simUserId(options.seed, index),
      alias: `Alumno simulado ${index + 1}`,
      seed,
      truth,
      history: simulateStudent(seed, truth, {
        startDay,
        days: options.days,
        items,
        difficulties,
        questionSessionChance: 0.3,
        cards,
        newCardsPerDay: 10,
        examDate: null,
        ...(options.notAfter ? { notAfter: options.notAfter } : {}),
      }),
    });
  }
  return { seed: options.seed, generatorVersion: GENERATOR_VERSION, difficulties, cards, students };
}

export interface DemoStudentOptions {
  seed: string;
  /** Último día de estudio AAAA-MM-DD, normalmente hoy */
  endDay: string;
  days?: number;
  examDate: string | null;
  difficulties: Record<string, number>;
  cards: readonly SimCard[];
  notAfter?: string;
}

/**
 * Parámetros del alumno de la demo, con patrones sembrados a propósito para que cada análisis
 * tenga algo que mostrar (11.3). Anclaje, mala lectura de negaciones, fatiga después de 40
 * minutos y Pediatría débil
 */
export const DEMO_STUDENT_TRUTH: StudentTruth = {
  ability: 0.5,
  branchOffset: {
    internal_medicine: 0.2,
    pediatrics: -1.1,
    obstetrics_gynecology: 0.1,
    general_surgery: 0,
  },
  topicOffset: {},
  biasPropensity: { anchoring: 1.8 },
  biasModel: 'weighted',
  negationMisread: 0.4,
  readingWps: 3.4,
  fatigue: { onsetMinutes: 40, logitPerMinute: 0.07 },
  consistency: 0.88,
  overconfidence: 0.5,
  sessionMinutes: { mean: 55, sd: 12 },
  preferredHour: 19,
};

export function generateDemoStudent(bank: DemoBank, options: DemoStudentOptions): SimStudent {
  const days = options.days ?? 60;
  const seed = `${options.seed}|demo-student`;
  const truth = DEMO_STUDENT_TRUTH;
  return {
    userId: stableUlid(`demo-student|${options.seed}`, DEMO_CONTENT_TIME),
    alias: DEMO_STUDENT_ALIAS,
    seed,
    truth,
    history: simulateStudent(seed, truth, {
      startDay: shiftDay(options.endDay, -(days - 1)),
      days,
      items: simItemsFrom(bank),
      difficulties: options.difficulties,
      questionSessionChance: 0.85,
      cards: options.cards,
      newCardsPerDay: 10,
      examDate: options.examDate,
      ...(options.notAfter ? { notAfter: options.notAfter } : {}),
    }),
  };
}
