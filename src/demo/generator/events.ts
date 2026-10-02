// Convierte el historial simulado de un alumno en eventos de la bitácora (6.3), con IDs estables.
// Cada evento sale validado por el mismo esquema que usa la app. Los eventos solo se agregan.
import {
  AppEventSchema,
  EVENT_SCHEMA_VERSION,
  type AppEvent,
  type EventPayload,
  type EventType,
} from '@/data/schemas/events';
import { studyDayOf } from '@/engines/studyDay';
import { awardXp, isVolumeAward } from '@/engines/xp';
import type { DemoBank } from '../content/bank';
import { DEMO_CONTENT_TIME, stableUlid } from '../stableId';
import type { SimStudent } from './cohort';
import { SIM_TIME_ZONE, type SimCard } from './simulate';

/** IDs de la baraja y las tarjetas sintéticas mientras no existan los mazos (D-050) */
export const syntheticIds = {
  deck: (seed: string) => stableUlid(`synthetic-deck|${seed}`, DEMO_CONTENT_TIME),
  note: (seed: string, cardKey: string) =>
    stableUlid(`synthetic-note|${seed}|${cardKey}`, DEMO_CONTENT_TIME),
  card: (seed: string, cardKey: string) =>
    stableUlid(`synthetic-card|${seed}|${cardKey}`, DEMO_CONTENT_TIME),
};

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(key(item)) ?? [];
    list.push(item);
    groups.set(key(item), list);
  }
  return groups;
}

interface Builder {
  events: AppEvent[];
  counter: number;
}

function push<T extends EventType>(
  builder: Builder,
  student: SimStudent,
  type: T,
  atMs: number,
  sessionId: string | null,
  payload: EventPayload<T>,
): AppEvent {
  builder.counter += 1;
  const event = AppEventSchema.parse({
    id: stableUlid(`${student.userId}|event|${builder.counter}`, atMs),
    type,
    userId: student.userId,
    at: new Date(atMs).toISOString(),
    tz: SIM_TIME_ZONE,
    schemaVersion: EVENT_SCHEMA_VERSION,
    sessionId,
    payload,
  });
  builder.events.push(event);
  return event;
}

/**
 * Eventos del alumno en orden de tiempo. Sesiones, preguntas mostradas, cambios, respuestas,
 * repasos de tarjetas y XP con el motor real. Los milisegundos se separan para que el orden de
 * los ULID coincida con el orden de los hechos
 */
export function toEvents(input: {
  student: SimStudent;
  bank: DemoBank;
  cards: readonly SimCard[];
  /** IDs de tarjeta y mazo por clave de tarjeta simulada */
  cardRefs: ReadonlyMap<string, { cardId: string; deckId: string }>;
}): AppEvent[] {
  const { student, bank } = input;
  const builder: Builder = { events: [], counter: 0 };
  const sessionIds = new Map(
    student.history.sessions.map((session) => [
      session.id,
      stableUlid(`${student.userId}|session|${session.id}`, Date.parse(session.startedAt)),
    ]),
  );
  const responsesBySession = groupBy(student.history.responses, (response) => response.session);
  const reviewsBySession = groupBy(student.history.reviews, (review) => review.session);
  const cardByKey = new Map(input.cards.map((card) => [card.key, card]));

  // Racha simple para el multiplicador de XP. Días seguidos con actividad
  const activeDays = new Set(student.history.activeDays);
  const volumeByDay = new Map<string, number>();
  const streakOn = (day: string) => {
    let streak = 0;
    let cursor = new Date(`${day}T12:00:00Z`);
    for (;;) {
      cursor = new Date(cursor.getTime() - 86_400_000);
      if (!activeDays.has(cursor.toISOString().slice(0, 10))) return streak;
      streak += 1;
    }
  };
  const award = (
    activity: Parameters<typeof awardXp>[0]['activity'],
    atMs: number,
    sessionId: string,
  ) => {
    const day = studyDayOf(new Date(atMs), SIM_TIME_ZONE);
    const awards = awardXp({
      activity,
      streakDays: streakOn(day),
      volumeXpToday: volumeByDay.get(day) ?? 0,
    });
    let xp = 0;
    awards.forEach((item, index) => {
      if (isVolumeAward(item)) volumeByDay.set(day, (volumeByDay.get(day) ?? 0) + item.amount);
      push(builder, student, 'xp_awarded', atMs + 1 + index, sessionId, {
        amount: item.amount,
        reason: item.reason,
        sourceEventId: item.sourceEventId,
      });
      xp += item.amount;
    });
    return xp;
  };

  for (const session of student.history.sessions) {
    const sessionId = sessionIds.get(session.id) as string;
    const startMs = Date.parse(session.startedAt);
    push(builder, student, 'session_started', startMs, sessionId, {
      kind: session.kind,
      config: { source: 'demo_generator', simulated: true },
    });
    let xp = 0;
    let items = 0;
    let correct = 0;
    let lastMs = startMs;
    if (session.kind === 'practice') {
      for (const response of responsesBySession.get(session.id) ?? []) {
        const entry = bank.byVersionId.get(response.versionId);
        const shownMs = Math.max(Date.parse(response.shownAt), lastMs + 1);
        push(builder, student, 'question_shown', shownMs, sessionId, {
          questionVersionId: response.versionId,
          shownOptions: response.shown.map((option) => ({
            optionVersionId: option.optionId,
            position: option.position,
          })),
          seed: response.samplingSeed.slice(0, 64),
          samplingMode: 'diverse',
          highlightEnabled: true,
          positionInSession: response.order,
        });
        const answerMs = Math.max(Date.parse(response.at), shownMs + 10);
        const sequence = [...response.previousOptionIds, response.chosenOptionId];
        let from: string | null = null;
        sequence.forEach((optionId, index) => {
          const changeMs =
            shownMs + Math.round(((answerMs - shownMs) * (index + 1)) / (sequence.length + 1));
          if (index > 0) {
            push(builder, student, 'answer_changed', changeMs, sessionId, {
              questionVersionId: response.versionId,
              fromOptionVersionId: from,
              toOptionVersionId: optionId,
              msSinceShown: changeMs - shownMs,
            });
          }
          from = optionId;
        });
        const answered = push(builder, student, 'question_answered', answerMs, sessionId, {
          questionVersionId: response.versionId,
          optionVersionId: response.chosenOptionId,
          correct: response.correct,
          confidence: response.confidence,
          msToAnswer: Math.min(response.msToAnswer, 24 * 60 * 60 * 1000),
          changeCount: response.previousOptionIds.length,
          highlightEnabled: true,
        });
        xp += award(
          {
            kind: 'mcq',
            correct: response.correct,
            physicianDifficulty: entry?.question.physicianDifficulty ?? 3,
            eventId: answered.id,
          },
          answerMs,
          sessionId,
        );
        items += 1;
        if (response.correct) correct += 1;
        lastMs = answerMs + 10;
      }
    } else {
      for (const review of reviewsBySession.get(session.id) ?? []) {
        const card = cardByKey.get(review.cardKey);
        const ref = input.cardRefs.get(review.cardKey);
        if (!card || !ref) continue;
        const atMs = Math.max(Date.parse(review.at), lastMs + 1);
        const reviewed = push(builder, student, 'card_reviewed', atMs, sessionId, {
          cardId: ref.cardId,
          deckId: ref.deckId,
          source: 'card',
          rating: review.rating,
          confidence: review.confidence,
          msToReveal: review.msToReveal,
          msToRate: review.msToRate,
          stateBefore: review.stateBefore,
          stateAfter: review.stateAfter,
        });
        xp += award(
          { kind: 'card', msToRate: review.msToRate, eventId: reviewed.id },
          atMs,
          sessionId,
        );
        items += 1;
        lastMs = atMs + 10;
      }
    }
    const endMs = Math.max(Date.parse(session.endedAt), lastMs + 5);
    push(builder, student, 'session_ended', endMs, sessionId, {
      kind: session.kind,
      reason: 'completed',
      items,
      correct: session.kind === 'practice' ? correct : null,
      durationMs: endMs - startMs,
      xp,
    });
  }
  return builder.events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
