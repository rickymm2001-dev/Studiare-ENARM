// Recuperación de parámetros (14.2). Con los alumnos simulados se conoce la verdad, así que los
// motores reales deben recuperarla. Calcula cada meta con números reales, se cumplan o no.
import { DEFAULT_THRESHOLDS, type Thresholds } from '@/config/thresholds';
import type { TopicTaxonomy } from '@/data/schemas/content';
import { analyzeBias, populationBaseline, type BiasExposure } from '@/engines/bias';
import { fatigueSignal, negationSignal, type ResponseRecord } from '@/engines/behavior';
import { physicianToLogit, updateElo, type EloEntity } from '@/engines/difficulty';
import { estimateRasch } from '@/engines/rasch';
import { pearson } from '@/engines/stats/correlation';
import { analyzeTopics } from '@/engines/topics';
import type { Cohort } from './cohort';
import { effectiveAbility, sigmoid, type SimItem } from './model';
import type { SimResponse } from './simulate';

export interface DetectionResult {
  seeded: number;
  detected: number;
  /** Detectados entre los sembrados */
  sensitivity: number;
  notSeeded: number;
  flagged: number;
  /** Marcados entre los que no tienen nada sembrado */
  falsePositiveRate: number;
}

type BiasVariant = DetectionResult & { falsePositivePairRate: number };

export interface RecoveryReport {
  students: number;
  responses: number;
  items: number;
  rasch: { correlation: number; converged: boolean; iterations: number; excludedItems: number };
  elo: { correlation: number };
  bias: DetectionResult & {
    /** Pares alumno y etiqueta sin propensión marcados, entre todos esos pares evaluados */
    falsePositivePairRate: number;
    /** Variante propuesta que compara la parte de sus errores que va a cada etiqueta */
    errorShare: DetectionResult & { falsePositivePairRate: number };
    /** La variante anterior con corrección de Bonferroni por el número de etiquetas evaluadas */
    errorShareCorrected: DetectionResult & { falsePositivePairRate: number };
  };
  topics: { rmseRaw: number; rmseShrunk: number; reduction: number; cells: number };
  misread: DetectionResult;
  fatigue: DetectionResult;
}

const detection = (rows: readonly { seeded: boolean; flagged: boolean }[]): DetectionResult => {
  const seeded = rows.filter((row) => row.seeded);
  const others = rows.filter((row) => !row.seeded);
  const detected = seeded.filter((row) => row.flagged).length;
  const flagged = others.filter((row) => row.flagged).length;
  return {
    seeded: seeded.length,
    detected,
    sensitivity: seeded.length === 0 ? 0 : detected / seeded.length,
    notSeeded: others.length,
    flagged,
    falsePositiveRate: others.length === 0 ? 0 : flagged / others.length,
  };
};

const exposureOf = (response: SimResponse): BiasExposure => ({
  visibleTags: response.shown
    .filter((option) => !option.isCorrect)
    .map((option) => option.biasTag ?? ''),
  chosenTag: response.chosenTag,
});

export function computeRecovery(
  cohort: Cohort,
  items: readonly SimItem[],
  taxonomy: TopicTaxonomy,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): RecoveryReport {
  const students = cohort.students;
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const allResponses = students.flatMap((student) =>
    student.history.responses.map((response) => ({ student, response })),
  );

  // Rasch con todas las respuestas
  const rasch = estimateRasch(
    allResponses.map(({ student, response }) => ({
      person: student.userId,
      item: response.itemKey,
      correct: response.correct,
    })),
  );
  const raschKeys = Object.keys(rasch.items);
  const raschCorrelation = pearson(
    raschKeys.map((key) => cohort.difficulties[key] ?? 0),
    raschKeys.map((key) => rasch.items[key]?.difficulty ?? 0),
  );
  const expectedOf = (userId: string, itemKey: string) => {
    const person = rasch.persons[userId];
    const item = rasch.items[itemKey];
    return person && item ? sigmoid(person.ability - item.difficulty) : 0.6;
  };

  // Elo en línea, en orden de tiempo, desde la dificultad del médico
  const ordered = [...allResponses].sort((a, b) => a.response.at.localeCompare(b.response.at));
  const studentElo = new Map<string, EloEntity>();
  const itemElo = new Map<string, EloEntity>();
  for (const { student, response } of ordered) {
    const item = itemElo.get(response.itemKey) ?? {
      rating: physicianToLogit(itemByKey.get(response.itemKey)?.physicianDifficulty ?? 3),
      responses: 0,
    };
    const result = updateElo({
      student: studentElo.get(student.userId) ?? { rating: 0, responses: 0 },
      item,
      correct: response.correct,
    });
    studentElo.set(student.userId, result.student);
    itemElo.set(response.itemKey, result.item);
  }
  const eloKeys = [...itemElo.keys()];
  const eloCorrelation = pearson(
    eloKeys.map((key) => cohort.difficulties[key] ?? 0),
    eloKeys.map((key) => itemElo.get(key)?.rating ?? 0),
  );

  // Sesgos con el motor real y la línea base de la propia cohorte
  const exposures = students.map((student) => student.history.responses.map(exposureOf));
  const variants = [
    { method: 'exposure' as const, familywise: false },
    { method: 'error_share' as const, familywise: false },
    { method: 'error_share' as const, familywise: true },
  ].map((variant) => {
    const baseline = populationBaseline(exposures, 'simulated', variant.method);
    const rows: { seeded: boolean; flagged: boolean }[] = [];
    let pairs = 0;
    let pairFlags = 0;
    students.forEach((student, index) => {
      const analysis = analyzeBias({
        exposures: exposures[index] ?? [],
        baseline,
        thresholds: thresholds.bias,
        method: variant.method,
        familywise: variant.familywise,
      });
      const seededTags = Object.keys(student.truth.biasPropensity);
      const seeded = seededTags.length > 0;
      rows.push({
        seeded,
        flagged: seeded
          ? seededTags.some((tag) => analysis.patterns.includes(tag))
          : analysis.patterns.length > 0,
      });
      for (const tag of analysis.tags) {
        if (seededTags.includes(tag.tag)) continue;
        pairs += 1;
        if (analysis.patterns.includes(tag.tag)) pairFlags += 1;
      }
    });
    return { ...detection(rows), falsePositivePairRate: pairs === 0 ? 0 : pairFlags / pairs };
  });

  // Temas. Error del dominio crudo y del encogido contra la exactitud verdadera del tema
  let squaredRaw = 0;
  let squaredShrunk = 0;
  let cells = 0;
  const itemsByTopic = new Map<string, SimItem[]>();
  for (const item of items) {
    const key = `${item.branch}/${item.topic}`;
    itemsByTopic.set(key, [...(itemsByTopic.get(key) ?? []), item]);
  }
  for (const student of students) {
    // Primeras 150 respuestas, cuando el encogimiento más importa
    const sample = student.history.responses.slice(0, 150);
    const analysis = analyzeTopics({
      responses: sample.map((response) => ({
        branch: response.branch,
        topic: response.topic,
        correct: response.correct,
      })),
      taxonomy,
      averageRetrievability: {},
      thresholds: thresholds.topics,
    });
    for (const topic of analysis.topics) {
      if (topic.tally.trials === 0) continue;
      const topicItems = itemsByTopic.get(`${topic.branch}/${topic.topic}`) ?? [];
      if (topicItems.length === 0) continue;
      const truth =
        topicItems.reduce(
          (sum, item) =>
            sum +
            sigmoid(
              effectiveAbility(student.truth, item, 0) - (cohort.difficulties[item.key] ?? 0),
            ),
          0,
        ) / topicItems.length;
      squaredRaw += (topic.tally.successes / topic.tally.trials - truth) ** 2;
      squaredShrunk += (topic.estimate.mean - truth) ** 2;
      cells += 1;
    }
  }
  const rmseRaw = Math.sqrt(squaredRaw / Math.max(cells, 1));
  const rmseShrunk = Math.sqrt(squaredShrunk / Math.max(cells, 1));

  // Mala lectura y fatiga con la probabilidad esperada de Rasch
  const misreadRows: { seeded: boolean; flagged: boolean }[] = [];
  const fatigueRows: { seeded: boolean; flagged: boolean }[] = [];
  for (const student of students) {
    const responses = student.history.responses;
    const signal = negationSignal(
      responses.map((response) => ({
        polarity: response.polarity,
        correct: response.correct,
        expected: expectedOf(student.userId, response.itemKey),
      })),
      thresholds.structure.minResponsesPerCategory,
    );
    misreadRows.push({
      seeded: student.truth.negationMisread >= 0.2,
      flagged: signal.misreads === true,
    });
    const records: ResponseRecord[] = responses.map((response, index) => ({
      id: String(index),
      sessionId: response.session,
      at: response.at,
      msToAnswer: response.msToAnswer,
      words: response.words,
      correct: response.correct,
      confidence: response.confidence,
      expected: expectedOf(student.userId, response.itemKey),
      changes: [],
      minuteInSession: response.minuteInSession,
    }));
    fatigueRows.push({
      seeded: student.truth.fatigue !== null,
      flagged: fatigueSignal(records, thresholds.behavior).fatigued === true,
    });
  }

  return {
    students: students.length,
    responses: allResponses.length,
    items: items.length,
    rasch: {
      correlation: raschCorrelation,
      converged: rasch.converged,
      iterations: rasch.iterations,
      excludedItems: rasch.excludedItems.length,
    },
    elo: { correlation: eloCorrelation },
    bias: {
      ...(variants[0] as BiasVariant),
      errorShare: variants[1] as BiasVariant,
      errorShareCorrected: variants[2] as BiasVariant,
    },
    topics: { rmseRaw, rmseShrunk, reduction: rmseRaw === 0 ? 0 : 1 - rmseShrunk / rmseRaw, cells },
    misread: detection(misreadRows),
    fatigue: detection(fatigueRows),
  };
}
