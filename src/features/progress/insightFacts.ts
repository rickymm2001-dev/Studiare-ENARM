// Hechos para el motor de autoconocimiento (D-074). Lee la bitácora y el banco y arma la entrada de
// buildInsights. Es una función pura para poder probarla sin Dexie ni React.
import { TZDate } from '@date-fns/tz';
import type { Thresholds } from '@/config/thresholds';
import type { ClinicalCase, Option, Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import { personalPace, responseSignals } from '@/engines/behavior';
import {
  READING_MOTIVES,
  errorMotives,
  motivesByAttempt,
  reportedMotives,
} from '@/engines/errorCauses';
import type { AnswerFact, InsightInput, ReviewFact } from '@/engines/insights';
import { isProbableMisread } from '@/engines/structure';
import { daysBetween, studyDayOf } from '@/engines/studyDay';

/** Probabilidad de acierto esperada por la dificultad del médico, de 1 a 5 (J) */
export const EXPECTED_BY_DIFFICULTY = [0.85, 0.75, 0.6, 0.45, 0.35] as const;

export interface BankLookup {
  questions: ReadonlyMap<string, Question>;
  options: ReadonlyMap<string, Option>;
  cases: ReadonlyMap<string, ClinicalCase>;
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

function localHour(at: string, timeZone: string): number {
  return new TZDate(Date.parse(at), timeZone).getHours();
}

export function buildInsightInput(input: {
  events: readonly AppEvent[];
  bank: BankLookup;
  timeZone: string;
  today: string;
  desiredRetention: number;
  thresholds: InsightInput['thresholds'] & Pick<Thresholds, 'behavior'>;
}): InsightInput {
  const { events, bank, timeZone } = input;
  const sessionStart = new Map<string, number>();
  const shown = new Map<string, Extract<AppEvent, { type: 'question_shown' }>>();
  const changes = new Map<string, Extract<AppEvent, { type: 'answer_changed' }>[]>();

  // El motivo que marca el alumno se ata a su respuesta más reciente de esa pregunta, no a todas las
  // veces que la contestó, y si lo cambia vale el último. El ID del reporte puede ser el de la versión
  // o el de la pregunta. Las causas de antes se leen con la tabla de equivalencias (4.23)
  const motives = errorMotives(events, {
    aliases: (id) => {
      const stable = bank.questions.get(id)?.questionId;
      return stable ? [stable] : [];
    },
  });
  const motiveOfAnswer = motivesByAttempt(motives);
  type Draft = Omit<AnswerFact, 'misread'>;
  const drafts: Draft[] = [];
  const reviews: ReviewFact[] = [];
  /** Dónde están en reviews los repasos de cada tarjeta, para reiniciarla */
  const reviewsOfCard = new Map<string, number[]>();
  const sessionMinutes: number[] = [];
  const studyDays = new Set<string>();
  let firstDay: string | null = null;

  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = `${event.sessionId ?? ''}|`;
    switch (event.type) {
      case 'session_started':
        if (event.sessionId) sessionStart.set(event.sessionId, Date.parse(event.at));
        break;
      case 'session_ended':
        sessionMinutes.push(event.payload.durationMs / 60_000);
        break;
      case 'question_shown':
        shown.set(key + event.payload.questionVersionId, event);
        changes.set(key + event.payload.questionVersionId, []);
        break;
      case 'answer_changed':
        changes.get(key + event.payload.questionVersionId)?.push(event);
        break;
      case 'card_reviewed': {
        const day = studyDayOf(new Date(event.at), timeZone);
        studyDays.add(day);
        firstDay ??= day;
        const indexes = reviewsOfCard.get(event.payload.cardId) ?? [];
        indexes.push(reviews.length);
        reviewsOfCard.set(event.payload.cardId, indexes);
        reviews.push({
          rating: event.payload.rating,
          stateBefore: event.payload.stateBefore?.state ?? null,
          lapsesAfter: event.payload.stateAfter.lapses,
          cardId: event.payload.cardId,
        });
        break;
      }
      case 'cards_reset':
        // Reiniciar vuelve nueva a la tarjeta y sin olvidos (B4). Sus repasos de antes siguen
        // contando para la retención, pero ya no la hacen sanguijuela hasta que se vuelva a olvidar.
        // Solo cambian los hechos que se arman aquí. La bitácora no se toca
        for (const cardId of event.payload.cardIds) {
          for (const index of reviewsOfCard.get(cardId) ?? []) {
            const review = reviews[index];
            if (review) reviews[index] = { ...review, lapsesAfter: 0 };
          }
          reviewsOfCard.delete(cardId);
        }
        break;
      case 'question_answered': {
        const day = studyDayOf(new Date(event.at), timeZone);
        studyDays.add(day);
        firstDay ??= day;
        const question = bank.questions.get(event.payload.questionVersionId);
        if (!question) break;
        const shownEvent = shown.get(key + question.id);
        const shownOptions = (shownEvent?.payload.shownOptions ?? [])
          .map((item) => bank.options.get(item.optionVersionId))
          .filter((option) => option !== undefined);
        const caseVignette = question.caseId
          ? (bank.cases.get(question.caseId)?.vignette ?? '')
          : '';
        const words =
          countWords(caseVignette) +
          countWords(question.vignette) +
          countWords(question.prompt) +
          shownOptions.reduce((sum, option) => sum + countWords(option.text), 0);
        const started = event.sessionId ? sessionStart.get(event.sessionId) : undefined;
        const chosen = bank.options.get(event.payload.optionVersionId);
        drafts.push({
          id: event.id,
          sessionId: event.sessionId ?? event.id,
          at: event.at,
          msToAnswer: event.payload.msToAnswer,
          words: Math.max(words, 1),
          correct: event.payload.correct,
          confidence: event.payload.confidence,
          expected: EXPECTED_BY_DIFFICULTY[question.physicianDifficulty - 1] ?? 0.6,
          changes: (changes.get(key + question.id) ?? [])
            .filter((change) => change.payload.fromOptionVersionId !== null)
            .map((change) => ({
              fromCorrect:
                bank.options.get(change.payload.fromOptionVersionId ?? '')?.isCorrect ?? false,
              toCorrect: bank.options.get(change.payload.toOptionVersionId)?.isCorrect ?? false,
            })),
          minuteInSession:
            started === undefined ? 0 : Math.max(0, (Date.parse(event.at) - started) / 60_000),
          localHour: localHour(event.at, timeZone),
          polarity: question.structure.polarity,
          task: question.structure.task,
          caseOrder: question.caseOrder,
          branch: question.branch,
          topic: question.topic,
          visibleTags: shownOptions.flatMap((option) => (option.biasTag ? [option.biasTag] : [])),
          chosenTag: chosen?.biasTag ?? null,
        });
        break;
      }
      default:
        break;
    }
  }

  // La mala lectura usa el ritmo personal, así que va en una segunda pasada
  const pace = personalPace(drafts, input.thresholds.behavior);
  const answers: AnswerFact[] = drafts.map((draft) => {
    const motive = motiveOfAnswer.get(draft.id) ?? null;
    return {
      ...draft,
      misread: isProbableMisread({
        polarity: draft.polarity,
        correct: draft.correct,
        answeredFast: responseSignals(draft, pace, input.thresholds.behavior).rapidGuess,
        // Malinterpretación y Lectura superficial son las dos de lectura
        reportedMisread: motive !== null && READING_MOTIVES.has(motive),
      }),
    };
  });

  return {
    answers,
    reviews,
    sessionMinutes,
    // Un motivo por error, el último que marcó
    causes: reportedMotives(motives).flatMap((entry) => (entry.motive ? [entry.motive] : [])),
    studyDays: [...studyDays],
    today: input.today,
    daysSinceStart: firstDay ? Math.max(0, daysBetween(firstDay, input.today)) : 0,
    desiredRetention: input.desiredRetention,
    thresholds: input.thresholds,
  };
}
