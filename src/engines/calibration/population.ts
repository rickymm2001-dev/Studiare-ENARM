/**
 * Población (B14, 3.7 del plan de B14). Lo que se mejora para todos.
 *
 * Qué hace. Con los datos de los alumnos con permiso arma los números de la población que lee
 * population_baselines. Los temas que más cuestan, la línea base de atracción de cada sesgo, el reparto
 * de motivos de error por rama, las tasas de los indicadores de conducta, el estado del detector de
 * fatiga y los conteos de preguntas por estado. Todo son números con llaves de la taxonomía.
 * Entradas. Los primeros intentos válidos, las respuestas, las opciones que se mostraron, los motivos
 * reportados, la dificultad publicada, el banco y el estado de la validación de fatiga.
 * Salidas. PopulationData, y en counts cuántos datos se publicaron y cuántos se quedaron fuera.
 * Método
 *   - Ningún dato sale con menos de populationMinStudents alumnos (30, y nunca menos). Es la promesa de
 *     privacidad. Lo que no llega al mínimo no se publica
 *   - Temas. Por rama y tema, alumnos distintos, acierto medio en primeros intentos y dificultad
 *     publicada media de las preguntas del tema que tienen una
 *   - Sesgos. populationBaseline con el método error_share (D-051) sobre los primeros intentos con su
 *     pantalla de opciones. students es cuántos alumnos tuvieron un error con la etiqueta a la vista
 *   - Motivos. El reparto de los siete motivos por rama con motivesByGroup, de alumnos que reportaron
 *   - Indicadores de conducta. Los siete de bias.ts con los hechos de cada respuesta en su sesión. La
 *     posición sale del orden de las opciones mostradas. El primer intento de una respuesta cambiada se
 *     supone el contrario del final, porque la noche solo recibe cuántos cambios hubo (J)
 * Umbrales. 30 alumnos por dato y los de conducta de los umbrales.
 */
import { MIN_PRIVACY_GROUP, type ModelSettings } from '@/config/modelSettings';
import type { Thresholds } from '@/config/thresholds';
import type { CalibrationState } from '@/data/model/contracts';
import {
  countBehaviorIndicators,
  populationBaseline,
  type BehaviorIndicatorKey,
  type BiasExposure,
  type ResponseFacts,
} from '@/engines/bias';
import { personalPace, responseSignals } from '@/engines/behavior';
import { ERROR_MOTIVES, motivesByGroup } from '@/engines/errorCauses';
import { chronological, indexExposures, lastBefore } from './firstAttempts';
import { motiveOfStored } from './motives';
import type {
  AnswerRow,
  BankItemRow,
  ExposureRow,
  FatigueValidation,
  FirstAttempt,
  ItemResult,
  MotiveRow,
  PopulationData,
} from './types';

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function buildPopulation(input: {
  attempts: readonly FirstAttempt[];
  answers: readonly AnswerRow[];
  exposures: readonly ExposureRow[];
  motives: readonly MotiveRow[];
  items: readonly ItemResult[];
  bank: ReadonlyMap<string, BankItemRow>;
  fatigue: FatigueValidation;
  thresholds: Pick<Thresholds, 'behavior'>;
  settings: Pick<ModelSettings, 'thresholds'>;
}): { population: PopulationData; counts: Record<string, number> } {
  // El piso de privacidad vale aunque llegue un ajuste más bajo
  const minStudents = Math.max(input.settings.thresholds.populationMinStudents, MIN_PRIVACY_GROUP);
  const population: PopulationData = {
    bias: {},
    motives: {},
    topics: {},
    indicators: {},
    fatigue: {
      state: input.fatigue.state,
      students: input.fatigue.students,
      longSessions: input.fatigue.longSessions,
    },
    items: { physician_estimate: 0, provisional: 0, calibrated: 0 },
  };

  // ------------------------------------------------------------------ Preguntas por estado
  const stateOf = new Map<string, CalibrationState>(
    input.items.map((item) => [item.versionId, item.state]),
  );
  for (const item of input.bank.values()) {
    if (item.current) population.items[stateOf.get(item.versionId) ?? 'physician_estimate'] += 1;
  }

  // ------------------------------------------------------------------ Temas que más cuestan
  const difficultyOf = new Map(input.items.map((item) => [item.versionId, item.difficulty]));
  const topics = new Map<
    string,
    { students: Set<string>; correct: number; total: number; versions: Set<string> }
  >();
  for (const attempt of input.attempts) {
    const item = input.bank.get(attempt.versionId);
    if (!item) continue;
    const key = `${item.branch}/${item.topic}`;
    const entry = topics.get(key) ?? {
      students: new Set<string>(),
      correct: 0,
      total: 0,
      versions: new Set<string>(),
    };
    entry.students.add(attempt.person);
    entry.total += 1;
    if (attempt.correct) entry.correct += 1;
    entry.versions.add(attempt.versionId);
    topics.set(key, entry);
  }
  for (const key of [...topics.keys()].sort()) {
    const entry = topics.get(key) as NonNullable<ReturnType<typeof topics.get>>;
    if (entry.students.size < minStudents) continue;
    const difficulties = [...entry.versions]
      .map((version) => difficultyOf.get(version))
      .filter((value): value is number => typeof value === 'number');
    population.topics[key] = {
      students: entry.students.size,
      accuracy: round(entry.correct / entry.total, 4),
      difficulty:
        difficulties.length === 0
          ? null
          : round(difficulties.reduce((sum, value) => sum + value, 0) / difficulties.length, 3),
    };
  }

  // ------------------------------------------------------------------ Sesgos
  const exposuresByPerson = new Map<string, BiasExposure[]>();
  for (const attempt of input.attempts) {
    if (attempt.exposed === null) continue;
    const item = input.bank.get(attempt.versionId);
    if (!item) continue;
    const tagOf = new Map(item.options.map((option) => [option.id, option.tag]));
    const correctIds = new Set(item.options.filter((o) => o.correct).map((o) => o.id));
    const visibleTags = attempt.exposed.flatMap((id) => {
      const tag = tagOf.get(id);
      return !correctIds.has(id) && tag ? [tag] : [];
    });
    const chosenTag = attempt.correct ? null : (tagOf.get(attempt.optionId) ?? null);
    const list = exposuresByPerson.get(attempt.person) ?? [];
    list.push({ visibleTags, chosenTag });
    exposuresByPerson.set(attempt.person, list);
  }
  const baseline = populationBaseline([...exposuresByPerson.values()], 'real', 'error_share');
  const studentsByTag = new Map<string, number>();
  for (const exposures of exposuresByPerson.values()) {
    const tags = new Set<string>();
    for (const exposure of exposures) {
      // En error_share solo cuentan las preguntas falladas
      if (exposure.chosenTag === null) continue;
      for (const tag of exposure.visibleTags) tags.add(tag);
      tags.add(exposure.chosenTag);
    }
    for (const tag of tags) studentsByTag.set(tag, (studentsByTag.get(tag) ?? 0) + 1);
  }
  for (const tag of Object.keys(baseline.attraction).sort()) {
    const students = studentsByTag.get(tag) ?? 0;
    if (students < minStudents) continue;
    population.bias[tag] = { students, rate: round(baseline.attraction[tag] ?? 0, 4) };
  }

  // ------------------------------------------------------------------ Motivos de error por rama
  const reportedBy = new Map<string, Set<string>>();
  const motiveItems: { group: string; motive: (typeof ERROR_MOTIVES)[number] }[] = [];
  for (const row of input.motives) {
    const motive = motiveOfStored(row.motive);
    if (motive === null || row.branch === null) continue;
    motiveItems.push({ group: row.branch, motive });
    const persons = reportedBy.get(row.branch) ?? new Set<string>();
    persons.add(row.person);
    reportedBy.set(row.branch, persons);
  }
  for (const group of motivesByGroup(motiveItems).sort((a, b) => a.group.localeCompare(b.group))) {
    if ((reportedBy.get(group.group)?.size ?? 0) < minStudents) continue;
    const shares: Record<string, number> = { reports: group.total };
    for (const motive of ERROR_MOTIVES) {
      const count = group.motives.find((entry) => entry.motive === motive)?.count ?? 0;
      shares[motive] = round(count / group.total, 4);
    }
    population.motives[group.group] = shares;
  }

  // ------------------------------------------------------------------ Indicadores de conducta
  const exposureIndex = indexExposures(input.exposures);
  const byPerson = new Map<string, AnswerRow[]>();
  for (const answer of [...input.answers].sort(chronological)) {
    if (answer.session === null) continue;
    const list = byPerson.get(answer.person) ?? [];
    list.push(answer);
    byPerson.set(answer.person, list);
  }
  const factsByPerson: ResponseFacts[][] = [];
  for (const answers of byPerson.values()) {
    const rows: {
      answer: AnswerRow;
      position: number;
      correctPosition: number;
      shown: number;
      words: number;
    }[] = [];
    for (const answer of answers) {
      const item = input.bank.get(answer.versionId);
      const shown = lastBefore(
        exposureIndex.get(`${answer.person}|${answer.versionId}`),
        answer.seq,
      );
      if (!item || !shown || answer.ms === null) continue;
      const position = shown.options.indexOf(answer.optionId);
      const correctPosition = shown.options.findIndex(
        (id) => item.options.find((option) => option.id === id)?.correct === true,
      );
      if (position < 0 || correctPosition < 0) continue;
      const optionWords = new Map(item.options.map((option) => [option.id, option.words]));
      rows.push({
        answer,
        position,
        correctPosition,
        shown: shown.options.length,
        words: item.words + shown.options.reduce((sum, id) => sum + (optionWords.get(id) ?? 0), 0),
      });
    }
    if (rows.length === 0) continue;
    const pace = personalPace(
      rows.map((row) => ({ msToAnswer: row.answer.ms ?? 0, words: Math.max(row.words, 1) })),
      input.thresholds.behavior,
    );
    const orderInSession = new Map<string, number>();
    factsByPerson.push(
      rows.map((row): ResponseFacts => {
        const session = row.answer.session as string;
        const order = orderInSession.get(session) ?? 0;
        orderInSession.set(session, order + 1);
        const changed = row.answer.changes > 0;
        return {
          sessionId: session,
          order,
          correct: row.answer.correct,
          confidence: row.answer.confidence,
          chosenPosition: row.position,
          correctPosition: row.correctPosition,
          shownCount: row.shown,
          firstChoiceCorrect: changed ? !row.answer.correct : row.answer.correct,
          changed,
          timeZ: responseSignals(
            { msToAnswer: row.answer.ms ?? 0, words: Math.max(row.words, 1) },
            pace,
            input.thresholds.behavior,
          ).timeZ,
        };
      }),
    );
  }
  const totals = new Map<BehaviorIndicatorKey, { k: number; n: number; students: number }>();
  for (const facts of factsByPerson) {
    const counts = countBehaviorIndicators(facts);
    for (const key of Object.keys(counts) as BehaviorIndicatorKey[]) {
      const count = counts[key];
      const total = totals.get(key) ?? { k: 0, n: 0, students: 0 };
      total.k += count.k;
      total.n += count.n;
      if (count.n > 0) total.students += 1;
      totals.set(key, total);
    }
  }
  for (const key of [...totals.keys()].sort()) {
    const total = totals.get(key) as NonNullable<ReturnType<typeof totals.get>>;
    if (total.students < minStudents || total.n === 0) continue;
    population.indicators[key] = { students: total.students, rate: round(total.k / total.n, 4) };
  }

  return {
    population,
    counts: {
      populationTopics: Object.keys(population.topics).length,
      populationBiasTags: Object.keys(population.bias).length,
      populationMotiveBranches: Object.keys(population.motives).length,
      populationIndicators: Object.keys(population.indicators).length,
    },
  };
}
