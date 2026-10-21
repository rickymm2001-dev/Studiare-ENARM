// Lo que muestra la pantalla del tutor (11), calculado de la bitácora y el banco. Junta los
// contextos de error, las hipótesis, el informe semanal y los consejos por sesgo, cada uno con el
// motivo que más marca el alumno en esa trampa (B5). Todo se deriva cada vez que se abre, así que
// nunca queda desfasado de lo que el alumno hizo. Desde B14 el dominio por tema, el informe de Conócete y
// la fatiga salen del modelo del alumno (src/engines/studentModel.ts), el mismo que lee Progreso, así
// los dos dicen lo mismo. Sin React ni Dexie.
import type { Thresholds } from '@/config/thresholds';
import type { StudentModel } from '@/data/model/contracts';
import type { Option, Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import { topicTaxonomy } from '@/demo/content';
import { errorMotives, motivesByAttempt, topMotive, type ErrorMotive } from '@/engines/errorCauses';
import { buildStudentModel, type StudentModelBuild } from '@/engines/studentModel';
import { biasByKey, biasCalibration, tipByKey } from '../progress/focusItems';
import type { BankLookup } from '../progress/insightFacts';
import { buildErrorContexts, type CardFact } from './errorContexts';
import { buildHypotheses, type Hypothesis } from './tutorModel';
import { weeklyReport, type WeeklyReport } from './weeklyReport';

export interface BiasTip {
  tag: string;
  name: string;
  /** Texto base del consejo. Es un borrador pendiente de revisión médica */
  tip: string;
  level: 'watch' | 'focus';
  /** Un médico ya revisó el texto, así que deja de ser un borrador (pantalla 20) */
  reviewed?: boolean;
  /** Es una de las trampas a las que el modelo del alumno lo ve propenso. Esas van primero (B14, 4.3) */
  prone?: boolean;
  /** Las preguntas más recientes donde el alumno cayó en esta trampa, hasta 3 */
  examples: readonly string[];
  /**
   * El motivo que más marcó en los errores con esta trampa, con cuántas veces y de cuántos errores
   * con motivo (B5). null o ausente si no marcó ninguno
   */
  motive?: { motive: ErrorMotive; count: number; total: number } | null;
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
  /** Preguntas que respondió en los últimos 7 días, para el informe semanal */
  answersThisWeek: number;
  /** La fatiga con el estado global del detector. Mientras no esté validado, calibrando (B14, 3.6) */
  fatigue: StudentModel['fatigue'];
  /** Sesgos solo cuando los médicos coinciden al etiquetar, si no trampas. Sale del modelo (4.4) */
  vocabulary: StudentModel['bias']['vocabulary'];
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
  /** Cartas de una materia libre, que no cuentan en Conócete ni en el informe semanal (B6) */
  freeSubjectCards?: ReadonlySet<string>;
  /**
   * El modelo del alumno que ya calculó la pantalla, el mismo que lee Progreso. Sin él se calcula aquí
   * con la bitácora y el banco
   */
  model?: StudentModelBuild;
}

const BIAS_EXAMPLES = 3;

/**
 * Por trampa, el motivo que más marcó en los errores donde eligió una opción con esa trampa. Cada
 * error cuenta una vez con su último motivo, y las causas de antes se leen con la tabla de 4.23
 */
export function biasMotives(
  events: readonly AppEvent[],
  bank: BankLookup,
): Map<string, NonNullable<BiasTip['motive']>> {
  const motiveOf = motivesByAttempt(
    errorMotives(events, {
      aliases: (id) => {
        const stable = bank.questions.get(id)?.questionId;
        return stable ? [stable] : [];
      },
    }),
  );
  const byTag = new Map<string, ErrorMotive[]>();
  for (const event of events) {
    if (event.type !== 'question_answered' || event.payload.correct) continue;
    const tag = bank.options.get(event.payload.optionVersionId)?.biasTag;
    const motive = motiveOf.get(event.id);
    if (!tag || !motive) continue;
    byTag.set(tag, [...(byTag.get(tag) ?? []), motive]);
  }
  return new Map(
    [...byTag.entries()].flatMap(([tag, motives]) => {
      const top = topMotive(motives);
      return top ? [[tag, top] as const] : [];
    }),
  );
}

/** Por trampa, las preguntas más recientes donde el alumno falló eligiendo una opción con esa trampa */
function biasExamples(events: readonly AppEvent[], bank: BankLookup): Map<string, string[]> {
  const byTag = new Map<string, string[]>();
  const answers = events
    .filter((event) => event.type === 'question_answered')
    .sort((a, b) => b.at.localeCompare(a.at));
  for (const event of answers) {
    if (event.payload.correct) continue;
    const tag = bank.options.get(event.payload.optionVersionId)?.biasTag;
    if (!tag) continue;
    const list = byTag.get(tag) ?? [];
    if (list.length < BIAS_EXAMPLES && !list.includes(event.payload.questionVersionId)) {
      list.push(event.payload.questionVersionId);
    }
    byTag.set(tag, list);
  }
  return byTag;
}

export function buildTutorView(input: TutorViewInput): TutorView {
  const { events, bank, thresholds } = input;

  const built =
    input.model ??
    buildStudentModel({
      now: input.now,
      timeZone: input.timeZone,
      desiredRetention: input.desiredRetention,
      events,
      bank,
      taxonomy: topicTaxonomy,
      thresholds,
      ...(input.freeSubjectCards ? { freeSubjectCards: input.freeSubjectCards } : {}),
    });
  const insightReport = built.report;
  // Dominio de los temas que ya tienen respuestas suficientes. Los que calibran no aparecen
  const mastery = new Map(
    [...built.topics.values()].flatMap((entry) =>
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
  // Mientras el detector de fatiga no esté validado con los datos de todos, no se habla de patrones de
  // fatiga del alumno. La pantalla dice calibrando en su lugar (B14, 3.6)
  const fatigueValidated = built.model.fatigue.validation === 'validated';
  const hypotheses = buildHypotheses({
    contexts,
    now: input.now,
    thresholds: thresholds.forgetting,
  }).filter((hypothesis) => hypothesis.rule !== 'fatigue' || fatigueValidated);
  const windowStart = input.now.getTime() - thresholds.forgetting.patternWindowDays * DAY_MS;

  const examplesByTag = biasExamples(events, bank);
  const motivesByTag = biasMotives(events, bank);
  // Las trampas a las que el modelo lo ve propenso van primero, de la que más atrapa a la que menos
  const prone = built.model.bias.prone;
  const rank = (tag: string) => {
    const index = prone.indexOf(tag);
    return index === -1 ? prone.length : index;
  };
  const biasTips = insightReport.insights
    .flatMap((insight): BiasTip[] => {
      if (!insight.id.startsWith('bias:') || insight.state.kind !== 'ready') return [];
      if (insight.state.level === 'strength') return [];
      const tag = insight.id.slice('bias:'.length);
      return [
        {
          tag,
          name: biasByKey.get(tag)?.name ?? tag,
          tip: tipByKey.get(tag) ?? '',
          level: insight.state.level,
          prone: prone.includes(tag),
          examples: examplesByTag.get(tag) ?? [],
          motive: motivesByTag.get(tag) ?? null,
        },
      ];
    })
    .sort((a, b) => rank(a.tag) - rank(b.tag));

  return {
    confirmed: hypotheses.filter((hypothesis) => hypothesis.status === 'confirmed'),
    forming: hypotheses.filter((hypothesis) => hypothesis.status === 'forming'),
    recentErrors: contexts.filter((context) => Date.parse(context.at) >= windowStart).length,
    report: weeklyReport(insightReport, built.weakTopics),
    biasTips,
    biasCalibration: biasCalibration(insightReport),
    baseTopics,
    answersThisWeek: events.filter(
      (event) =>
        event.type === 'question_answered' &&
        input.now.getTime() - Date.parse(event.at) < 7 * DAY_MS &&
        Date.parse(event.at) <= input.now.getTime(),
    ).length,
    fatigue: built.model.fatigue,
    vocabulary: built.model.bias.vocabulary,
  };
}
