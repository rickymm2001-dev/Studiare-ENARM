// Lo que muestra la pantalla del tutor (11), calculado de la bitácora y el banco. Junta los
// contextos de error, las hipótesis, el informe semanal y los consejos por sesgo. Todo se deriva
// cada vez que se abre, así que nunca queda desfasado de lo que el alumno hizo. Sin React ni Dexie.
import type { Thresholds } from '@/config/thresholds';
import type { Option, Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import { topicTaxonomy } from '@/demo/content';
import { buildInsights } from '@/engines/insights';
import { analyzeTopics, type TopicResponse } from '@/engines/topics';
import { biasByKey, biasCalibration, tipByKey, weakTopicsFrom } from '../progress/focusItems';
import { buildInsightInput, type BankLookup } from '../progress/insightFacts';
import { buildErrorContexts, type CardFact } from './errorContexts';
import { buildHypotheses, type Hypothesis } from './tutorModel';
import { weeklyReport, type WeeklyReport } from './weeklyReport';

export interface BiasTip {
  tag: string;
  name: string;
  /** Texto base del consejo. Es un borrador pendiente de revisión médica */
  tip: string;
  level: 'watch' | 'focus';
}

export interface TutorView {
  confirmed: Hypothesis[];
  forming: Hypothesis[];
  /** Errores de los últimos días de la ventana, con los que se buscan patrones */
  recentErrors: number;
  report: WeeklyReport;
  biasTips: BiasTip[];
  /** Errores con trampa etiquetada que lleva y que pide el motor. null cuando ya no calibra */
  biasCalibration: { have: number; need: number } | null;
  /** Tema base de cada tema, para llevar a practicarlo cuando falla la base */
  baseTopics: ReadonlyMap<string, string>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TutorViewInput {
  now: Date;
  events: readonly AppEvent[];
  bank: BankLookup;
  /** Cada pregunta del banco con su clave, para detectar que eligió la de otra parecida */
  questions: readonly Question[];
  options: readonly Option[];
  cards: ReadonlyMap<string, CardFact>;
  timeZone: string;
  today: string;
  desiredRetention: number;
  thresholds: Thresholds;
}

export function buildTutorView(input: TutorViewInput): TutorView {
  const { events, bank, thresholds } = input;

  const responses: TopicResponse[] = events.flatMap((event) => {
    if (event.type !== 'question_answered') return [];
    const question = bank.questions.get(event.payload.questionVersionId);
    return question
      ? [{ branch: question.branch, topic: question.topic, correct: event.payload.correct }]
      : [];
  });
  const analysis = analyzeTopics({
    responses,
    taxonomy: topicTaxonomy,
    averageRetrievability: {},
    thresholds: thresholds.topics,
  });
  const byTopic = new Map(analysis.topics.map((entry) => [entry.topic, entry]));
  const mastery = new Map(
    analysis.topics.flatMap((entry) =>
      entry.state.kind === 'ready' ? [[entry.topic, entry.state.mastery] as const] : [],
    ),
  );
  const baseTopics = new Map(
    topicTaxonomy.branches.flatMap((branch) =>
      branch.topics.flatMap((topic) => (topic.baseTopic ? [[topic.key, topic.baseTopic]] : [])),
    ),
  );

  const correctByQuestion = new Map(
    input.options
      .filter((option) => option.isCorrect)
      .map((option) => [option.questionVersionId, option.text]),
  );
  const correctAnswers = input.questions.flatMap((question) => {
    const text = correctByQuestion.get(question.id);
    return text === undefined
      ? []
      : [{ questionId: question.id, subtopic: question.subtopic, text }];
  });

  const contexts = buildErrorContexts({
    events,
    bank,
    correctAnswers,
    cards: input.cards,
    mastery,
    baseTopics,
    timeZone: input.timeZone,
    today: input.today,
    desiredRetention: input.desiredRetention,
    thresholds,
  });
  const hypotheses = buildHypotheses({
    contexts,
    now: input.now,
    thresholds: thresholds.forgetting,
  });
  const windowStart = input.now.getTime() - thresholds.forgetting.patternWindowDays * DAY_MS;
  const insightReport = buildInsights(
    buildInsightInput({
      events,
      bank,
      timeZone: input.timeZone,
      today: input.today,
      desiredRetention: input.desiredRetention,
      thresholds,
    }),
  );

  const biasTips = insightReport.insights.flatMap((insight): BiasTip[] => {
    if (!insight.id.startsWith('bias:') || insight.state.kind !== 'ready') return [];
    if (insight.state.level === 'strength') return [];
    const tag = insight.id.slice('bias:'.length);
    return [
      {
        tag,
        name: biasByKey.get(tag)?.name ?? tag,
        tip: tipByKey.get(tag) ?? '',
        level: insight.state.level,
      },
    ];
  });

  return {
    confirmed: hypotheses.filter((hypothesis) => hypothesis.status === 'confirmed'),
    forming: hypotheses.filter((hypothesis) => hypothesis.status === 'forming'),
    recentErrors: contexts.filter((context) => Date.parse(context.at) >= windowStart).length,
    report: weeklyReport(insightReport, weakTopicsFrom(byTopic)),
    biasTips,
    biasCalibration: biasCalibration(insightReport),
    baseTopics,
  };
}
