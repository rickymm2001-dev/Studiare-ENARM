// El análisis de las respuestas del alumno que comparten Progreso y los widgets de Inicio. Junta cada
// respuesta con su rama, tema y dificultad, el dominio por subespecialidad, el informe de Conócete y
// las subespecialidades débiles, así todos dicen lo mismo. Sin React ni Dexie.
import type { Thresholds } from '@/config/thresholds';
import type { Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import { topicTaxonomy } from '@/demo/content';
import { buildInsights, type InsightReport } from '@/engines/insights';
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

export interface Analysis {
  responses: AnsweredQuestion[];
  /** Dominio de cada subespecialidad por su clave. Calibra hasta tener respuestas suficientes */
  byTopic: ReadonlyMap<string, TopicMastery>;
  report: InsightReport;
  /** Subespecialidades con dominio bajo, de la más débil a la menos */
  weakTopics: WeakTopic[];
}

export function buildAnalysis(input: {
  events: readonly AppEvent[];
  bank: BankLookup;
  timeZone: string;
  today: string;
  desiredRetention: number;
  thresholds: Thresholds;
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
    }),
  );
  return { responses, byTopic, report, weakTopics: weakTopicsFrom(byTopic) };
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
