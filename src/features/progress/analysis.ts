// El análisis de las respuestas del alumno que comparten Progreso y los widgets de Inicio. Desde B14 sale del
// modelo del alumno (src/engines/studentModel.ts), el mismo que lee el Tutor, así todos dicen lo mismo. Junta
// cada respuesta con su rama, tema y dificultad, el dominio por subespecialidad, el informe de Conócete y las
// subespecialidades a reforzar. Conócete deja fuera las tarjetas de una materia libre (B6). Los temas a
// reforzar y los focos no incluyen la sección de inglés, que tiene su propia tarjeta en Progreso con sus
// respuestas aparte (B13, 2.8). Sin React ni Dexie.
import type { Thresholds } from '@/config/thresholds';
import type { ModelThresholds } from '@/config/modelSettings';
import type { PopulationBaselines } from '@/data/model/contracts';
import type { AppEvent } from '@/data/schemas/events';
import { topicTaxonomy } from '@/demo/content';
import { branchSection } from '@/data/schemas/content';
import type { EnglishAnswer } from '@/engines/englishSection';
import type { InsightReport } from '@/engines/insights';
import {
  buildStudentModel,
  type AnsweredQuestion,
  type DifficultyOf,
  type ModelCard,
  type StudentModelBuild,
  type WeakTopic,
} from '@/engines/studentModel';
import { studyDayStart } from '@/engines/studyDay';
import type { TopicMastery } from '@/engines/topics';
import type { BankLookup } from './insightFacts';

export type { AnsweredQuestion };

/** Las ramas que no son de la sección clínica. Sus temas no entran a los temas a reforzar */
const englishBranches: ReadonlySet<string> = new Set(
  topicTaxonomy.branches
    .filter((branch) => branchSection(branch) !== 'clinical')
    .map((branch) => branch.key),
);

export interface EnglishProgress {
  /** Una respuesta por reactivo de inglés contestado, para las cifras de Inglés médico */
  answers: EnglishAnswer[];
  /** Textos distintos con respuestas */
  texts: number;
}

/**
 * Las respuestas de inglés del alumno. El tiempo de cada reactivo es el promedio de su texto en esa
 * sesión, porque el primer reactivo de un texto carga con su lectura y los demás no, y el tiempo sugerido
 * es por reactivo del texto completo (B13, 2.7). Una pregunta que ya no está en el banco no cuenta
 */
export function englishProgressFrom(
  events: readonly AppEvent[],
  bank: BankLookup,
): EnglishProgress {
  const groups = new Map<string, { correct: boolean; questionId: string; ms: number }[]>();
  const texts = new Set<string>();
  for (const event of events) {
    if (event.type !== 'question_answered') continue;
    const question = bank.questions.get(event.payload.questionVersionId);
    if (question?.language !== 'en') continue;
    const text = question.caseId ?? question.id;
    texts.add(text);
    const key = `${event.sessionId ?? ''}|${text}`;
    const list = groups.get(key) ?? [];
    list.push({
      correct: event.payload.correct,
      questionId: question.id,
      ms: Math.max(0, event.payload.msToAnswer),
    });
    groups.set(key, list);
  }
  const answers: EnglishAnswer[] = [];
  for (const list of groups.values()) {
    const mean = list.reduce((sum, item) => sum + item.ms, 0) / list.length;
    for (const item of list) {
      answers.push({ questionId: item.questionId, correct: item.correct, msSpent: mean });
    }
  }
  return { answers, texts: texts.size };
}

export interface Analysis {
  responses: AnsweredQuestion[];
  /** Dominio de cada subespecialidad por su clave. Calibra hasta tener respuestas suficientes */
  byTopic: ReadonlyMap<string, TopicMastery>;
  report: InsightReport;
  /** Subespecialidades con dominio bajo, de la que más urge reforzar a la que menos. Sin Inglés médico */
  weakTopics: WeakTopic[];
  /** Lo que lleva de Inglés médico, que tiene su tarjeta aparte (B13) */
  english: EnglishProgress;
  /** El modelo del alumno completo, el mismo que lee el Tutor (B14) */
  model: StudentModelBuild;
  /** Las preguntas que contestó, con las que se armó */
  bank: BankLookup;
}

/** El análisis de Progreso con lo que ya calculó el modelo del alumno */
export function analysisFrom(
  model: StudentModelBuild,
  events: readonly AppEvent[],
  bank: BankLookup,
): Analysis {
  return {
    responses: model.responses,
    byTopic: model.topics,
    report: model.report,
    weakTopics: model.weakTopics,
    english: englishProgressFrom(events, bank),
    model,
    bank,
  };
}

export function buildAnalysis(input: {
  events: readonly AppEvent[];
  bank: BankLookup;
  timeZone: string;
  today: string;
  /** El instante del cálculo. Sin él se usa la tarde del día de estudio de today */
  now?: Date;
  desiredRetention: number;
  thresholds: Thresholds;
  /** Cartas de una materia libre, que no cuentan en Conócete (B6) */
  freeSubjectCards?: ReadonlySet<string>;
  /** Las tarjetas de los mazos que sigue, para el factor de olvido de los temas a reforzar (B14) */
  cards?: readonly ModelCard[];
  difficultyOf?: DifficultyOf;
  population?: PopulationBaselines | null;
  vocabulary?: 'bias' | 'trap';
  settings?: Pick<ModelThresholds, 'populationMinStudents'>;
}): Analysis {
  const { events, bank } = input;
  const now =
    input.now ?? new Date(studyDayStart(input.today, input.timeZone).getTime() + 12 * 3_600_000);
  const model = buildStudentModel({
    now,
    timeZone: input.timeZone,
    desiredRetention: input.desiredRetention,
    events,
    bank,
    taxonomy: topicTaxonomy,
    thresholds: input.thresholds,
    ...(input.settings ? { settings: input.settings } : {}),
    ...(input.freeSubjectCards ? { freeSubjectCards: input.freeSubjectCards } : {}),
    ...(input.cards ? { cards: input.cards } : {}),
    ...(input.difficultyOf ? { difficultyOf: input.difficultyOf } : {}),
    ...(input.population !== undefined ? { population: input.population } : {}),
    ...(input.vocabulary ? { vocabulary: input.vocabulary } : {}),
  });
  return analysisFrom(model, events, bank);
}

/**
 * Cuánto le falta al tema más cercano a mostrar su dominio, para decirlo mientras calibra. null si
 * ya hay temas con dominio listo, que entonces ya se puede decir cuáles son débiles. Con una rama
 * solo cuentan los temas de esa rama, porque un tema listo de otra no dice nada de la que se mira
 */
export function topicsCalibration(
  byTopic: ReadonlyMap<string, Pick<TopicMastery, 'state' | 'branch'>>,
  fallbackNeed: number,
  branch: string | null = null,
): { have: number; need: number } | null {
  let closest: { have: number; need: number } | null = null;
  for (const entry of byTopic.values()) {
    if (branch !== null && entry.branch !== branch) continue;
    // Los temas de Inglés médico no cuentan: su práctica y sus cifras van aparte (B13)
    if (englishBranches.has(entry.branch)) continue;
    const { state } = entry;
    if (state.kind === 'ready') return null;
    const need = state.responses + state.responsesNeeded;
    // Gana el que menos le falta y, a igual faltante, el que más respuestas lleva
    if (
      closest === null ||
      state.responsesNeeded < closest.need - closest.have ||
      (state.responsesNeeded === closest.need - closest.have && state.responses > closest.have)
    )
      closest = { have: state.responses, need };
  }
  return closest ?? { have: 0, need: fallbackNeed };
}
