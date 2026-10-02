// Arma todo lo que se siembra en enarm_demo (11.2, 11.3, D-052). Función pura. El caso de uso
// src/data/usecases/seedDemo.ts lo escribe en la base. Contenido demo con sus IDs estables, baraja
// de tarjetas sintéticas mientras no existan los mazos, alumno de la demo con su bitácora, y la
// cohorte de alumnos simulados con sus parámetros verdaderos en SimTruth.
import { SimTruthSchema, type SimTruth } from '@/data/schemas/activity';
import type { ClinicalCase, Option, Question } from '@/data/schemas/bank';
import type { TopicTaxonomy } from '@/data/schemas/content';
import {
  CardSchema,
  DeckSchema,
  NoteSchema,
  type Card,
  type Deck,
  type Note,
} from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { UserSchema, UserSettingsSchema, type User } from '@/data/schemas/people';
import type { DemoBank } from '../content/bank';
import { DEMO_CONTENT_TIME } from '../stableId';
import { generateCohort, generateDemoStudent, type Cohort, type SimStudent } from './cohort';
import { syntheticIds, toEvents } from './events';
import { GENERATOR_VERSION } from './model';
import { SIM_TIME_ZONE, syntheticCards } from './simulate';

export interface DemoSeedOptions {
  seed: string;
  /** Último día de estudio del historial AAAA-MM-DD, normalmente hoy */
  endDay: string;
  /** Fecha del ENARM provisional y configurable del alumno de la demo (11.3) */
  examDate: string | null;
  cohortSize: number;
  cohortDays: number;
  demoDays: number;
  /** Momento UTC después del cual no puede haber eventos. Al sembrar desde la app es ahora */
  notAfter?: string;
}

export const DEFAULT_DEMO_SEED: Omit<DemoSeedOptions, 'endDay' | 'examDate'> = {
  seed: 'enarm-demo-1',
  cohortSize: 300,
  cohortDays: 90,
  demoDays: 60,
};

export interface DemoSeed {
  options: DemoSeedOptions;
  generatorVersion: string;
  cases: ClinicalCase[];
  questions: { question: Question; options: Option[] }[];
  deck: Deck;
  notes: Note[];
  cards: Card[];
  users: User[];
  simTruth: SimTruth[];
  /** Bitácora del alumno de la demo */
  events: AppEvent[];
  demoUserId: string;
  cohort: Cohort;
  demoStudent: SimStudent;
}

/** Lo que se escribe en la base. Sin los historiales completos, que pesan demasiado para pasarlos */
export type DemoSeedRecords = Omit<DemoSeed, 'cohort' | 'demoStudent'>;

export function toSeedRecords(seed: DemoSeed): DemoSeedRecords {
  const { cohort: _cohort, demoStudent: _demoStudent, ...records } = seed;
  return records;
}

/**
 * Fecha del ENARM provisional del alumno de la demo (11.3). El 15 de septiembre más próximo que
 * quede al menos a 90 días. Es configurable en su perfil
 */
export function provisionalExamDate(endDay: string): string {
  const year = Number(endDay.slice(0, 4));
  const candidate = `${year}-09-15`;
  const days =
    (Date.parse(`${candidate}T00:00:00Z`) - Date.parse(`${endDay}T00:00:00Z`)) / 86_400_000;
  return days >= 90 ? candidate : `${year + 1}-09-15`;
}

const createdAt = new Date(DEMO_CONTENT_TIME).toISOString();

function userOf(student: SimStudent, examDate: string | null, dailyMinutes: number | null): User {
  return UserSchema.parse({
    id: student.userId,
    alias: student.alias,
    role: 'student',
    examDate,
    dailyMinutes,
    timeZone: SIM_TIME_ZONE,
    settings: UserSettingsSchema.parse({}),
    createdAt,
  });
}

function truthOf(student: SimStudent, seedOptions?: DemoSeedOptions): SimTruth {
  return SimTruthSchema.parse({
    userId: student.userId,
    seed: student.seed.slice(0, 80),
    generatorVersion: GENERATOR_VERSION,
    params: JSON.parse(
      JSON.stringify(seedOptions ? { ...student.truth, seedOptions } : student.truth),
    ) as Record<string, unknown>,
  });
}

export function buildDemoSeed(
  bank: DemoBank,
  taxonomy: TopicTaxonomy,
  options: DemoSeedOptions,
): DemoSeed {
  const cohort = generateCohort(bank, taxonomy, {
    seed: options.seed,
    size: options.cohortSize,
    days: options.cohortDays,
    endDay: options.endDay,
    ...(options.notAfter ? { notAfter: options.notAfter } : {}),
    // Solo el alumno de la demo necesita sus repasos. Los de la cohorte no se guardan (D-052)
    simulateCards: false,
  });
  const cardSet = syntheticCards(
    taxonomy.branches.flatMap((branch) =>
      branch.topics.map((topic) => ({ branch: branch.key, topic: topic.key })),
    ),
    5,
    options.seed,
  );
  const demoStudent = generateDemoStudent(bank, {
    seed: options.seed,
    endDay: options.endDay,
    days: options.demoDays,
    examDate: options.examDate,
    difficulties: cohort.difficulties,
    cards: cardSet,
    ...(options.notAfter ? { notAfter: options.notAfter } : {}),
  });

  const topicName = new Map(
    taxonomy.branches.flatMap((branch) =>
      branch.topics.map((topic) => [topic.key, topic.name] as const),
    ),
  );
  const deckId = syntheticIds.deck(options.seed);
  const deck = DeckSchema.parse({
    id: deckId,
    name: 'Tarjetas sintéticas de la simulación',
    description:
      'Datos simulados. Tarjetas sin contenido médico que usa la simulación de repasos mientras se escriben los mazos de demostración.',
    ownerId: null,
    origin: 'preloaded',
    visibility: 'private',
    isDemo: true,
    createdAt,
  });
  const notes: Note[] = [];
  const cards: Card[] = [];
  for (const card of cardSet) {
    const noteId = syntheticIds.note(options.seed, card.key);
    notes.push(
      NoteSchema.parse({
        id: noteId,
        deckId,
        tags: ['sintetica', card.branch, card.topic],
        origin: 'preloaded',
        editorialStatus: 'draft',
        sourceQuote: null,
        sourceQuestionVersionId: null,
        isDemo: true,
        createdAt,
        kind: 'basic',
        front: `Tarjeta sintética de ${topicName.get(card.topic) ?? card.topic}`,
        back: 'Sin contenido. Sirve para simular repasos mientras se escriben los mazos de demostración.',
      }),
    );
    cards.push(
      CardSchema.parse({
        id: syntheticIds.card(options.seed, card.key),
        noteId,
        deckId,
        ordinal: 0,
        createdAt,
      }),
    );
  }

  const events = toEvents({ student: demoStudent, bank, cards: cardSet, cardSeed: options.seed });
  return {
    options,
    generatorVersion: GENERATOR_VERSION,
    cases: bank.cases,
    questions: bank.questions.map((entry) => ({
      question: entry.question,
      options: entry.options,
    })),
    deck,
    notes,
    cards,
    users: [
      userOf(demoStudent, options.examDate, 90),
      ...cohort.students.map((student) => userOf(student, null, null)),
    ],
    // Las opciones de la siembra quedan con el alumno de la demo. Con ellas, incluido el último día,
    // la misma generación determinista reproduce exactamente lo sembrado (D-052)
    simTruth: [
      truthOf(demoStudent, options),
      ...cohort.students.map((student) => truthOf(student)),
    ],
    events,
    demoUserId: demoStudent.userId,
    cohort,
    demoStudent,
  };
}
