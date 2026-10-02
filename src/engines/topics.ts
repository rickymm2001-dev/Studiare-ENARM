/**
 * Análisis por tema (7.3) y por estructura de pregunta (7.5).
 *
 * Qué hace. Estima el dominio de cada tema con un modelo beta-binomial que encoge hacia la media
 * de su rama, y elige los 5 temas a reforzar con su porqué y una acción. Con la misma técnica
 * estima el dominio por categoría de estructura (polaridad y tarea).
 * Entradas. Respuestas con el tema de la respuesta correcta (que es el tema de la pregunta), la
 * taxonomía con pesos del ENARM, la retrievability promedio de las tarjetas de cada tema y los
 * umbrales.
 * Salidas. Por tema, dominio con intervalo creíble de 95% o calibrando con cuántas respuestas
 * faltan. Los temas a reforzar con prioridad, porqué y acción. Por categoría de estructura, lo
 * mismo con su mínimo de respuestas.
 * Método
 *   - Prior Beta con la media de la rama y fuerza de 10 respuestas (motor stats/betaBinomial)
 *   - Prioridad = (1 − dominio) × peso del tema en el ENARM × factor de olvido. El peso del tema es
 *     el peso de su rama por su peso relativo dentro de la rama. El factor de olvido es 2 − R̄, con
 *     R̄ la retrievability promedio de sus tarjetas, entre 1 y 2. Sin tarjetas el factor es 1 (J)
 *   - Acción. Repasar sus tarjetas si R̄ < 0.85, simulador del tema si el dominio es menor a 0.6, y
 *     si no, un reto del tema (J)
 * Umbrales. Intervalo menor a 0.25, fuerza del prior de 10, 5 temas, y 20 respuestas por
 * categoría de estructura (J, configurables).
 */
import type { Thresholds } from '@/config/thresholds';
import type { TopicTaxonomy } from '@/data/schemas/content';
import { pooledMean, shrinkTally, type ShrunkEstimate, type Tally } from './stats/betaBinomial';

export interface TopicResponse {
  branch: string;
  topic: string;
  correct: boolean;
}

export type MasteryState =
  | { kind: 'calibrating'; responses: number; responsesNeeded: number }
  | { kind: 'ready'; mastery: number; lower: number; upper: number; responses: number };

export interface TopicMastery {
  branch: string;
  topic: string;
  tally: Tally;
  estimate: ShrunkEstimate;
  state: MasteryState;
  /** Peso del tema en el ENARM, entre 0 y 1, sumando 1 en toda la taxonomía */
  examWeight: number;
}

export type TopicAction = 'review_cards' | 'topic_simulator' | 'challenge';

export interface TopicPriority {
  branch: string;
  topic: string;
  priority: number;
  /** Datos del porqué, que la interfaz convierte en una línea */
  reason: { mastery: number; examWeight: number; averageRetrievability: number | null };
  action: TopicAction;
}

export interface TopicAnalysis {
  topics: TopicMastery[];
  priorities: TopicPriority[];
  /** Temas que siguen calibrando y por eso no entran a las prioridades */
  calibrating: number;
}

function stateOf(tally: Tally, estimate: ShrunkEstimate): MasteryState {
  return estimate.reliable
    ? {
        kind: 'ready',
        mastery: estimate.mean,
        lower: estimate.lower,
        upper: estimate.upper,
        responses: tally.trials,
      }
    : { kind: 'calibrating', responses: tally.trials, responsesNeeded: estimate.responsesNeeded };
}

/** Peso de cada tema en el ENARM. Peso de su rama por su peso relativo dentro de la rama */
export function topicExamWeights(taxonomy: TopicTaxonomy): Map<string, number> {
  const totalBranchWeight = taxonomy.branches.reduce((sum, branch) => sum + branch.weight, 0);
  const weights = new Map<string, number>();
  for (const branch of taxonomy.branches) {
    const totalTopicWeight = branch.topics.reduce((sum, topic) => sum + topic.weight, 0);
    for (const topic of branch.topics) {
      weights.set(
        `${branch.key}/${topic.key}`,
        (branch.weight / totalBranchWeight) * (topic.weight / totalTopicWeight),
      );
    }
  }
  return weights;
}

export function analyzeTopics(input: {
  responses: readonly TopicResponse[];
  taxonomy: TopicTaxonomy;
  /** Retrievability promedio de las tarjetas de cada tema, con llave rama/tema */
  averageRetrievability: Readonly<Record<string, number>>;
  thresholds: Thresholds['topics'];
}): TopicAnalysis {
  const { thresholds } = input;
  const weights = topicExamWeights(input.taxonomy);
  const tallies = new Map<string, Tally>();
  for (const response of input.responses) {
    const key = `${response.branch}/${response.topic}`;
    const tally = tallies.get(key) ?? { successes: 0, trials: 0 };
    tally.trials += 1;
    if (response.correct) tally.successes += 1;
    tallies.set(key, tally);
  }

  const topics: TopicMastery[] = [];
  for (const branch of input.taxonomy.branches) {
    const branchTallies = branch.topics.map(
      (topic) => tallies.get(`${branch.key}/${topic.key}`) ?? { successes: 0, trials: 0 },
    );
    const branchMean = pooledMean(branchTallies, pooledMean([...tallies.values()]));
    branch.topics.forEach((topic, index) => {
      const tally = branchTallies[index] as Tally;
      const estimate = shrinkTally(tally, branchMean, thresholds);
      topics.push({
        branch: branch.key,
        topic: topic.key,
        tally,
        estimate,
        state: stateOf(tally, estimate),
        examWeight: weights.get(`${branch.key}/${topic.key}`) ?? 0,
      });
    });
  }

  const priorities = topics
    .filter((topic) => topic.state.kind === 'ready')
    .map((topic): TopicPriority => {
      const key = `${topic.branch}/${topic.topic}`;
      const r = input.averageRetrievability[key] ?? null;
      const forgettingFactor = r === null ? 1 : 2 - r;
      const mastery = topic.estimate.mean;
      const action: TopicAction =
        r !== null && r < 0.85 ? 'review_cards' : mastery < 0.6 ? 'topic_simulator' : 'challenge';
      return {
        branch: topic.branch,
        topic: topic.topic,
        priority: (1 - mastery) * topic.examWeight * forgettingFactor,
        reason: { mastery, examWeight: topic.examWeight, averageRetrievability: r },
        action,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.topic.localeCompare(b.topic))
    .slice(0, thresholds.topN);

  return {
    topics,
    priorities,
    calibrating: topics.filter((topic) => topic.state.kind === 'calibrating').length,
  };
}

export interface CategoryMastery {
  category: string;
  tally: Tally;
  estimate: ShrunkEstimate;
  state: MasteryState;
}

/**
 * Dominio por categoría de estructura (7.5), por alumno o agregado. Calibra hasta tener el mínimo
 * de respuestas por categoría y hasta cumplir la regla del intervalo
 */
export function analyzeCategories(input: {
  responses: readonly { category: string; correct: boolean }[];
  thresholds: Thresholds['topics'];
  minResponsesPerCategory: number;
}): CategoryMastery[] {
  const tallies = new Map<string, Tally>();
  for (const response of input.responses) {
    const tally = tallies.get(response.category) ?? { successes: 0, trials: 0 };
    tally.trials += 1;
    if (response.correct) tally.successes += 1;
    tallies.set(response.category, tally);
  }
  const mean = pooledMean([...tallies.values()]);
  return [...tallies.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, tally]) => {
      const estimate = shrinkTally(tally, mean, input.thresholds);
      const missingByCount = Math.max(0, input.minResponsesPerCategory - tally.trials);
      const state: MasteryState =
        missingByCount === 0 && estimate.reliable
          ? stateOf(tally, estimate)
          : {
              kind: 'calibrating',
              responses: tally.trials,
              responsesNeeded: Math.max(missingByCount, estimate.responsesNeeded),
            };
      return { category, tally, estimate, state };
    });
}
