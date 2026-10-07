// Repaso de tarjetas (pantalla 3, 7.1). Cola del día con el motor real de FSRS, confianza previa
// (apagada por defecto, D-087), los cuatro botones con su intervalo, causa después de fallar,
// tiempos y XP. Todo se puede hacer con el teclado. Cada repaso queda como evento card_reviewed con
// su estado FSRS antes y después.
import { BookOpen, CheckCircle2, Plus, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { SessionHeader } from '@/app/layout/SessionHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { updateProfile } from '@/data/usecases/profile';
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
import { suspendedCardIds } from '@/engines/suspension';
import { awardXp } from '@/engines/xp';
import { t } from '@/i18n/es-MX';
import { StudyPausedDialog } from '../shared/StudyPausedDialog';
import { useShortcuts } from '../shared/useShortcuts';
import { useStudyClock } from '../shared/useStudyClock';
import { PomodoroNotice, PomodoroPill } from '../pomodoro/Pomodoro';
import { celebrate } from '@/ui/celebrate';
import { ActionDock } from '@/ui/components/action-dock';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Kbd, KeyHint } from '@/ui/components/key-hint';
import { DemoContentLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { followedDeckIds } from '../decks/followed';
import { buildSnapshot } from '../home/snapshot';
import { CardHtml } from '../shared/CardHtml';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { deckIds } from '@/demo/content/deckEntities';
import { deckPath, selectionUnitId } from '@/engines/deckTree';
import { useDeckCatalog } from '../decks/useDeckCatalog';
import { ReviewSetup } from './ReviewSetup';
import { StudyTabs } from './StudyTabs';
import { schedulerConfig } from './schedulerConfig';
import { cardMatches, type ReviewMode, type ReviewSelection } from './selection';
import {
  cardFaces,
  errorsFirst,
  isQuestionNote,
  latestCardStates,
  reviewedToday,
  reviewEndReason,
  topicFromTags,
  volumeXpToday,
} from './study';

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
  const catalog = useDeckCatalog();
  const [selection, setSelection] = useState<ReviewSelection | null>(null);
  if (events === undefined || content === undefined || catalog === undefined)
    return <LoadingState />;
  const followed = followedDeckIds(session, content.decks);
  const noteById = new Map(content.notes.map((note) => [note.id, note]));
  // Las suspendidas no entran al repaso, pero siguen en el mazo y en Explorar (D-085)
  const suspended = suspendedCardIds(events);
  const cards = errorsFirst(
    content.cards.filter((card) => followed.has(card.deckId) && !suspended.has(card.id)),
    noteById,
  );
  if (cards.length === 0) {
    return (
      <>
        <ScreenHeader title={t.screens.review.title} description={t.screens.review.description} />
        <StudyTabs />
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
  // Se elige y se cuenta por unidad, la rama de un mazo precargado o un mazo propio, y no por cada
  // materia (D-085). Cada tarjeta dice en qué mazo y materia está
  const unitOf = (deckId: string) => selectionUnitId(content.decks, deckId);
  const deckNames = new Map(
    content.decks.map((deck) => [deck.id, deckPath(content.decks, deck.id).slice(-2).join(' › ')]),
  );
  const unitNames = new Map(content.decks.map((deck) => [deck.id, deck.name]));
  const inSelection = (card: CardEntity, topic: string | null, candidate: ReviewSelection) =>
    cardMatches({ deckId: unitOf(card.deckId) }, topic, candidate);
  // Subespecialidad de cada tarjeta. Las de mazos precargados la traen en su nota y las de
  // preguntas falladas en una etiqueta
  const noteTopic = new Map<string, string | null>();
  for (const file of catalog)
    for (const note of file.notes) noteTopic.set(deckIds.note(note.key), note.topic);
  const topicOfCard = new Map(
    cards.map((card) => [
      card.id,
      noteTopic.get(card.noteId) ?? topicFromTags(noteById.get(card.noteId)?.tags),
    ]),
  );
  const config = schedulerConfig(session);

  if (selection === null) {
    return (
      <>
        <ScreenHeader title={t.screens.review.title} description={t.screens.review.description} />
        <StudyTabs />
        <ReviewSetup
          addDeck={<AddDeckButton />}
          hasDemo={content.decks.some((deck) => followed.has(deck.id) && deck.isDemo)}
          cards={cards.map((card) => ({ ...card, deckId: unitOf(card.deckId) }))}
          deckNames={unitNames}
          topicOfCard={topicOfCard}
          limits={{
            newCardsPerDay: session.settings.newCardsPerDay,
            reviewsPerDay: session.settings.reviewsPerDay,
          }}
          onSaveLimits={(patch) => updateProfile(api, session.user, { settings: patch })}
          countFor={(candidate) =>
            buildQueue({
              cards: cards.filter((card) =>
                inSelection(card, topicOfCard.get(card.id) ?? null, candidate),
              ),
              events,
              config,
              timeZone: session.user.timeZone,
              mode: candidate.mode,
            }).length
          }
          onStart={setSelection}
        />
      </>
    );
  }
  return (
    <ReviewSession
      key={JSON.stringify([selection.mode, [...selection.decks], [...selection.topics]])}
      session={session}
      cards={cards.filter((card) => inSelection(card, topicOfCard.get(card.id) ?? null, selection))}
      mode={selection.mode}
      notes={content.notes}
      deckNames={deckNames}
      initialEvents={events}
      onChangeSelection={() => {
        setSelection(null);
      }}
    />
  );
}

function AddDeckButton() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={screenPath('decks')}>
        <Plus aria-hidden />
        {t.reviewSetup.addDeck}
      </Link>
    </Button>
  );
}

/** Cola del día para unas tarjetas y un modo. Repasos vencidos primero y luego las nuevas */
function buildQueue(input: {
  cards: CardEntity[];
  events: AppEvent[];
  config: SchedulerConfig;
  timeZone: string;
  mode: ReviewMode;
}): string[] {
  const now = new Date();
  const states = latestCardStates(input.events);
  const noteOfCard = new Map(input.cards.map((card) => [card.id, card.noteId]));
  const daily = buildDailyQueue({
    cards: input.cards.map((card) => ({
      cardId: card.id,
      noteId: card.noteId,
      state: states.get(card.id) ?? null,
    })),
    now,
    config: input.config,
    reviewedToday: reviewedToday(input.events, studyDayOf(now, input.timeZone), noteOfCard),
  });
  const picked =
    input.mode === 'due'
      ? daily.reviews
      : input.mode === 'new'
        ? daily.newCards
        : [...daily.reviews, ...daily.newCards];
  return picked.map((card) => card.cardId);
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
  mode,
  notes,
  deckNames,
  initialEvents,
  onChangeSelection,
}: {
  session: ReadySession;
  cards: CardEntity[];
  mode: ReviewMode;
  notes: Note[];
  deckNames: Map<string, string>;
  initialEvents: AppEvent[];
  /** Volver a elegir qué repasar. Lo ya calificado queda guardado */
  onChangeSelection: () => void;
}) {
  const api = useDataApi();
  const { user, settings } = session;
  const config: SchedulerConfig = useMemo(() => schedulerConfig(session), [session]);
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  // La cola se arma una vez al entrar y no cambia mientras se repasa
  const [queue, setQueue] = useState<string[]>(() =>
    buildQueue({ cards, events: initialEvents, config, timeZone: user.timeZone, mode }),
  );
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
  const recorded = useRef<AppEvent[]>([]);

  // Momento en que se mostró la tarjeta actual, para medir el tiempo hasta revelar
  useEffect(() => {
    shownAt.current = clock();
  }, [position]);

  const cardId = queue[position];
  const card = cardId ? cardById.get(cardId) : undefined;
  const note = card ? noteById.get(card.noteId) : undefined;
  // Tiempo activo de estudio, con pausa tras 2.5 minutos sin actividad (D-063)
  const study = useStudyClock(step !== 'done' && card !== undefined);
  const ctx = () => ({ userId: user.id, tz: user.timeZone, sessionId: sessionId.current });

  const ensureSession = async () => {
    if (sessionId.current) return;
    sessionId.current = newId();
    await api.recordEvent(
      createEvent('session_started', { kind: 'review', config: { source: 'review' } }, ctx()),
    );
  };

  const finish = async (
    options: { celebrate?: boolean; reason?: 'completed' | 'abandoned' } = {},
  ) => {
    if (sessionId.current) {
      await api.recordEvent(
        createEvent(
          'session_ended',
          {
            kind: 'review',
            reason: reviewEndReason(position, queue.length, options.reason),
            items: reviewed,
            correct: null,
            durationMs: Math.round(study.activeMs()),
            xp: xpGained,
          },
          ctx(),
        ),
      );
      sessionId.current = null;
      if (options.celebrate !== false) celebrate('session');
    }
    setStep('done');
  };

  const next = () => {
    const nextPosition = position + 1;
    setPosition(nextPosition);
    setConfidence(null);
    if (nextPosition >= queue.length) void finish({ reason: 'completed' });
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
          // Las tarjetas de preguntas falladas se marcan para separarlas en el análisis
          source: isQuestionNote(note) ? 'question' : 'card',
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

  const showAnswer = () => {
    revealedAt.current = clock();
    setStep('back');
  };

  // Todo el repaso con el teclado (D-087). Espacio o Enter muestra la respuesta, 1 a 4 califican y
  // Espacio o Enter en la respuesta es Bien. Tras fallar, 1 a 8 eligen la causa y Espacio omite
  const keys: Record<string, () => void> = {};
  if (step === 'confidence') {
    (['dont_know', 'unsure', 'sure'] as Confidence[]).forEach((value, index) => {
      keys[String(index + 1)] = () => {
        setConfidence(value);
        setStep('front');
      };
    });
  } else if (step === 'front') {
    keys.space = showAnswer;
    keys.enter = showAnswer;
  } else if (step === 'back') {
    RATINGS.forEach((rating, index) => {
      keys[String(index + 1)] = () => {
        void rate(rating);
      };
    });
    keys.space = () => {
      void rate('good');
    };
    keys.enter = keys.space;
  } else if (step === 'cause') {
    (Object.keys(t.review.causes) as Cause[]).forEach((cause, index) => {
      keys[String(index + 1)] = () => {
        void reportCause(cause);
      };
    });
    const skip = () => {
      void reportCause(null);
    };
    keys.space = skip;
    keys.enter = skip;
    keys.escape = skip;
  }
  useShortcuts(keys, card !== undefined && step !== 'done' && !study.paused);

  const sessionActions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        // En el teléfono solo se ve el ícono, así que el nombre va en la etiqueta (axe, button-name)
        aria-label={t.reviewSetup.change}
        onClick={() => {
          // Lo calificado ya quedó en la bitácora. Solo se cierra la sesión y se vuelve a elegir
          void finish({ celebrate: false }).then(onChangeSelection);
        }}
      >
        <Shuffle aria-hidden />
        <span className="hidden sm:inline">{t.reviewSetup.change}</span>
      </Button>
      <PomodoroPill session={session} />
    </>
  );
  const extras = (
    <>
      <PomodoroNotice session={session} />
      {study.paused ? (
        <StudyPausedDialog
          minutes={study.pausedActiveMs / 60000}
          onResume={study.resume}
          onFinish={() => {
            study.resume();
            void finish();
          }}
        />
      ) : null}
    </>
  );
  const header = (
    <>
      <ScreenHeader
        title={t.screens.review.title}
        description={t.screens.review.description}
        actions={sessionActions}
      />
      {extras}
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={onChangeSelection}>
              <Shuffle aria-hidden />
              {t.reviewSetup.other}
            </Button>
            <Button asChild variant="secondary">
              <Link to={screenPath('home')}>{t.onboarding.goHome}</Link>
            </Button>
          </div>
        </Card>
      </>
    );
  }

  const state = states.get(card.id) ?? null;
  const isNew = state === null || state.state === 'new';
  const reveal = step === 'back' || step === 'cause';
  const { front, back } = cardFaces(note, card.ordinal);
  const remainingReviews = queue.slice(position).filter((id) => {
    const s = states.get(id);
    return s && s.state !== 'new';
  }).length;
  const preview = reveal ? previewReview(state, new Date(), config) : null;

  return (
    <>
      {/* Modo enfoque (D-078). Sin racha, nivel ni descripción mientras se repasa */}
      <SessionHeader
        title={t.screens.review.title}
        meta={
          <>
            <span>
              {t.review.remaining(remainingReviews, queue.length - position - remainingReviews)}
            </span>
            <span aria-live="polite" className="font-semibold text-success">
              {lastXp > 0 ? t.review.xpGained(lastXp) : ''}
            </span>
          </>
        }
        actions={
          <>
            {sessionActions}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void finish();
              }}
            >
              {t.review.finish}
            </Button>
          </>
        }
      />
      {extras}
      <Card
        aria-label={t.review.deck(deckNames.get(card.deckId) ?? '')}
        className="w-full lg:max-w-reading"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={isNew ? 'info' : 'neutral'}>
            {isNew ? t.review.newCard : t.review.reviewCard}
          </Badge>
          {isQuestionNote(note) ? <Badge variant="warning">{t.review.errorCard}</Badge> : null}
          {note.isDemo ? <DemoContentLabel /> : null}
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

      {step === 'cause' ? (
        <fieldset className="flex flex-col gap-2 lg:max-w-reading">
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
            aria-keyshortcuts="Space Enter Escape"
            onClick={() => {
              void reportCause(null);
            }}
          >
            {t.review.skipCause}
          </Button>
          <KeyHint>
            <Kbd>1</Kbd> a <Kbd>{Object.keys(t.review.causes).length}</Kbd> {t.review.keys.cause} ·{' '}
            <Kbd>{t.review.keys.space}</Kbd> {t.review.keys.skip}
          </KeyHint>
        </fieldset>
      ) : (
        // Confianza, revelar y calificar, siempre a la mano en el teléfono (D-078)
        <ActionDock className="lg:max-w-reading">
          {step === 'confidence' ? (
            <>
              <p className="text-sm font-medium">{t.review.confidenceQuestion}</p>
              <div className="grid grid-cols-3 gap-2">
                {(['dont_know', 'unsure', 'sure'] as Confidence[]).map((value, index) => (
                  <Button
                    key={value}
                    variant="secondary"
                    aria-keyshortcuts={String(index + 1)}
                    onClick={() => {
                      setConfidence(value);
                      setStep('front');
                    }}
                  >
                    {t.review.confidence[value]}
                  </Button>
                ))}
              </div>
              <KeyHint>
                <Kbd>1</Kbd> a <Kbd>3</Kbd> {t.review.keys.confidence}
              </KeyHint>
            </>
          ) : null}

          {step === 'front' ? (
            <>
              <Button size="lg" aria-keyshortcuts="Space Enter" onClick={showAnswer}>
                <BookOpen aria-hidden />
                {t.review.show}
              </Button>
              <KeyHint>
                <Kbd>{t.review.keys.space}</Kbd> {t.review.keys.show}
              </KeyHint>
            </>
          ) : null}

          {step === 'back' && preview ? (
            <>
              <p className="text-sm font-medium">{t.review.rateQuestion}</p>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                {RATINGS.map((rating, index) => (
                  <Button
                    key={rating}
                    aria-keyshortcuts={String(index + 1)}
                    variant={
                      rating === 'again' ? 'danger' : rating === 'good' ? 'primary' : 'secondary'
                    }
                    className="flex-col gap-0 px-1 py-1.5 text-sm whitespace-normal sm:px-3 sm:text-base"
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
              <KeyHint>
                <Kbd>1</Kbd> a <Kbd>4</Kbd> {t.review.keys.rate} · <Kbd>{t.review.keys.space}</Kbd>{' '}
                {t.review.keys.good}
              </KeyHint>
            </>
          ) : null}
        </ActionDock>
      )}
    </>
  );
}
