// Repaso de tarjetas (pantalla 3, 7.1). Cola del día con el motor real de FSRS, confianza previa
// (apagable), los cuatro botones con su intervalo, causa después de fallar, tiempos y XP. Cada
// repaso queda como evento card_reviewed con su estado FSRS antes y después.
import { BookOpen, CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import { useLiveData } from '@/data/hooks';
import type { Card as CardEntity, Note } from '@/data/schemas/decks';
import type { FsrsCardState } from '@/data/schemas/common';
import type { AppEvent } from '@/data/schemas/events';
import {
  buildDailyQueue,
  previewReview,
  scheduleReview,
  type FsrsRating,
  type SchedulerConfig,
} from '@/engines/fsrs';
import { studyDayOf } from '@/engines/studyDay';
import { awardXp } from '@/engines/xp';
import { examDateFor } from '@/config/exam';
import { t } from '@/i18n/es-MX';
import { PomodoroNotice, PomodoroPill } from '../pomodoro/Pomodoro';
import { celebrate } from '@/ui/celebrate';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { followedDeckIds } from '../decks/followed';
import { buildSnapshot } from '../home/snapshot';
import { CardHtml } from '../shared/CardHtml';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { latestCardStates, renderCloze, reviewedToday, volumeXpToday } from './study';

type Confidence = 'dont_know' | 'unsure' | 'sure';
type Cause = keyof typeof t.review.causes;
const RATINGS: FsrsRating[] = ['again', 'hard', 'good', 'easy'];

/** Reloj de la sesión. Solo se llama desde manejadores de eventos */
function clock(): number {
  return Date.now();
}

export function ReviewScreen() {
  return (
    <RequireSession screen="review">
      {(session) => <ReviewLoader session={session} />}
    </RequireSession>
  );
}

function ReviewLoader({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const events = useUserEvents(session.user.id);
  const content = useLiveData(async () => {
    const [decks, cards, notes] = await Promise.all([
      api.repos.decks.list(),
      api.repos.cards.list(),
      api.repos.notes.list(),
    ]);
    return { decks, cards, notes };
  }, [api.repos]);
  if (events === undefined || content === undefined) return <LoadingState />;
  const followed = followedDeckIds(
    session,
    content.decks.map((deck) => deck.id),
  );
  const cards = content.cards.filter((card) => followed.has(card.deckId));
  if (cards.length === 0) {
    return (
      <>
        <ScreenHeader title={t.screens.review.title} description={t.screens.review.description} />
        <Card aria-labelledby="sin-mazos">
          <CardHeader>
            <CardTitle id="sin-mazos">{t.review.noDecksTitle}</CardTitle>
            <CardDescription>{t.review.noDecksBody}</CardDescription>
          </CardHeader>
          <Button asChild className="self-start">
            <Link to={screenPath('decks')}>{t.review.goToDecks}</Link>
          </Button>
        </Card>
      </>
    );
  }
  return (
    <ReviewSession
      session={session}
      cards={cards}
      notes={content.notes}
      deckNames={new Map(content.decks.map((deck) => [deck.id, deck.name]))}
      initialEvents={events}
    />
  );
}

function intervalLabel(state: FsrsCardState, now: Date): string {
  const minutes = Math.max(1, Math.round((new Date(state.due).getTime() - now.getTime()) / 60000));
  if (minutes < 60) return t.review.minutes(minutes);
  if (minutes < 60 * 24) return t.review.hours(Math.round(minutes / 60));
  return t.review.days(Math.round(minutes / (60 * 24)));
}

function ReviewSession({
  session,
  cards,
  notes,
  deckNames,
  initialEvents,
}: {
  session: ReadySession;
  cards: CardEntity[];
  notes: Note[];
  deckNames: Map<string, string>;
  initialEvents: AppEvent[];
}) {
  const api = useDataApi();
  const { user, settings } = session;
  const config: SchedulerConfig = useMemo(
    () => ({
      desiredRetention: settings.desiredRetention,
      examDate: examDateFor(user),
      timeZone: user.timeZone,
      thresholds: {
        ...DEFAULT_THRESHOLDS.fsrs,
        newCardsPerDay: settings.newCardsPerDay,
        reviewsPerDay: settings.reviewsPerDay,
      },
    }),
    [settings, user],
  );
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  // La cola se arma una vez al entrar y no cambia mientras se repasa
  const [queue, setQueue] = useState<string[]>(() => {
    const now = new Date();
    const states = latestCardStates(initialEvents);
    const noteOfCard = new Map(cards.map((card) => [card.id, card.noteId]));
    const daily = buildDailyQueue({
      cards: cards.map((card) => ({
        cardId: card.id,
        noteId: card.noteId,
        state: states.get(card.id) ?? null,
      })),
      now,
      config,
      reviewedToday: reviewedToday(initialEvents, studyDayOf(now, user.timeZone), noteOfCard),
    });
    return [...daily.reviews, ...daily.newCards].map((card) => card.cardId);
  });
  const [states, setStates] = useState(() => latestCardStates(initialEvents));
  const [position, setPosition] = useState(0);
  const [step, setStep] = useState<'confidence' | 'front' | 'back' | 'cause' | 'done'>(
    settings.cardConfidenceStep ? 'confidence' : 'front',
  );
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [pendingCause, setPendingCause] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [xpGained, setXpGained] = useState(0);
  const [lastXp, setLastXp] = useState(0);
  const sessionId = useRef<string | null>(null);
  const shownAt = useRef(0);
  const revealedAt = useRef(0);
  const startedAt = useRef(0);
  const recorded = useRef<AppEvent[]>([]);

  // Momento en que se mostró la tarjeta actual, para medir el tiempo hasta revelar
  useEffect(() => {
    shownAt.current = clock();
  }, [position]);

  const cardId = queue[position];
  const card = cardId ? cardById.get(cardId) : undefined;
  const note = card ? noteById.get(card.noteId) : undefined;
  const ctx = () => ({ userId: user.id, tz: user.timeZone, sessionId: sessionId.current });

  const ensureSession = async () => {
    if (sessionId.current) return;
    sessionId.current = newId();
    startedAt.current = clock();
    await api.recordEvent(
      createEvent('session_started', { kind: 'review', config: { source: 'review' } }, ctx()),
    );
  };

  const finish = async () => {
    if (sessionId.current) {
      await api.recordEvent(
        createEvent(
          'session_ended',
          {
            kind: 'review',
            reason: position >= queue.length ? 'completed' : 'abandoned',
            items: reviewed,
            correct: null,
            durationMs: clock() - startedAt.current,
            xp: xpGained,
          },
          ctx(),
        ),
      );
      sessionId.current = null;
      celebrate('session');
    }
    setStep('done');
  };

  const next = () => {
    const nextPosition = position + 1;
    setPosition(nextPosition);
    setConfidence(null);
    if (nextPosition >= queue.length) void finish();
    else setStep(settings.cardConfidenceStep ? 'confidence' : 'front');
  };

  const rate = async (rating: FsrsRating) => {
    if (!card) return;
    await ensureSession();
    const now = new Date();
    const before = states.get(card.id) ?? null;
    const outcome = scheduleReview(before, rating, now, config);
    const msToReveal = Math.min(revealedAt.current - shownAt.current, 86_400_000);
    const msToRate = Math.min(now.getTime() - revealedAt.current, 86_400_000);
    const reviewedEvent = await api.recordEvent(
      createEvent(
        'card_reviewed',
        {
          cardId: card.id,
          deckId: card.deckId,
          source: 'card',
          rating,
          confidence,
          msToReveal: Math.max(0, msToReveal),
          msToRate: Math.max(0, msToRate),
          stateBefore: before,
          stateAfter: outcome.state,
        },
        ctx(),
      ),
    );
    recorded.current.push(reviewedEvent);
    const allEvents = [...initialEvents, ...recorded.current];
    const snapshot = buildSnapshot({ events: allEvents, user, settings, now });
    const awards = awardXp({
      activity: { kind: 'card', msToRate, eventId: reviewedEvent.id },
      streakDays: snapshot.streak.current,
      volumeXpToday: volumeXpToday(allEvents, snapshot.today),
    });
    let gained = 0;
    for (const award of awards) {
      const xpEvent = await api.recordEvent(createEvent('xp_awarded', award, ctx()));
      recorded.current.push(xpEvent);
      gained += award.amount;
    }
    setXpGained((value) => value + gained);
    setLastXp(gained);
    setReviewed((value) => value + 1);
    setStates((current) => new Map(current).set(card.id, outcome.state));
    // Una tarjeta fallada vuelve al final de la sesión
    if (rating === 'again') {
      setQueue((current) => [...current, card.id]);
      setPendingCause(card.id);
      setStep('cause');
      return;
    }
    next();
  };

  const reportCause = async (cause: Cause | null) => {
    if (cause && pendingCause) {
      await api.recordEvent(
        createEvent('cause_reported', { targetKind: 'card', targetId: pendingCause, cause }, ctx()),
      );
    }
    setPendingCause(null);
    next();
  };

  const header = (
    <>
      <ScreenHeader
        title={t.screens.review.title}
        description={t.screens.review.description}
        badges={session.isDemo ? <SimulatedDataLabel /> : undefined}
        actions={<PomodoroPill session={session} autoStart={queue.length > 0} />}
      />
      <PomodoroNotice session={session} />
    </>
  );

  if (step === 'done' || !card || !note) {
    return (
      <>
        {header}
        <Card aria-labelledby="fin-repaso">
          <CardHeader>
            <CardTitle id="fin-repaso" className="flex items-center gap-2">
              <CheckCircle2 aria-hidden className="size-6 text-success" />
              {t.review.doneTitle}
            </CardTitle>
            <CardDescription>
              {reviewed > 0 ? t.review.doneBody(reviewed, xpGained) : t.review.nothingDue}
            </CardDescription>
          </CardHeader>
          <Button asChild className="self-start">
            <Link to={screenPath('home')}>{t.onboarding.goHome}</Link>
          </Button>
        </Card>
      </>
    );
  }

  const state = states.get(card.id) ?? null;
  const isNew = state === null || state.state === 'new';
  const reveal = step === 'back' || step === 'cause';
  const front = note.kind === 'basic' ? note.front : renderCloze(note.text, card.ordinal, false);
  const back =
    note.kind === 'basic'
      ? note.back
      : `${renderCloze(note.text, card.ordinal, true)}${note.extra ? `<br>${note.extra}` : ''}`;
  const remainingReviews = queue.slice(position).filter((id) => {
    const s = states.get(id);
    return s && s.state !== 'new';
  }).length;
  const preview = reveal ? previewReview(state, new Date(), config) : null;

  return (
    <>
      {header}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
        <span>
          {t.review.remaining(remainingReviews, queue.length - position - remainingReviews)}
        </span>
        <span aria-live="polite">{lastXp > 0 ? t.review.xpGained(lastXp) : ''}</span>
      </div>
      <Card
        aria-label={t.review.deck(deckNames.get(card.deckId) ?? '')}
        className="w-full max-w-reading"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={isNew ? 'info' : 'neutral'}>
            {isNew ? t.review.newCard : t.review.reviewCard}
          </Badge>
          <span className="text-sm text-fg-muted">{deckNames.get(card.deckId)}</span>
        </div>
        <CardHtml html={front} />
        {reveal ? (
          <>
            <hr className="my-4 border-line" />
            <CardHtml html={back} />
          </>
        ) : null}
      </Card>

      {step === 'confidence' ? (
        <div className="flex flex-col gap-2">
          <p className="font-medium">{t.review.confidenceQuestion}</p>
          <div className="grid grid-cols-3 gap-2">
            {(['dont_know', 'unsure', 'sure'] as Confidence[]).map((value) => (
              <Button
                key={value}
                variant="secondary"
                onClick={() => {
                  setConfidence(value);
                  setStep('front');
                }}
              >
                {t.review.confidence[value]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 'front' ? (
        <Button
          size="lg"
          onClick={() => {
            revealedAt.current = clock();
            setStep('back');
          }}
        >
          <BookOpen aria-hidden />
          {t.review.show}
        </Button>
      ) : null}

      {step === 'back' && preview ? (
        <div className="flex flex-col gap-2">
          <p className="font-medium">{t.review.rateQuestion}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATINGS.map((rating) => (
              <Button
                key={rating}
                variant={
                  rating === 'again' ? 'danger' : rating === 'good' ? 'primary' : 'secondary'
                }
                className="flex-col gap-0 py-2"
                onClick={() => {
                  void rate(rating);
                }}
              >
                <span>{t.review.ratings[rating]}</span>
                <span className="text-xs opacity-80">
                  {t.review.interval(intervalLabel(preview[rating].state, new Date()))}
                </span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 'cause' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">{t.review.causeQuestion}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(t.review.causes) as Cause[]).map((cause) => (
              <Button
                key={cause}
                variant="secondary"
                className="justify-start"
                onClick={() => {
                  void reportCause(cause);
                }}
              >
                {t.review.causes[cause]}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => {
              void reportCause(null);
            }}
          >
            {t.review.skipCause}
          </Button>
        </fieldset>
      ) : null}

      <Button
        variant="ghost"
        className="self-start"
        onClick={() => {
          void finish();
        }}
      >
        {t.review.finish}
      </Button>
    </>
  );
}
