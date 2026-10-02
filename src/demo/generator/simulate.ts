// Simula el historial de un alumno día por día (11.2, 11.3). Sesiones de preguntas con opciones
// muestreadas por el motor real y repasos de tarjetas programados por el motor real de FSRS.
// Funciones puras con semilla. El reloj de la simulación es un parámetro.
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import {
  retrievabilityOf,
  scheduleReview,
  type FsrsRating,
  type SchedulerConfig,
} from '@/engines/fsrs';
import { createRng, type Rng } from '@/engines/random';
import { sampleOptions } from '@/engines/sampler';
import { addDays, studyDayOf, studyDayStart } from '@/engines/studyDay';
import { effectiveAbility, respond, sigmoid, type SimItem, type StudentTruth } from './model';

export const SIM_TIME_ZONE = 'America/Merida';

export interface SimResponse {
  /** Sesión local de la simulación, por ejemplo s12 */
  session: string;
  /** Orden dentro de la sesión, desde 0 */
  order: number;
  itemKey: string;
  versionId: string;
  branch: string;
  topic: string;
  polarity: SimItem['polarity'];
  shownAt: string;
  at: string;
  minuteInSession: number;
  shown: { optionId: string; position: number; biasTag: string | null; isCorrect: boolean }[];
  correctPosition: number;
  chosenOptionId: string;
  chosenPosition: number;
  chosenTag: string | null;
  correct: boolean;
  previousOptionIds: string[];
  msToAnswer: number;
  confidence: 'guessed' | 'unsure' | 'sure';
  words: number;
  samplingSeed: string;
  /** Solo para las pruebas. Lo que pasó por dentro del modelo */
  truth: { misread: boolean; probability: number };
}

export interface SimSession {
  id: string;
  kind: 'practice' | 'review';
  startedAt: string;
  endedAt: string;
}

/** Tarjeta sintética mientras no existan los mazos (D-050) */
export interface SimCard {
  key: string;
  branch: string;
  topic: string;
  /** Dificultad verdadera de recordarla, en logits */
  difficulty: number;
}

export interface SimCardReview {
  session: string;
  cardKey: string;
  at: string;
  rating: FsrsRating;
  confidence: 'dont_know' | 'unsure' | 'sure';
  msToReveal: number;
  msToRate: number;
  stateBefore: FsrsCardState | null;
  stateAfter: FsrsCardState;
}

export interface SimHistory {
  sessions: SimSession[];
  responses: SimResponse[];
  reviews: SimCardReview[];
  /** Días de estudio en que hubo actividad */
  activeDays: string[];
}

export interface SimulateOptions {
  /** Primer día de estudio AAAA-MM-DD */
  startDay: string;
  days: number;
  items: readonly SimItem[];
  /** Dificultad verdadera de cada pregunta por clave */
  difficulties: Readonly<Record<string, number>>;
  /** Probabilidad de hacer una sesión de preguntas en un día de estudio */
  questionSessionChance: number;
  cards: readonly SimCard[];
  newCardsPerDay: number;
  examDate: string | null;
  /** Opciones mostradas por pregunta */
  optionsShown?: number;
  /**
   * Momento UTC después del cual no puede haber nada. Al generar la demo es ahora, para que la
   * bitácora no tenga eventos en el futuro. Se descartan las sesiones que terminan después
   */
  notAfter?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Momento UTC de una hora local de Mérida, que no tiene horario de verano (UTC−6) */
function localTime(day: string, hour: number, minute: number): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hour + 6, minute));
}

/** Elige la siguiente pregunta. Primero las menos vistas por este alumno, al azar entre ellas */
function nextItem(
  rng: Rng,
  items: readonly SimItem[],
  seen: Map<string, number>,
  avoid: string | null,
) {
  let min = Number.POSITIVE_INFINITY;
  for (const item of items) min = Math.min(min, seen.get(item.key) ?? 0);
  const candidates = items.filter(
    (item) => (seen.get(item.key) ?? 0) === min && item.key !== avoid,
  );
  return rng.pick(candidates.length > 0 ? candidates : items);
}

function simulateQuestionSession(input: {
  rng: Rng;
  truth: StudentTruth;
  options: SimulateOptions;
  sessionId: string;
  start: Date;
  seen: Map<string, number>;
  out: SimResponse[];
}): Date {
  const { rng, truth, options, sessionId, seen, out } = input;
  const minutes = clamp(rng.normal(truth.sessionMinutes.mean, truth.sessionMinutes.sd), 10, 90);
  const positionCounts = Array.from({ length: options.optionsShown ?? 4 }, () => 0);
  let clock = input.start.getTime();
  let order = 0;
  let previous: string | null = null;
  while ((clock - input.start.getTime()) / 60000 < minutes) {
    const item = nextItem(rng, options.items, seen, previous);
    previous = item.key;
    seen.set(item.key, (seen.get(item.key) ?? 0) + 1);
    const seed = `${sessionId}|${order}`;
    const sample = sampleOptions({
      options: item.options.map((option) => ({
        id: option.id,
        isCorrect: option.isCorrect,
        biasTag: option.biasTag,
      })),
      canonicalOptionIds: item.canonicalOptionIds,
      mode: 'diverse',
      count: options.optionsShown ?? 4,
      seed,
      correctPositionCounts: positionCounts,
    });
    positionCounts[sample.correctPosition] = (positionCounts[sample.correctPosition] ?? 0) + 1;
    const byId = new Map(item.options.map((option) => [option.id, option]));
    const shown = sample.shown.map(
      (entry) => byId.get(entry.optionId) as SimItem['options'][number],
    );
    const shownAt = clock;
    const minuteInSession = (clock - input.start.getTime()) / 60000;
    const outcome = respond({
      rng,
      truth,
      item,
      difficulty: options.difficulties[item.key] ?? 0,
      shown,
      minuteInSession,
    });
    clock += outcome.msToAnswer;
    const chosenPosition =
      sample.shown.find((entry) => entry.optionId === outcome.chosenOptionId)?.position ?? 0;
    out.push({
      session: sessionId,
      order,
      itemKey: item.key,
      versionId: item.versionId,
      branch: item.branch,
      topic: item.topic,
      polarity: item.polarity,
      shownAt: new Date(shownAt).toISOString(),
      at: new Date(clock).toISOString(),
      minuteInSession,
      shown: sample.shown.map((entry) => {
        const option = byId.get(entry.optionId) as SimItem['options'][number];
        return {
          optionId: entry.optionId,
          position: entry.position,
          biasTag: option.biasTag,
          isCorrect: option.isCorrect,
        };
      }),
      correctPosition: sample.correctPosition,
      chosenOptionId: outcome.chosenOptionId,
      chosenPosition,
      chosenTag: outcome.chosenTag,
      correct: outcome.correct,
      previousOptionIds: outcome.previousOptionIds,
      msToAnswer: outcome.msToAnswer,
      confidence: outcome.confidence,
      words: item.stemWords + shown.reduce((sum, option) => sum + option.words, 0),
      samplingSeed: seed,
      truth: { misread: outcome.misread, probability: outcome.modelProbability },
    });
    // Lee la retroalimentación antes de la siguiente
    clock += Math.round(rng.next() * 15000 + 5000);
    order += 1;
  }
  return new Date(clock);
}

function simulateReviewSession(input: {
  rng: Rng;
  truth: StudentTruth;
  options: SimulateOptions;
  sessionId: string;
  start: Date;
  day: string;
  states: Map<string, FsrsCardState>;
  introduced: { count: number };
  out: SimCardReview[];
}): Date {
  const { rng, truth, options, states, out } = input;
  const config: SchedulerConfig = {
    desiredRetention: 0.9,
    examDate: options.examDate,
    timeZone: SIM_TIME_ZONE,
    thresholds: DEFAULT_THRESHOLDS.fsrs,
  };
  const dayEnd = studyDayStart(addDays(input.day, 1), SIM_TIME_ZONE).getTime();
  const due = options.cards
    .filter((card) => {
      const state = states.get(card.key);
      return state !== undefined && new Date(state.due).getTime() < dayEnd;
    })
    .slice(0, DEFAULT_THRESHOLDS.fsrs.reviewsPerDay);
  const fresh = options.cards.slice(
    input.introduced.count,
    input.introduced.count + options.newCardsPerDay,
  );
  input.introduced.count += fresh.length;
  let clock = input.start.getTime();
  for (const card of [...due, ...fresh]) {
    const now = new Date(clock);
    const before = states.get(card.key) ?? null;
    const theta = effectiveAbility(truth, card, 0) - card.difficulty;
    const recall =
      before === null
        ? sigmoid(theta - 0.5)
        : sigmoid(
            Math.log(
              Math.max(retrievabilityOf(before, now), 0.01) /
                Math.max(1 - retrievabilityOf(before, now), 0.01),
            ) +
              0.6 * theta,
          );
    const remembered = rng.chance(recall);
    const rating: FsrsRating = !remembered
      ? 'again'
      : rng.chance(0.12)
        ? 'hard'
        : rng.chance(clamp(0.1 + 0.08 * theta, 0.02, 0.35))
          ? 'easy'
          : 'good';
    const outcome = scheduleReview(before, rating, now, config);
    const msToReveal = Math.round(clamp(Math.exp(rng.normal(Math.log(6000), 0.4)), 1200, 60000));
    const msToRate = Math.round(clamp(Math.exp(rng.normal(Math.log(1800), 0.35)), 600, 15000));
    out.push({
      session: input.sessionId,
      cardKey: card.key,
      at: new Date(clock + msToReveal + msToRate).toISOString(),
      rating,
      confidence: recall > 0.8 ? 'sure' : recall > 0.45 ? 'unsure' : 'dont_know',
      msToReveal,
      msToRate,
      stateBefore: before,
      stateAfter: outcome.state,
    });
    states.set(card.key, outcome.state);
    clock += msToReveal + msToRate + Math.round(rng.next() * 3000 + 1000);
  }
  return new Date(clock);
}

/** Historial completo de un alumno con su semilla */
export function simulateStudent(
  seed: string,
  truth: StudentTruth,
  options: SimulateOptions,
): SimHistory {
  const rng = createRng(`student|${seed}`);
  const sessions: SimSession[] = [];
  const responses: SimResponse[] = [];
  const reviews: SimCardReview[] = [];
  const activeDays: string[] = [];
  const seen = new Map<string, number>();
  const states = new Map<string, FsrsCardState>();
  const introduced = { count: 0 };
  for (let index = 0; index < options.days; index += 1) {
    const day = addDays(options.startDay, index);
    if (!rng.chance(truth.consistency)) continue;
    activeDays.push(day);
    const hour = clamp(Math.round(truth.preferredHour + rng.normal(0, 1)), 5, 23);
    let clock = localTime(day, hour, rng.int(0, 59));
    if (options.cards.length > 0) {
      const id = `s${sessions.length}`;
      const start = clock;
      clock = simulateReviewSession({
        rng,
        truth,
        options,
        sessionId: id,
        start,
        day,
        states,
        introduced,
        out: reviews,
      });
      if (clock.getTime() > start.getTime()) {
        sessions.push({
          id,
          kind: 'review',
          startedAt: start.toISOString(),
          endedAt: clock.toISOString(),
        });
        clock = new Date(clock.getTime() + rng.int(2, 20) * 60000);
      }
    }
    if (rng.chance(options.questionSessionChance)) {
      const id = `s${sessions.length}`;
      const start = clock;
      clock = simulateQuestionSession({
        rng,
        truth,
        options,
        sessionId: id,
        start,
        seen,
        out: responses,
      });
      sessions.push({
        id,
        kind: 'practice',
        startedAt: start.toISOString(),
        endedAt: clock.toISOString(),
      });
    }
  }
  if (options.notAfter === undefined) return { sessions, responses, reviews, activeDays };
  // Las sesiones van en orden de tiempo, así que solo se recorta la cola y las cadenas de FSRS
  // de lo que queda siguen completas
  const limit = options.notAfter;
  const kept = sessions.filter((session) => session.endedAt <= limit);
  const keptIds = new Set(kept.map((session) => session.id));
  // Días de estudio locales de Mérida, no fechas UTC
  const lastDay = studyDayOf(new Date(limit), SIM_TIME_ZONE);
  const daysWithSessions = new Set(
    kept.map((session) => studyDayOf(new Date(session.startedAt), SIM_TIME_ZONE)),
  );
  return {
    sessions: kept,
    responses: responses.filter((response) => keptIds.has(response.session)),
    reviews: reviews.filter((review) => keptIds.has(review.session)),
    activeDays: activeDays.filter((day) => day < lastDay || daysWithSessions.has(day)),
  };
}

/** Tarjetas sintéticas por tema, marcadas como tales, mientras no existan los mazos (D-050) */
export function syntheticCards(
  topics: readonly { branch: string; topic: string }[],
  perTopic: number,
  seed: string,
): SimCard[] {
  const rng = createRng(`cards|${seed}`);
  const cards: SimCard[] = [];
  for (let round = 0; round < perTopic; round += 1) {
    for (const { branch, topic } of topics) {
      cards.push({
        key: `synthetic|${topic}|${round + 1}`,
        branch,
        topic,
        difficulty: rng.normal(0, 0.7),
      });
    }
  }
  return cards;
}
