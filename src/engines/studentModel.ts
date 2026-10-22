/**
 * Modelo del alumno (B14, 4 del plan de B14, respuesta 84).
 *
 * Qué hace. Es el único lugar donde se junta lo que la app sabe de cada alumno, para que Inicio,
 * Progreso, Simular y el Tutor digan lo mismo. Antes Progreso (buildAnalysis) y el Tutor
 * (buildTutorView) calculaban por separado el dominio por tema y el informe de Conócete. Ahora los dos
 * leen este modelo. Cada parte dice calibrando, con cuánto lleva y cuánto pide, hasta llegar a su umbral.
 * Entradas. La bitácora del alumno y el banco que contestó, la taxonomía, los umbrales, las tarjetas
 * de los mazos que sigue con su tema y su estado de repaso, la dificultad que usa la app por pregunta,
 * la población que publica la calibración nocturna (o null) y el vocabulario de sesgos o trampas. El
 * reloj llega como parámetro (now), igual que en los demás motores.
 * Salidas. StudentModel de src/data/model/contracts.ts, que leen B (el modo adaptativo) y las
 * pantallas, más lo que las pantallas necesitan para pintar: cada respuesta con su dificultad, el
 * dominio de cada rama y tema con sus conteos, el informe de Conócete y los temas a reforzar.
 * Método
 *   - Dominio por tema. analyzeTopics, beta-binomial que encoge hacia la media de la rama con fuerza
 *     de 10 respuestas. Por rama, analyzeCategories. Calibra con menos de 5 respuestas propias por
 *     tema o con un intervalo de 0.25 o más
 *   - Temas para reforzar. Los temas con dominio listo y menor a 0.6, ordenados por prioridad: lo que
 *     falta de dominio por el peso del tema en el ENARM por el factor de olvido. El factor sale de la
 *     retrievability promedio de las tarjetas del tema (2 menos R) y sin tarjetas vale 1, así los
 *     mazos y los apuntes del alumno pesan en la prioridad. populationHard marca los temas que le
 *     cuestan a la mayoría, los del cuarto más bajo de acierto de la población (desde 30 alumnos)
 *   - Habilidad. El estimador de adaptive.ts (estimado a posteriori sobre una normal de media 0 y
 *     desviación 1 con cuadratura de 41 puntos), el mismo con el que Simular elige las preguntas del
 *     modo adaptativo. Usa el primer intento del alumno en cada pregunta cuya dificultad ya se midió
 *     con alumnos (provisional o calibrada). Con pocas respuestas se queda cerca de 0
 *   - Sesgos. analyzeBias con error_share (D-051) contra la línea base de la población en las
 *     etiquetas que tienen alumnos suficientes y contra la de azar en las demás. Los que le atraen son
 *     los tres primeros del perfil de Conócete, que es lo que dirige el muestreo del simulador
 *   - Motivos de error. Reparto de los siete motivos en los errores que explicó
 *   - Fatiga. fatigueTrendSignal en sus sesiones largas. Mientras el detector global no esté validado
 *     por la calibración nocturna (3.6), la fatiga del alumno dice calibrando aunque ya tenga sus
 *     sesiones largas, y el informe de Conócete cambia su lectura de fatiga por lo mismo
 *   - Ritmo, constancia y carga de repaso con los mismos mínimos de Conócete y de la carga diaria
 * Umbrales. Los de INSIGHT_MINIMUMS y de thresholds (topics, bias, behavior, structure y daily), 10
 * respuestas a preguntas medidas para la habilidad (J) y 30 alumnos por dato de la población
 * (model_settings.thresholds.populationMinStudents, nunca menos de 30).
 */
import { MIN_PRIVACY_GROUP, type ModelThresholds } from '@/config/modelSettings';
import type { Thresholds } from '@/config/thresholds';
import type {
  CalibrationState,
  FatigueValidationState,
  PartState,
  PopulationBaselines,
  StudentModel,
} from '@/data/model/contracts';
import type { CognitiveLevel } from './bloom';
import type { Question } from '@/data/schemas/bank';
import type { FsrsCardState } from '@/data/schemas/common';
import { branchSection, type TopicTaxonomy } from '@/data/schemas/content';
import type { AppEvent } from '@/data/schemas/events';
import { estimateAbility, type AbilityResponse } from './adaptive';
import { analyzeBias, type BiasExposure } from './bias';
import { fatigueTrendSignal, MIN_LONG_SESSIONS_FOR_FATIGUE } from './behavior';
import { physicianToLogit } from './difficulty';
import { ERROR_MOTIVES, topMotive } from './errorCauses';
import { retrievabilityOf } from './fsrs';
import { buildInsightInput, type BankLookup } from './insightFacts';
import {
  buildInsights,
  chanceBaseline,
  INSIGHT_MINIMUMS,
  rankInsights,
  type Insight,
  type InsightReport,
} from './insights';
import { addDays, daysBetween, studyDayEnd, studyDayOf } from './studyDay';
import {
  analyzeCategories,
  analyzeTopics,
  type CategoryMastery,
  type MasteryState,
  type TopicMastery,
} from './topics';

/** Respuestas a preguntas con dificultad medida que pide la habilidad para dejar de calibrar (J) */
export const ABILITY_MIN_ANSWERS = 10;

/** Dominio por debajo del cual una subespecialidad cuenta como débil y entra a reforzar */
export const WEAK_TOPIC_BELOW = 0.6;

/** Temas con datos que hacen falta para decir cuáles son el cuarto más bajo de la población */
const MIN_TOPICS_FOR_QUARTILE = 4;

/** Días hacia atrás que cuenta la constancia que ve el alumno */
const CONSISTENCY_DAYS = 30;

/** Días que mira la carga de repaso que viene */
const LOAD_AHEAD_DAYS = 7;

// ===================================================================== Entradas

/** Una tarjeta de los mazos que sigue el alumno, sin las suspendidas */
export interface ModelCard {
  /** Clave de la subespecialidad de su nota. null si la nota no tiene tema */
  topic: string | null;
  /** Último estado de repaso. null si nunca se ha visto */
  state: FsrsCardState | null;
}

/** La dificultad que usa la app para una pregunta, de dónde sale y con cuántos alumnos se midió */
export interface QuestionDifficulty {
  /** Dificultad en logits */
  logit: number;
  state: CalibrationState;
  /** Alumnos distintos con que se midió. 0 si es la estimada por el médico */
  students: number;
}

/** La dificultad de una pregunta contestada. Con B14 puede venir de la calibración nocturna */
export type DifficultyOf = (question: Question) => QuestionDifficulty;

/** Sin calibración vale la dificultad que estimó el médico, convertida a logits */
export const physicianDifficultyOf: DifficultyOf = (question) => ({
  logit: physicianToLogit(question.physicianDifficulty),
  state: 'physician_estimate',
  students: 0,
});

export interface StudentModelInput {
  /** El instante del cálculo. Los motores no leen el reloj */
  now: Date;
  timeZone: string;
  desiredRetention: number;
  events: readonly AppEvent[];
  /** Las preguntas que contestó, con sus opciones y casos */
  bank: BankLookup;
  taxonomy: TopicTaxonomy;
  thresholds: Thresholds;
  /** Los ajustes del modelo. Sin ellos valen los 30 alumnos de la privacidad */
  settings?: Pick<ModelThresholds, 'populationMinStudents'>;
  /** Cartas de una materia libre, que no cuentan en Conócete (B6) */
  freeSubjectCards?: ReadonlySet<string>;
  /** Tarjetas de los mazos que sigue, para el factor de olvido y la carga de repaso */
  cards?: readonly ModelCard[];
  difficultyOf?: DifficultyOf;
  /** Lo que publicó la calibración nocturna. null o sin available es que no hay */
  population?: PopulationBaselines | null;
  /** Sesgos solo cuando los médicos coinciden al etiquetar (4.4). Sin dato, trampas */
  vocabulary?: 'bias' | 'trap';
}

// ===================================================================== Salidas

/** Una respuesta con la rama, el tema y la dificultad con que se contestó */
export interface AnsweredQuestion {
  branch: string;
  topic: string;
  /** Dificultad que le puso el médico, de 1 a 5 */
  level: Question['physicianDifficulty'];
  /** Nivel cognitivo de Bloom de la pregunta, si el médico lo puso (V4-B5) */
  cognitiveLevel?: CognitiveLevel;
  correct: boolean;
  /** La dificultad medida con alumnos. Ausente mientras la pregunta sigue con la del médico */
  measured?: QuestionDifficulty;
}

export interface WeakTopic {
  key: string;
  name: string;
  /** Clave de la rama troncal, para filtrar */
  branch: string;
  branchName: string;
  mastery: number;
}

export interface StudentModelBuild {
  /** El modelo del contrato de B14 */
  model: StudentModel;
  responses: AnsweredQuestion[];
  /** Dominio por tema, con sus conteos. Calibra hasta tener respuestas suficientes */
  topics: ReadonlyMap<string, TopicMastery>;
  /** Dominio por rama troncal. Solo las ramas con respuestas */
  branches: ReadonlyMap<string, CategoryMastery>;
  /** El informe de Conócete, con la fatiga según el estado global del detector */
  report: InsightReport;
  /** Los temas con dominio bajo, del que más urge reforzar al que menos. Sin Inglés médico */
  weakTopics: WeakTopic[];
}

// ===================================================================== Piezas

const ready = <T>(value: T): PartState<T> => ({ state: 'ready', value });
const calibrating = <T>(have: number, need: number): PartState<T> => ({
  state: 'calibrating',
  have,
  need,
});

function masteryPart(state: MasteryState): PartState<number> {
  return state.kind === 'ready'
    ? ready(state.mastery)
    : calibrating(state.responses, state.responses + state.responsesNeeded);
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};

/** Cuantil con interpolación lineal sobre valores ya ordenados */
function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] as number;
  const high = sorted[upper] as number;
  return low + (high - low) * (position - lower);
}

/**
 * La habilidad que ve Progreso. Es la cuenta de adaptive.ts, la misma con la que Simular elige las
 * preguntas del modo adaptativo, así las dos dicen lo mismo. Solo se queda con el nivel y su error
 */
function abilityOf(answers: readonly AbilityResponse[]): { theta: number; se: number } {
  const { theta, se } = estimateAbility(answers);
  return { theta, se };
}

/** El primer intento de cada pregunta estable, en orden de tiempo */
function firstAttempts(
  events: readonly AppEvent[],
  bank: BankLookup,
): { question: Question; correct: boolean }[] {
  const seen = new Set<string>();
  const out: { question: Question; correct: boolean }[] = [];
  const answers = events
    .filter((event) => event.type === 'question_answered')
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  for (const event of answers) {
    const question = bank.questions.get(event.payload.questionVersionId);
    if (!question || seen.has(question.questionId)) continue;
    seen.add(question.questionId);
    out.push({ question, correct: event.payload.correct });
  }
  return out;
}

/** Retrievability promedio de las tarjetas ya vistas de cada tema, con llave rama/tema */
function averageRetrievability(
  cards: readonly ModelCard[],
  taxonomy: TopicTaxonomy,
  now: Date,
): Record<string, number> {
  const branchOf = new Map<string, string>(
    taxonomy.branches.flatMap((branch) =>
      branch.topics.map((topic) => [topic.key, branch.key] as const),
    ),
  );
  const sums = new Map<string, { sum: number; n: number }>();
  for (const card of cards) {
    if (card.topic === null || card.state === null || card.state.state === 'new') continue;
    const branch = branchOf.get(card.topic);
    if (branch === undefined) continue;
    const key = `${branch}/${card.topic}`;
    const entry = sums.get(key) ?? { sum: 0, n: 0 };
    entry.sum += retrievabilityOf(card.state, now);
    entry.n += 1;
    sums.set(key, entry);
  }
  return Object.fromEntries([...sums].map(([key, { sum, n }]) => [key, sum / n]));
}

/** Los temas que le cuestan a la mayoría, por clave de tema. Vacío sin población o con pocos temas */
function hardTopicKeys(
  population: PopulationBaselines | null,
  minStudents: number,
): ReadonlySet<string> {
  if (!population?.available) return new Set();
  const usable = Object.entries(population.topics).filter(
    ([, topic]) => topic.students >= minStudents && Number.isFinite(topic.accuracy),
  );
  if (usable.length < MIN_TOPICS_FOR_QUARTILE) return new Set();
  const firstQuartile = quantile(
    usable.map(([, topic]) => topic.accuracy).sort((a, b) => a - b),
    0.25,
  );
  return new Set(
    usable
      .filter(([, topic]) => topic.accuracy <= firstQuartile)
      .map(([key]) => key.slice(key.indexOf('/') + 1)),
  );
}

/** La atracción de la población por etiqueta, solo de las etiquetas con alumnos suficientes */
function populationAttraction(
  population: PopulationBaselines | null,
  minStudents: number,
): Record<string, number> {
  if (!population?.available) return {};
  return Object.fromEntries(
    Object.entries(population.bias)
      .filter(([, tag]) => tag.students >= minStudents && Number.isFinite(tag.rate))
      .map(([tag, { rate }]) => [tag, rate]),
  );
}

/**
 * Cambia la lectura de fatiga del informe. Mientras el detector global no esté validado, o el alumno
 * no tenga sus sesiones largas, queda calibrando. Validado, la lectura sale del mismo detector que
 * validó la noche, fatigueTrendSignal. method trend le avisa a la interfaz que la caída se mide por
 * cada 30 minutos de sesión y no del primer tercio al último
 */
function withFatigue(
  report: InsightReport,
  fatigue: StudentModel['fatigue'],
  sessions: number,
  drop: number,
): InsightReport {
  const insights = report.insights.map((insight): Insight => {
    if (insight.id !== 'fatigue') return insight;
    if (fatigue.state === 'calibrating') {
      return {
        ...insight,
        state: {
          kind: 'calibrating',
          have: sessions,
          need: MIN_LONG_SESSIONS_FOR_FATIGUE,
          unit: 'sessions',
        },
      };
    }
    return {
      ...insight,
      state: {
        kind: 'ready',
        level: fatigue.value.detected ? 'focus' : 'strength',
        values: { drop, sessions },
        refs: { method: 'trend' },
      },
    };
  });
  return { ...report, ...rankInsights(insights) };
}

// ===================================================================== El modelo

export function buildStudentModel(input: StudentModelInput): StudentModelBuild {
  const { events, bank, taxonomy, thresholds, now } = input;
  const today = studyDayOf(now, input.timeZone);
  const minStudents = Math.max(
    input.settings?.populationMinStudents ?? MIN_PRIVACY_GROUP,
    MIN_PRIVACY_GROUP,
  );
  const population = input.population?.available ? input.population : null;
  const difficultyOf = input.difficultyOf ?? physicianDifficultyOf;
  const cards = input.cards ?? [];

  const responses = events.flatMap((event): AnsweredQuestion[] => {
    if (event.type !== 'question_answered') return [];
    const question = bank.questions.get(event.payload.questionVersionId);
    if (!question) return [];
    const difficulty = difficultyOf(question);
    return [
      {
        branch: question.branch,
        topic: question.topic,
        level: question.physicianDifficulty,
        ...(question.cognitiveLevel ? { cognitiveLevel: question.cognitiveLevel } : {}),
        correct: event.payload.correct,
        ...(difficulty.state === 'physician_estimate' ? {} : { measured: difficulty }),
      },
    ];
  });

  // ---- Dominio por tema y por rama, y lo que hay que reforzar
  const topicAnalysis = analyzeTopics({
    responses,
    taxonomy,
    averageRetrievability: averageRetrievability(cards, taxonomy, now),
    // Se pide la lista completa y se recorta después, por si el widget muestra más de cinco
    thresholds: { ...thresholds.topics, topN: Number.MAX_SAFE_INTEGER },
  });
  const topics = new Map(topicAnalysis.topics.map((entry) => [entry.topic, entry]));
  const branchEntries = new Map(
    analyzeCategories({
      responses: responses.map((response) => ({
        category: response.branch,
        correct: response.correct,
      })),
      thresholds: thresholds.topics,
      minResponsesPerCategory: thresholds.structure.minResponsesPerCategory,
    }).map((entry) => [entry.category, entry]),
  );
  const clinical = new Map(
    taxonomy.branches
      .filter((branch) => branchSection(branch) === 'clinical')
      .map((b) => [b.key, b]),
  );
  const topicNames = new Map(
    taxonomy.branches.flatMap((branch) =>
      branch.topics.map((topic) => [topic.key, topic.name] as const),
    ),
  );
  const hard = hardTopicKeys(population, minStudents);
  const weak = topicAnalysis.priorities.filter(
    (priority) => clinical.has(priority.branch) && priority.reason.mastery < WEAK_TOPIC_BELOW,
  );
  const weakTopics: WeakTopic[] = weak.map((priority) => ({
    key: priority.topic,
    name: topicNames.get(priority.topic) ?? priority.topic,
    branch: priority.branch,
    branchName: clinical.get(priority.branch)?.name ?? priority.branch,
    mastery: priority.reason.mastery,
  }));

  // ---- Hechos de conducta, sesgos, motivos y estudio
  const facts = buildInsightInput({
    events,
    bank,
    timeZone: input.timeZone,
    today,
    desiredRetention: input.desiredRetention,
    thresholds,
    freeSubjectCards: input.freeSubjectCards,
  });
  const populationBias = populationAttraction(population, minStudents);
  const baseReport = buildInsights({ ...facts, populationBias });

  // Habilidad. El primer intento de cada pregunta cuya dificultad ya se midió con alumnos
  const measured = firstAttempts(events, bank).flatMap(({ question, correct }) => {
    const difficulty = difficultyOf(question);
    return difficulty.state === 'physician_estimate'
      ? []
      : [{ difficulty: difficulty.logit, correct }];
  });
  const ability: StudentModel['ability'] =
    measured.length >= ABILITY_MIN_ANSWERS
      ? ready(abilityOf(measured))
      : calibrating(measured.length, ABILITY_MIN_ANSWERS);

  // Sesgos. error_share contra la población donde la hay y contra el azar donde no
  const exposures: BiasExposure[] = facts.answers.map((answer) => ({
    visibleTags: answer.visibleTags,
    chosenTag: answer.correct ? null : answer.chosenTag,
  }));
  const biasAnalysis = analyzeBias({
    exposures,
    baseline: {
      attraction: { ...chanceBaseline(exposures), ...populationBias },
      method: 'error_share',
      source: Object.keys(populationBias).length > 0 ? 'real' : 'chance',
    },
    thresholds: thresholds.bias,
  });
  // Los que le atraen son los tres primeros del perfil de Conócete, que existe desde los 40 errores
  const profile = baseReport.insights.find((insight) => insight.id === 'bias_profile');
  const profileRefs = profile?.state.kind === 'ready' ? profile.state.refs : {};
  const prone = [0, 1, 2].flatMap((index) => {
    const tag = profileRefs[`tag${index}`];
    return tag === undefined ? [] : [tag];
  });
  const byTag: Record<string, PartState<number>> = {};
  for (const entry of biasAnalysis.tags) {
    byTag[entry.tag] =
      entry.status.kind === 'calibrating'
        ? calibrating(biasAnalysis.taggedErrors, thresholds.bias.minTaggedErrors)
        : ready(entry.attraction);
  }

  // Motivos de error
  const causes = facts.causes;
  const motiveTally = new Map<string, number>();
  for (const motive of causes) motiveTally.set(motive, (motiveTally.get(motive) ?? 0) + 1);
  const top = topMotive(causes);
  const motives: StudentModel['motives'] =
    causes.length >= INSIGHT_MINIMUMS.causes && top
      ? ready({
          shares: Object.fromEntries(
            ERROR_MOTIVES.flatMap((motive) => {
              const count = motiveTally.get(motive) ?? 0;
              return count > 0 ? [[motive, count / causes.length]] : [];
            }),
          ),
          top: top.motive,
        })
      : calibrating(causes.length, INSIGHT_MINIMUMS.causes);

  // Fatiga. Con el estado global del detector (3.6)
  const validation: FatigueValidationState = population?.fatigue.state ?? 'calibrating';
  const trend = fatigueTrendSignal(facts.answers, thresholds.behavior);
  const fatigue: StudentModel['fatigue'] = {
    ...(trend.fatigued !== null && validation === 'validated'
      ? ready({ detected: trend.fatigued })
      : calibrating<{ detected: boolean }>(
          trend.sessions,
          Math.max(MIN_LONG_SESSIONS_FOR_FATIGUE, trend.sessions),
        )),
    validation,
  };
  const report = withFatigue(baseReport, fatigue, trend.sessions, trend.accuracyDrop);

  // Ritmo y constancia
  const pace: StudentModel['pace'] =
    facts.answers.length >= INSIGHT_MINIMUMS.answers
      ? ready({ secondsPerItem: Math.round(median(facts.answers.map((a) => a.msToAnswer / 1000))) })
      : calibrating(facts.answers.length, INSIGHT_MINIMUMS.answers);
  const windowStart = addDays(today, -(CONSISTENCY_DAYS - 1));
  const consistency: StudentModel['consistency'] =
    facts.daysSinceStart >= INSIGHT_MINIMUMS.daysSinceStart
      ? ready({
          activeDays30: new Set(facts.studyDays.filter((day) => day >= windowStart && day <= today))
            .size,
        })
      : calibrating(facts.daysSinceStart, INSIGHT_MINIMUMS.daysSinceStart);

  // Carga de repaso. Lo que ya está programado, sin proyectar repasos futuros
  const endOfToday = studyDayEnd(today, input.timeZone).getTime();
  const endOfWindow = studyDayEnd(addDays(today, LOAD_AHEAD_DAYS), input.timeZone).getTime();
  let dueToday = 0;
  let next7 = 0;
  for (const card of cards) {
    if (card.state === null || card.state.state === 'new') continue;
    const due = Date.parse(card.state.due);
    if (due < endOfToday) dueToday += 1;
    else if (due < endOfWindow) next7 += 1;
  }
  const doneIn30 = events.filter(
    (event) =>
      event.type === 'card_reviewed' &&
      daysBetween(studyDayOf(new Date(event.at), input.timeZone), today) < CONSISTENCY_DAYS,
  ).length;
  const reviewsTotal = events.filter((event) => event.type === 'card_reviewed').length;
  const reviewLoad: StudentModel['reviewLoad'] =
    reviewsTotal >= thresholds.daily.minReviewsToMeasure
      ? ready({ dueToday, next7, dailyAverage: Math.round(doneIn30 / CONSISTENCY_DAYS) })
      : calibrating(reviewsTotal, thresholds.daily.minReviewsToMeasure);

  const branchPart = (key: string): PartState<number> => {
    const entry = branchEntries.get(key);
    return entry
      ? masteryPart(entry.state)
      : calibrating(0, thresholds.structure.minResponsesPerCategory);
  };

  const model: StudentModel = {
    asOf: now.toISOString(),
    mastery: {
      byBranch: Object.fromEntries(taxonomy.branches.map((b) => [b.key, branchPart(b.key)])),
      byTopic: Object.fromEntries(
        topicAnalysis.topics.map((entry) => [entry.topic, masteryPart(entry.state)]),
      ),
    },
    ability,
    bias: {
      vocabulary: input.vocabulary ?? 'trap',
      prone,
      baseline: biasAnalysis.tags.some((entry) => entry.tag in populationBias)
        ? 'population'
        : 'chance',
      byTag,
    },
    motives,
    fatigue,
    pace,
    consistency,
    reviewLoad,
    reinforce: weak.map((priority) => ({
      key: priority.topic,
      priority: priority.priority,
      why: priority.action === 'review_cards' ? 'cards_fading' : 'low_mastery',
      action: priority.action,
      populationHard: hard.has(priority.topic),
    })),
  };
  return { model, responses, topics, branches: branchEntries, report, weakTopics };
}
