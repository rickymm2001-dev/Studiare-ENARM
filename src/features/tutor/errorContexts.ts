// Contexto de cada error para las reglas de olvido (7.9). Junta lo que ya calcularon los demás
// motores, las señales de conducta de cada respuesta, la mala lectura, la fatiga de la sesión y el
// dominio del tema base, y lo que dicen la bitácora y el banco sobre cada error de pregunta y de
// tarjeta. Las reglas en sí viven en el motor forgetting. Sin React ni Dexie.
import type { Thresholds } from '@/config/thresholds';
import type { Option, Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import { personalPace, responseSignals, sessionThirds } from '@/engines/behavior';
import { errorMotives, motivesByAttempt } from '@/engines/errorCauses';
import { countListItems, type ErrorContext } from '@/engines/forgetting';
import { retrievabilityOf } from '@/engines/fsrs';
import type { AnswerFact } from '@/engines/insights';
import { DAY_MS } from '@/engines/studyDay';
import { buildInsightInput, type BankLookup } from '../progress/insightFacts';

/** Lo que se necesita de una tarjeta para sus reglas */
export interface CardFact {
  /** Subespecialidad de su nota. Sin ella no hay área donde agrupar el hallazgo */
  topic: string | null;
  /** HTML de la respuesta, para saber si enumera una lista */
  back: string | null;
}

export interface CorrectAnswer {
  questionId: string;
  subtopic: string;
  text: string;
}

/** Dominio por debajo del cual un tema base cuenta como débil, el mismo que usa Progreso */
export const WEAK_MASTERY = 0.6;

export interface ErrorContextInput {
  events: readonly AppEvent[];
  bank: BankLookup;
  /** La respuesta correcta de cada pregunta del banco, para detectar que eligió la de otra parecida */
  correctAnswers: readonly CorrectAnswer[];
  cards: ReadonlyMap<string, CardFact>;
  /** Dominio de los temas que ya tienen respuestas suficientes. Los que calibran no aparecen */
  mastery: ReadonlyMap<string, number>;
  /** Tema base de cada tema, de la taxonomía */
  baseTopics: ReadonlyMap<string, string>;
  timeZone: string;
  today: string;
  desiredRetention: number;
  thresholds: Thresholds;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** La pregunta cuya clave es lo que eligió, si es del mismo subtema y no es la misma pregunta */
function confusedWith(
  question: Question,
  chosen: Option | undefined,
  answers: readonly CorrectAnswer[],
): string | null {
  if (!chosen || chosen.isCorrect) return null;
  const text = normalize(chosen.text);
  if (text === '') return null;
  const other = answers.find(
    (answer) =>
      answer.questionId !== question.id &&
      answer.subtopic === question.subtopic &&
      normalize(answer.text) === text,
  );
  return other?.questionId ?? null;
}

/**
 * Respuestas del último tercio de las sesiones largas donde la exactitud ajustada bajó. Es la misma
 * división de tercios que usa el motor behavior para detectar fatiga
 */
function lastThirdOfTiringSessions(
  answers: readonly AnswerFact[],
  thresholds: Thresholds['behavior'],
): Set<string> {
  const tiring = new Set(
    sessionThirds(answers, thresholds)
      .filter((session) => session.lastResidual < session.firstResidual)
      .map((session) => session.sessionId),
  );
  const ids = new Set<string>();
  for (const sessionId of tiring) {
    const ordered = answers
      .filter((answer) => answer.sessionId === sessionId)
      .sort((a, b) => a.minuteInSession - b.minuteInSession);
    const third = Math.floor(ordered.length / 3);
    if (third === 0) continue;
    for (const answer of ordered.slice(-third)) ids.add(answer.id);
  }
  return ids;
}

export function buildErrorContexts(input: ErrorContextInput): ErrorContext[] {
  const { events, bank, thresholds } = input;
  const facts = buildInsightInput({
    events,
    bank,
    timeZone: input.timeZone,
    today: input.today,
    desiredRetention: input.desiredRetention,
    thresholds,
  });
  const answers = facts.answers;
  const pace = personalPace(answers, thresholds.behavior);
  const tired = lastThirdOfTiringSessions(answers, thresholds.behavior);
  // El motivo de cada error es el último que marcó el alumno para ese intento, hasta el siguiente
  // intento del mismo elemento. Las causas de antes se leen con la tabla de equivalencias (4.23)
  const motiveOf = motivesByAttempt(
    errorMotives(events, {
      aliases: (id) => {
        const stable = bank.questions.get(id)?.questionId;
        return stable ? [stable] : [];
      },
    }),
  );
  const answeredEvents = new Map(
    events.flatMap((event) => (event.type === 'question_answered' ? [[event.id, event]] : [])),
  );
  const baseIsWeak = (topic: string) => {
    const base = input.baseTopics.get(topic);
    const mastery = base === undefined ? undefined : input.mastery.get(base);
    return mastery !== undefined && mastery < WEAK_MASTERY;
  };

  const contexts: ErrorContext[] = [];
  for (const answer of answers) {
    if (answer.correct) continue;
    const event = answeredEvents.get(answer.id);
    const question = event ? bank.questions.get(event.payload.questionVersionId) : undefined;
    if (!event || !question) continue;
    contexts.push({
      eventId: event.id,
      itemId: question.id,
      kind: 'question',
      at: event.at,
      subtopic: question.topic,
      lapses: null,
      answerListItems: null,
      confusedWithItemId: confusedWith(
        question,
        bank.options.get(event.payload.optionVersionId),
        input.correctAnswers,
      ),
      confidence: event.payload.confidence,
      probableMisread: answer.misread,
      fatigueContext: tired.has(answer.id),
      rapidGuess: responseSignals(answer, pace, thresholds.behavior).rapidGuess,
      baseTopicWeak: baseIsWeak(question.topic),
      predictedRetrievability: null,
      daysSinceLastReview: null,
      reportedCause: motiveOf.get(event.id) ?? null,
    });
  }

  for (const event of events) {
    if (event.type !== 'card_reviewed' || event.payload.rating !== 'again') continue;
    const card = input.cards.get(event.payload.cardId);
    // Sin subespecialidad no hay dónde agrupar el hallazgo
    if (!card?.topic) continue;
    const before = event.payload.stateBefore;
    const seen = before !== null && before.state !== 'new';
    contexts.push({
      eventId: event.id,
      itemId: event.payload.cardId,
      kind: 'card',
      at: event.at,
      subtopic: card.topic,
      lapses: event.payload.stateAfter.lapses,
      answerListItems: card.back ? countListItems(card.back) : null,
      confusedWithItemId: null,
      confidence: event.payload.confidence,
      probableMisread: false,
      fatigueContext: false,
      rapidGuess: false,
      baseTopicWeak: baseIsWeak(card.topic),
      predictedRetrievability: seen ? retrievabilityOf(before, new Date(event.at)) : null,
      daysSinceLastReview:
        seen && before.lastReview
          ? (Date.parse(event.at) - Date.parse(before.lastReview)) / DAY_MS
          : null,
      reportedCause: motiveOf.get(event.id) ?? null,
    });
  }
  return contexts.sort((a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId));
}
