// El análisis de las respuestas del alumno que comparten Progreso y los widgets de Inicio. Junta cada
// respuesta con su rama, tema y dificultad, el dominio por subespecialidad, el informe de Conócete y
// las subespecialidades débiles, así todos dicen lo mismo. Sin React ni Dexie.
import type { Thresholds } from '@/config/thresholds';
import type { Question } from '@/data/schemas/bank';
import { normalizeErrorCause, type CurrentErrorCause } from '@/data/schemas/common';
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
  /** Reparto de motivos de error vigentes totales (D-124). Vale el último motivo de cada reactivo */
  causesTotal: ReadonlyMap<CurrentErrorCause, number>;
  /** Reparto de motivos de error vigentes agrupados por rama troncal (D-124) */
  causesByBranch: ReadonlyMap<string, ReadonlyMap<CurrentErrorCause, number>>;
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

  // Reparto de motivos de error (D-124). Vale el último motivo de cada reactivo/intento.
  const latestCausesByTarget = new Map<
    string,
    { cause: CurrentErrorCause; branch: string | null }
  >();
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    if (event.type === 'cause_reported') {
      const normalized = normalizeErrorCause(event.payload.cause);
      const targetKey = `${event.payload.targetKind}|${event.payload.targetId}`;
      if (normalized === null) {
        latestCausesByTarget.delete(targetKey);
      } else {
        let branch: string | null = null;
        if (event.payload.targetKind === 'question') {
          const q = bank.questions.get(event.payload.targetId);
          branch = q?.branch ?? null;
        }
        latestCausesByTarget.set(targetKey, { cause: normalized, branch });
      }
    }
  }

  const causesTotal = new Map<CurrentErrorCause, number>();
  const causesByBranch = new Map<string, Map<CurrentErrorCause, number>>();

  for (const { cause, branch } of latestCausesByTarget.values()) {
    causesTotal.set(cause, (causesTotal.get(cause) ?? 0) + 1);
    if (branch) {
      const branchMap = causesByBranch.get(branch) ?? new Map<CurrentErrorCause, number>();
      branchMap.set(cause, (branchMap.get(cause) ?? 0) + 1);
      causesByBranch.set(branch, branchMap);
    }
  }

  return {
    responses,
    byTopic,
    report,
    weakTopics: weakTopicsFrom(byTopic),
    causesTotal,
    causesByBranch,
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
