// El análisis de las respuestas del alumno que comparten Progreso y los widgets de Inicio. Junta cada
// respuesta con su rama, tema y dificultad, el dominio por subespecialidad, el informe de Conócete y
// las subespecialidades débiles, así todos dicen lo mismo. Conócete deja fuera las tarjetas de una
// materia libre (B6). Los temas a reforzar y los focos no incluyen la sección de inglés, que tiene su
// propia tarjeta en Progreso con sus respuestas aparte (B13, 2.8). Sin React ni Dexie.
import type { Thresholds } from '@/config/thresholds';
import type { Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import { topicTaxonomy } from '@/demo/content';
import { buildInsights, type InsightReport } from '@/engines/insights';
import { branchSection } from '@/data/schemas/content';
import type { EnglishAnswer } from '@/engines/englishSection';
import { analyzeTopics, type TopicMastery } from '@/engines/topics';
import { weakTopicsFrom, type WeakTopic } from './focusItems';
import { buildInsightInput, type BankLookup } from './insightFacts';

export interface AnsweredQuestion {
  branch: string;
  topic: string;
  /** Dificultad que le puso el médico, de 1 a 5 */
  level: Question['physicianDifficulty'];
  correct: boolean;
}

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
  /** Subespecialidades con dominio bajo, de la más débil a la menos. Sin Inglés médico */
  weakTopics: WeakTopic[];
  /** Lo que lleva de Inglés médico, que tiene su tarjeta aparte (B13) */
  english: EnglishProgress;
}

export function buildAnalysis(input: {
  events: readonly AppEvent[];
  bank: BankLookup;
  timeZone: string;
  today: string;
  desiredRetention: number;
  thresholds: Thresholds;
  /** Cartas de una materia libre, que no cuentan en Conócete (B6) */
  freeSubjectCards?: ReadonlySet<string>;
}): Analysis {
  const { events, bank, thresholds } = input;
  const responses = events.flatMap((event): AnsweredQuestion[] => {
    if (event.type !== 'question_answered') return [];
    const question = bank.questions.get(event.payload.questionVersionId);
    return question
      ? [
          {
            branch: question.branch,
            topic: question.topic,
            level: question.physicianDifficulty,
            correct: event.payload.correct,
          },
        ]
      : [];
  });
  const byTopic = new Map(
    analyzeTopics({
      responses,
      taxonomy: topicTaxonomy,
      averageRetrievability: {},
      thresholds: thresholds.topics,
    }).topics.map((entry) => [entry.topic, entry]),
  );
  const report = buildInsights(
    buildInsightInput({
      events,
      bank,
      timeZone: input.timeZone,
      today: input.today,
      desiredRetention: input.desiredRetention,
      thresholds,
      freeSubjectCards: input.freeSubjectCards,
    }),
  );
  return {
    responses,
    byTopic,
    report,
    weakTopics: weakTopicsFrom(byTopic),
    english: englishProgressFrom(events, bank),
  };
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
