// Arma todo lo que se siembra en enarm_demo (11.2, 11.3, D-052). Función pura. El caso de uso
// src/data/usecases/seedDemo.ts lo escribe en la base. Contenido demo con sus IDs estables, los
// mazos precargados de Paco (D-053), alumno de la demo con su bitácora, y la cohorte de alumnos
// simulados con sus parámetros verdaderos en SimTruth. Sin mazos, por ejemplo en pruebas, usa una
// baraja de tarjetas sintéticas marcada como tal (D-050).
import { SimTruthSchema, type SimTruth } from '@/data/schemas/activity';
import type { ClinicalCase, Option, Question } from '@/data/schemas/bank';
import type { DemoDeckFile, TopicTaxonomy } from '@/data/schemas/content';
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
import { buildDeckEntities } from '../content/deckEntities';
import { DEMO_CONTENT_TIME } from '../stableId';
import { generateCohort, generateDemoStudent, type Cohort, type SimStudent } from './cohort';
import { syntheticIds, toEvents } from './events';
import { GENERATOR_VERSION } from './model';
import { createRng } from '@/engines/random';
import { SIM_TIME_ZONE, syntheticCards, type SimCard } from './simulate';

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
  /**
   * Guardar también los repasos de tarjetas de los alumnos simulados (11.2). Apagado por defecto
   * porque pesa mucho en el navegador. La estructura queda lista para encenderlo (D-052)
   */
  cohortCardHistory?: boolean;
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
  decks: Deck[];
  notes: Note[];
  cards: Card[];
  users: User[];
  simTruth: SimTruth[];
  /** Bitácora del alumno de la demo, y de la cohorte si se pidió su historial de tarjetas */
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

interface CardContent {
  simCards: SimCard[];
  decks: Deck[];
  notes: Note[];
  cards: Card[];
  refs: Map<string, { cardId: string; deckId: string }>;
}

/** Tarjetas de los mazos reales, en un orden barajado para que el alumno mezcle los mazos */
function realCards(decks: readonly DemoDeckFile[], seed: string): CardContent {
  const entities = buildDeckEntities(decks);
  const rng = createRng(`card-difficulty|${seed}`);
  const simCards = createRng(`card-order|${seed}`).shuffle(
    entities.cards.map((entry) => ({
      key: entry.key,
      branch: entry.note.branch ?? 'urgencias',
      topic: entry.note.topic ?? `${entry.deckKey}-sin-tema`,
      difficulty: rng.normal(0, 0.7),
    })),
  );
  return {
    simCards,
    decks: entities.decks,
    notes: entities.notes,
    cards: entities.cards.map((entry) => entry.card),
    refs: new Map(
      entities.cards.map((entry) => [
        entry.key,
        { cardId: entry.card.id, deckId: entry.card.deckId },
      ]),
    ),
  };
}

/** Baraja sintética sin contenido médico, solo si no hay mazos (D-050) */
function syntheticContent(taxonomy: TopicTaxonomy, seed: string): CardContent {
  const simCards = syntheticCards(
    taxonomy.branches.flatMap((branch) =>
      branch.topics.map((topic) => ({ branch: branch.key, topic: topic.key })),
    ),
    5,
    seed,
  );
  const topicName = new Map(
    taxonomy.branches.flatMap((branch) =>
      branch.topics.map((topic) => [topic.key, topic.name] as const),
    ),
  );
  const deckId = syntheticIds.deck(seed);
  const deck = DeckSchema.parse({
    id: deckId,
    name: 'Tarjetas sintéticas de la simulación',
    description:
      'Datos simulados. Tarjetas sin contenido médico que usa la simulación de repasos cuando no hay mazos de demostración.',
    ownerId: null,
    origin: 'preloaded',
    visibility: 'private',
    isDemo: true,
    createdAt,
  });
  const notes: Note[] = [];
  const cards: Card[] = [];
  const refs = new Map<string, { cardId: string; deckId: string }>();
  for (const card of simCards) {
    const noteId = syntheticIds.note(seed, card.key);
    const cardId = syntheticIds.card(seed, card.key);
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
        back: 'Sin contenido. Sirve para simular repasos cuando no hay mazos de demostración.',
      }),
    );
    cards.push(CardSchema.parse({ id: cardId, noteId, deckId, ordinal: 0, createdAt }));
    refs.set(card.key, { cardId, deckId });
  }
  return { simCards, decks: [deck], notes, cards, refs };
}

export function buildDemoSeed(
  bank: DemoBank,
  taxonomy: TopicTaxonomy,
  options: DemoSeedOptions,
  decks: readonly DemoDeckFile[] = [],
): DemoSeed {
  const content =
    decks.length > 0 ? realCards(decks, options.seed) : syntheticContent(taxonomy, options.seed);
  const cohort = generateCohort(bank, taxonomy, {
    seed: options.seed,
    size: options.cohortSize,
    days: options.cohortDays,
    endDay: options.endDay,
    ...(options.notAfter ? { notAfter: options.notAfter } : {}),
    // Por defecto solo el alumno de la demo guarda sus repasos (D-052)
    simulateCards: options.cohortCardHistory === true,
    cards: content.simCards,
  });
  const demoStudent = generateDemoStudent(bank, {
    seed: options.seed,
    endDay: options.endDay,
    days: options.demoDays,
    examDate: options.examDate,
    difficulties: cohort.difficulties,
    cards: content.simCards,
    ...(options.notAfter ? { notAfter: options.notAfter } : {}),
  });

  const events = toEvents({
    student: demoStudent,
    bank,
    cards: content.simCards,
    cardRefs: content.refs,
  });
  if (options.cohortCardHistory === true) {
    for (const student of cohort.students) {
      events.push(
        ...toEvents({
          student,
          bank,
          cards: content.simCards,
          cardRefs: content.refs,
          sessionKinds: ['review'],
        }),
      );
    }
  }
  return {
    options,
    generatorVersion: GENERATOR_VERSION,
    cases: bank.cases,
    questions: bank.questions.map((entry) => ({
      question: entry.question,
      options: entry.options,
    })),
    decks: content.decks,
    notes: content.notes,
    cards: content.cards,
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
