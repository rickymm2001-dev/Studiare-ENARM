// Semana planeada contra hecha y avisos de sobrecarga (D-119 B3, comentario 13).
// Se movió del antiguo Planificador a Progreso.
import { useMemo } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Card, Deck } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { listStudentPool } from '@/data/usecases/studentBank';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { examDateFor } from '@/config/exam';
import { topicTaxonomy } from '@/demo/content';
import { analyzeTopics, type TopicResponse } from '@/engines/topics';
import { studyDayOf } from '@/engines/studyDay';
import { suspendedCardIds } from '@/engines/suspension';
import { dailyQuestions } from '../shared/dailyLimit';
import { reservedByStoredExam } from '../exam/examStorage';
import { followedDeckIds } from '../decks/followed';
import { buildSnapshot } from '../home/snapshot';
import { schedulerConfig } from '../review/schedulerConfig';
import { latestCardStates, reviewedToday } from '../review/study';
import type { ReadySession } from '../shared/RequireSession';
import { buildPlannerView } from '../planner/planView';
import { OverloadCard, WeekCard } from '../planner/PlannerCards';

export function PlannerWeekSection({
  session,
  events,
  content,
}: {
  session: ReadySession;
  events: readonly AppEvent[];
  content: { decks: readonly Deck[]; cards: readonly Pick<Card, 'id' | 'noteId' | 'deckId'>[] };
}) {
  const api = useDataApi();
  const { user, settings } = session;

  const questions = useLiveData(
    () => listStudentPool(api).then((pool) => pool.practice),
    [api.repos],
  );
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(user.id).then((value) => value ?? null),
    [api.repos, user.id],
  );

  const viewData = useMemo(() => {
    if (questions === undefined || subscription === undefined) return null;
    const now = new Date();
    const today = studyDayOf(now, user.timeZone);
    const followed = followedDeckIds(session, content.decks);
    const suspended = suspendedCardIds(events);
    const cards = content.cards.filter(
      (card) => followed.has(card.deckId) && !suspended.has(card.id),
    );
    const states = latestCardStates(events);
    const noteOfCard = new Map(cards.map((card) => [card.id, card.noteId]));
    const bank = new Map(questions.map((question) => [question.id, question]));
    const responses: TopicResponse[] = events.flatMap((event) => {
      if (event.type !== 'question_answered') return [];
      const question = bank.get(event.payload.questionVersionId);
      return question
        ? [{ branch: question.branch, topic: question.topic, correct: event.payload.correct }]
        : [];
    });
    const analysis = analyzeTopics({
      responses,
      taxonomy: topicTaxonomy,
      averageRetrievability: {},
      thresholds: DEFAULT_THRESHOLDS.topics,
    });
    const daily = dailyQuestions({
      events,
      subscription,
      timeZone: user.timeZone,
      now,
      reserved: reservedByStoredExam(user.id),
    });
    const view = buildPlannerView({
      now,
      today,
      config: schedulerConfig(session),
      cards: cards.map((card) => ({
        cardId: card.id,
        noteId: card.noteId,
        state: states.get(card.id) ?? null,
      })),
      reviewedToday: reviewedToday(events, today, noteOfCard),
      activity: buildSnapshot({ events, user, settings, now }).activity,
      declaredMinutes: user.dailyMinutes,
      examDate: examDateFor(user),
      priorityTopics: analysis.priorities.map((priority) => priority.topic),
      questionLimit: { today: daily.left, perDay: daily.limit },
      ...(settings.unlimitedNewCards
        ? { reduceNewFrom: settings.newCardsPerDay > 0 ? settings.newCardsPerDay : 20 }
        : {}),
    });
    return { view, today };
  }, [questions, subscription, session, user, settings, events, content]);

  if (!viewData) return null;
  const { view, today } = viewData;

  return (
    <div className="flex flex-col gap-3">
      {view.plan.warnings.map((warning) => (
        <OverloadCard
          key={warning.kind}
          session={session}
          needed={warning.averageNeededMinutes}
          available={warning.availableMinutes}
          options={warning.options}
        />
      ))}
      <WeekCard week={view.plan.week} today={today} />
    </div>
  );
}
