// Repaso de tarjetas (pantalla 3, 7.1). Cola del día con el motor real de FSRS, confianza previa
// (apagada por defecto, D-087), los cuatro botones con su intervalo, causa después de fallar,
// tiempos y XP. Todo se puede hacer con el teclado. Cada repaso queda como evento card_reviewed con
// su estado FSRS antes y después. La sesión sigue el diseño de la portada por dentro (D-150). Arriba
// las pestañas con el avance, la tarjeta en crema con su rama y a un lado Esta sesión, el Pomodoro y
// las acciones sobre la tarjeta.
import { BookOpen, CheckCircle2, Pencil, Plus, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useFocusMode } from '@/app/focusMode';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { draftOf, isFromOutline } from '@/data/usecases/manualDecks';
import { setSuspended } from '@/data/usecases/organize';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import { useLiveData } from '@/data/hooks';
import {
  isAiNote,
  isEditableDeck,
  type Card as CardEntity,
  type Deck,
  type Note,
} from '@/data/schemas/decks';
import type { FsrsCardState } from '@/data/schemas/common';
import type { AppEvent } from '@/data/schemas/events';
import { checkCardQuality } from '@/engines/cardQuality';
import { canUse } from '@/config/billing';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { counterKindOf, remainingCounters } from '@/engines/counters';
import {
  buildDailyQueue,
  isLeech,
  previewReview,
  scheduleReview,
  type FsrsRating,
  type SchedulerConfig,
} from '@/engines/fsrs';
import { leechHit, leechSuggestions } from '@/engines/leech';
import { studyDayOf } from '@/engines/studyDay';
import { suspendedCardIds } from '@/engines/suspension';
import { awardXp } from '@/engines/xp';
import { t } from '@/i18n/es-MX';
import { StudyPausedDialog } from '../shared/StudyPausedDialog';
import { useShortcuts } from '../shared/useShortcuts';
import { useStudyClock } from '../shared/useStudyClock';
import { PomodoroCard, PomodoroNotice } from '../pomodoro/Pomodoro';
import { celebrate } from '@/ui/celebrate';
import { cn } from '@/ui/cn';
import { ActionDock } from '@/ui/components/action-dock';
import { Badge } from '@/ui/components/badge';
import { BranchBadge } from '@/ui/components/branch-tag';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Kbd, KeyHint } from '@/ui/components/key-hint';
import { ProgressBar } from '@/ui/components/progress-bar';
import { resolveControversy } from '@/data/usecases/aiCards';
import { LoadingState } from '@/ui/states/states';
import { followedDeckIds } from '../decks/followed';
import { buildSnapshot } from '../home/snapshot';
import { CardHtml } from '../shared/CardHtml';
import { ControversySignal } from '../shared/ControversySignal';
import { FeatureGate } from '../shared/FeatureGate';
import { useActivePlan, usePlanText } from '../shared/useActivePlan';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { topicTaxonomy } from '@/demo/content';
import { deckIds } from '@/demo/content/deckEntities';
import { deckPath, selectionUnitId } from '@/engines/deckTree';
import { deckBranch } from '../decks/deckBranch';
import { DeckEditorDialog } from '../decks/DeckEditorDialog';
import { CONTAINER_DECKS, deckTopicOutlines } from '../decks/topicPaths';
import { useDeckCatalog } from '../decks/useDeckCatalog';
import { CardTimerBar } from './CardTimerBar';
import { LeechPanel } from './LeechPanel';
import { buildTopicQueue } from '@/engines/topicStudy';
import { DailyLoadPanel } from './DailyLoadPanel';
import { OverdueTools } from './OverdueTools';
import { ReviewSetup } from './ReviewSetup';
import { SessionStatsCard } from './SessionStatsCard';
import { useReviewPresetFromRoute } from './reviewPreset';
import { TodayPlanCard } from './TodayPlanCard';
import { useReviewSettingsPanel } from './settings/panelParam';
import { ReviewSettingsButton, ReviewSettingsDialog } from './settings/ReviewSettingsDialog';
import { StudyTabs } from './StudyTabs';
import { schedulerConfig } from './schedulerConfig';
import { useCardTimer } from './useCardTimer';
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
/** Tope del tiempo que se registra por tarjeta. Una pausa larga no distorsiona los análisis */
const CARD_TIME_CAP_MS = DEFAULT_THRESHOLDS.daily.cardTimeCapSeconds * 1000;
type Cause = keyof typeof t.review.causes;
const RATINGS: FsrsRating[] = ['again', 'hard', 'good', 'easy'];
/** Color del nombre de cada calificación. Bien va rellena en marino y no lleva color propio */
const RATING_TONE: Record<FsrsRating, string> = {
  again: 'text-danger',
  hard: 'text-warning',
  good: '',
  easy: 'text-success',
};
/** Rama de la taxonomía a la que pertenece cada tema, para la etiqueta de las tarjetas de Mis errores */
const BRANCH_OF_TOPIC = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, branch.key] as const),
  ),
);
const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * El texto de Repasar sin mazos. En Gratis no sugiere seguir un mazo del catálogo, que es de pago
 * (4.25, B8). Lee el plan solo aquí, así el repaso con tarjetas no carga nada de más. Mientras carga
 * no dice nada, para no sugerir lo que el plan no abre
 */
function NoDecksBody({ userId }: { userId: string }) {
  const body = usePlanText(userId, 'deckCatalog', {
    open: t.review.noDecksBody,
    closed: t.freePlan.catalog.reviewEmpty,
  });
  return body ?? null;
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
  // Un botón de Mazos puede pedir un mazo y un modo de una sola vez por el estado de la ruta (V4-B3)
  useReviewPresetFromRoute();
  // Ajustes del repaso se abren con ?ajustes en la dirección (B3 del plan del cambio)
  const panel = useReviewSettingsPanel();
  // Subespecialidad y rama de cada nota precargada, por su ID. Se calculan una sola vez por catálogo,
  // porque el ID estable de cada nota cuesta y esta pantalla vuelve a pintarse con cada evento de
  // la sesión (perf.spec, 14.4). La rama es la de la nota o la del mazo cuando no la trae, como Urgencias
  const catalogNotes = useMemo(() => {
    const topic = new Map<string, string | null>();
    const branch = new Map<string, string>();
    for (const file of catalog ?? []) {
      const fallback = deckBranch(file);
      for (const note of file.notes) {
        const id = deckIds.note(note.key);
        topic.set(id, note.topic);
        branch.set(id, note.branch ?? fallback);
      }
    }
    return { topic, branch };
  }, [catalog]);
  if (events === undefined || content === undefined || catalog === undefined)
    return <LoadingState />;
  const followed = followedDeckIds(session, content.decks);
  const noteById = new Map(content.notes.map((note) => [note.id, note]));
  // Las suspendidas no entran al repaso, pero siguen en el mazo y en Buscar tarjetas (D-085)
  const suspended = suspendedCardIds(events);
  const cards = errorsFirst(
    content.cards.filter((card) => followed.has(card.deckId) && !suspended.has(card.id)),
    noteById,
  );
  const settingsButton = (
    <ReviewSettingsButton
      onOpen={() => {
        panel.open();
      }}
    />
  );
  const settingsPanel = (
    <ReviewSettingsDialog
      session={session}
      focus={panel.focus}
      onClose={panel.close}
      dailyLoad={<DailyLoadPanel session={session} cards={cards} events={events} />}
    />
  );
  // Con una sesión en curso no se cambia de pantalla aunque suspendas la última tarjeta activa
  if (cards.length === 0 && selection === null) {
    // Si sigues mazos pero todo está suspendido, el aviso lleva a Buscar tarjetas y no a Mazos
    const allSuspended = content.cards.some(
      (card) => followed.has(card.deckId) && suspended.has(card.id),
    );
    return (
      <>
        <ScreenHeader
          title={t.screens.review.title}
          description={t.screens.review.description}
          actions={settingsButton}
        />
        <StudyTabs />
        {settingsPanel}
        <Card tone="cream" aria-labelledby="sin-mazos" className="lg:max-w-session">
          <CardHeader>
            <CardTitle id="sin-mazos">
              {allSuspended ? t.review.allSuspendedTitle : t.review.noDecksTitle}
            </CardTitle>
            <CardDescription>
              {allSuspended ? t.review.allSuspendedBody : <NoDecksBody userId={session.user.id} />}
            </CardDescription>
          </CardHeader>
          <Button asChild className="self-start">
            <Link to={screenPath(allSuspended ? 'explore' : 'decks')}>
              {allSuspended ? t.review.goToExplore : t.review.goToDecks}
            </Link>
          </Button>
        </Card>
      </>
    );
  }
  // Se elige y se cuenta por unidad, la rama de un mazo precargado o un mazo propio, y no por cada
  // materia (D-085). Cada tarjeta dice en qué mazo y materia está
  const unitOf = (deckId: string) => selectionUnitId(content.decks, deckId, CONTAINER_DECKS);
  const deckNames = new Map(
    content.decks.map((deck) => [deck.id, deckPath(content.decks, deck.id).slice(-2).join(' › ')]),
  );
  const unitNames = new Map(content.decks.map((deck) => [deck.id, deck.name]));
  const inSelection = (card: CardEntity, topic: string | null, candidate: ReviewSelection) =>
    cardMatches({ deckId: unitOf(card.deckId) }, topic, candidate);
  // Subespecialidad de cada tarjeta. Las de mazos precargados la traen en su nota y las de
  // preguntas falladas en una etiqueta
  const noteTopic = catalogNotes.topic;
  const noteBranch = catalogNotes.branch;
  const topicOfCard = new Map(
    cards.map((card) => [
      card.id,
      noteTopic.get(card.noteId) ?? topicFromTags(noteById.get(card.noteId)?.tags),
    ]),
  );
  // Rama para la etiqueta de la tarjeta. Las de Mis errores la sacan del tema de su etiqueta. Una
  // tarjeta propia sin rama conocida no lleva etiqueta, nunca una inventada
  const branchOfCard = new Map(
    cards.map((card) => {
      const topic = topicOfCard.get(card.id) ?? null;
      return [
        card.id,
        noteBranch.get(card.noteId) ?? (topic ? (BRANCH_OF_TOPIC.get(topic) ?? null) : null),
      ];
    }),
  );
  const config = schedulerConfig(session);
  const cardStates = latestCardStates(events);
  // Las herramientas de atrasos solo sirven si ya hay tarjetas con repasos
  const hasScheduled = cards.some((card) => {
    const state = cardStates.get(card.id);
    return state !== undefined && state.state !== 'new';
  });
  // Las tarjetas que tocarían hoy con una selección
  const queueFor = (candidate: ReviewSelection) =>
    buildQueue({
      cards: cards.filter((card) => inSelection(card, topicOfCard.get(card.id) ?? null, candidate)),
      events,
      config,
      timeZone: session.user.timeZone,
      mode: candidate.mode,
    });

  // Lo que de verdad queda por estudiar hoy en todos los mazos que sigues, para el plan de hoy. La
  // cola ya respeta los límites del día, y el plan suma lo que ya se hizo
  const todayCounters = remainingCounters(
    buildQueue({ cards, events, config, timeZone: session.user.timeZone, mode: 'today' }),
    (cardId) => cardStates.get(cardId) ?? null,
  );
  const todayPending = {
    reviews: todayCounters.learning + todayCounters.review,
    newCards: todayCounters.new,
  };

  if (selection === null) {
    return (
      <>
        <ScreenHeader
          title={t.screens.review.title}
          description={t.screens.review.description}
          actions={settingsButton}
        />
        <StudyTabs />
        {settingsPanel}
        <ReviewSetup
          addDeck={<AddDeckButton />}
          plan={
            <TodayPlanCard
              session={session}
              events={events}
              pending={todayPending}
              onOpenSettings={() => {
                panel.open();
              }}
            />
          }
          overdue={
            hasScheduled ? (
              <FeatureGate userId={session.user.id} feature="overdueTools">
                <OverdueTools session={session} cards={cards} events={events} />
              </FeatureGate>
            ) : null
          }
          cards={cards.map((card) => ({ ...card, deckId: unitOf(card.deckId) }))}
          deckNames={unitNames}
          // Todos los temas de cada mazo, también los de sus tarjetas suspendidas (comentario 8)
          deckTopics={deckTopicOutlines({
            decks: content.decks,
            notes: noteById,
            cards: content.cards.filter((card) => followed.has(card.deckId)),
          })}
          topicOfCard={topicOfCard}
          limits={{
            newCardsPerDay: session.settings.newCardsPerDay,
            reviewsPerDay: session.settings.reviewsPerDay,
            unlimitedNewCards: session.settings.unlimitedNewCards,
          }}
          onOpenSettings={() => {
            panel.open();
          }}
          countFor={(candidate) => queueFor(candidate).length}
          countersFor={(candidate) =>
            remainingCounters(queueFor(candidate), (cardId) => cardStates.get(cardId) ?? null)
          }
          leechCount={
            cards.filter((card) => isLeech(cardStates.get(card.id) ?? null, config.thresholds))
              .length
          }
          onStart={setSelection}
        />
      </>
    );
  }
  return (
    <>
      {settingsPanel}
      <ReviewSession
        key={JSON.stringify([selection.mode, [...selection.decks], [...selection.topics]])}
        session={session}
        settingsOpen={panel.focus !== null}
        onOpenSettings={() => {
          panel.open('pomodoro');
        }}
        cards={cards.filter((card) =>
          inSelection(card, topicOfCard.get(card.id) ?? null, selection),
        )}
        mode={selection.mode}
        notes={content.notes}
        editableDecks={
          new Map(
            content.decks
              .filter((deck) => isEditableDeck(deck, session.user.id))
              .map((deck) => [deck.id, deck]),
          )
        }
        deckNames={deckNames}
        branches={branchOfCard}
        initialEvents={events}
        onChangeSelection={() => {
          setSelection(null);
        }}
      />
    </>
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
  // Estudiar un tema es aparte de la cola del día, con todas las tarjetas elegidas y sin límite diario
  if (input.mode === 'topic') {
    return buildTopicQueue({
      cards: input.cards.map((card) => ({
        cardId: card.id,
        noteId: card.noteId,
        state: states.get(card.id) ?? null,
      })),
      now,
    });
  }
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
  settingsOpen,
  onOpenSettings,
  cards,
  mode,
  notes,
  editableDecks,
  deckNames,
  branches,
  initialEvents,
  onChangeSelection,
}: {
  session: ReadySession;
  /** Con Ajustes del repaso abiertos los atajos del repaso no responden */
  settingsOpen: boolean;
  /** Abre Ajustes del repaso en la parte del Pomodoro, desde el engrane de su píldora */
  onOpenSettings: () => void;
  cards: CardEntity[];
  mode: ReviewMode;
  notes: Note[];
  /** Mazos hechos a mano por el alumno, los únicos cuyas tarjetas se editan desde aquí */
  editableDecks: ReadonlyMap<string, Deck>;
  deckNames: Map<string, string>;
  /** Rama de cada tarjeta para su etiqueta, o null si no se conoce */
  branches: ReadonlyMap<string, string | null>;
  initialEvents: AppEvent[];
  /** Volver a elegir qué repasar. Lo ya calificado queda guardado */
  onChangeSelection: () => void;
}) {
  const api = useDataApi();
  const { user, settings } = session;
  // En modo enfoque no se dice el XP ganado, ni al calificar ni al terminar (respuesta 82, B7)
  const focus = useFocusMode();
  // Mientras carga el plan se supone el más básico, así el temporizador no aparece sin permiso
  const timerAllowed = canUse(useActivePlan(user.id) ?? 'free', 'cardTimer');
  const config: SchedulerConfig = useMemo(() => schedulerConfig(session), [session]);
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  // Las tarjetas de la sesión se fijan al entrar. Si se suspende una a media sesión, los datos en
  // vivo la quitan de cards, pero la sesión sigue con las que tenía hasta terminar
  const [cardById] = useState(() => new Map(cards.map((card) => [card.id, card])));

  // La cola se arma una vez al entrar y no cambia mientras se repasa
  const [queue, setQueue] = useState<string[]>(() =>
    buildQueue({ cards, events: initialEvents, config, timeZone: user.timeZone, mode }),
  );
  const [states, setStates] = useState(() => latestCardStates(initialEvents));
  const [position, setPosition] = useState(0);
  const [step, setStep] = useState<'confidence' | 'front' | 'back' | 'cause' | 'leech' | 'done'>(
    settings.cardConfidenceStep ? 'confidence' : 'front',
  );
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [pendingCause, setPendingCause] = useState<string | null>(null);
  // La tarjeta que acaba de volverse sanguijuela y los olvidos que lleva. Se atiende tras la causa
  const [leech, setLeech] = useState<{ cardId: string; lapses: number } | null>(null);
  // Tarjetas que se suspendieron durante esta sesión y ya no deben volver a salir
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  // La tarjeta que se está editando. advance dice si al cerrar sigue con la siguiente, como al editar
  // una sanguijuela, o se queda en la misma, como al editarla desde Acciones
  const [editing, setEditing] = useState<{ deck: Deck; noteId: string; advance: boolean } | null>(
    null,
  );
  const [leechBusy, setLeechBusy] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  // Cuántas recordaste, Bien o Fácil, y cuántas fallaste, para Esta sesión
  const [tally, setTally] = useState({ good: 0, again: 0 });
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
  // Temporizador opcional. Solo corre mientras se ve la tarjeta y se detiene si el estudio se pausa
  const timerRuns =
    settings.cardTimer.enabled &&
    timerAllowed &&
    (step === 'front' || step === 'back' || step === 'confidence');
  const timer = useCardTimer({
    enabled: timerRuns,
    seconds: settings.cardTimer.seconds,
    resetKey: position,
    paused: study.paused,
    // Con la opción de mostrar sola la respuesta, al acabarse el tiempo se revela si aún no se veía
    onExpire: () => {
      if (settings.cardTimer.autoReveal && step === 'front') {
        revealedAt.current = clock();
        setStep('back');
      }
    },
  });
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

  const next = (skipped: ReadonlySet<string> = removed) => {
    // Salta las tarjetas que se suspendieron en esta sesión
    let nextPosition = position + 1;
    while (nextPosition < queue.length && skipped.has(queue[nextPosition] as string)) {
      nextPosition += 1;
    }
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
    const outcome = scheduleReview(before, rating, now, config, card.id);
    const msToReveal = Math.min(revealedAt.current - shownAt.current, CARD_TIME_CAP_MS);
    const msToRate = Math.min(now.getTime() - revealedAt.current, CARD_TIME_CAP_MS);
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
          ...(mode === 'topic' ? { extra: true } : {}),
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
    setTally((current) => ({
      good: current.good + (rating === 'good' || rating === 'easy' ? 1 : 0),
      again: current.again + (rating === 'again' ? 1 : 0),
    }));
    setStates((current) => new Map(current).set(card.id, outcome.state));
    // Una tarjeta fallada vuelve al final de la sesión
    if (rating === 'again') {
      setQueue((current) => [...current, card.id]);
      setPendingCause(card.id);
      // Si este olvido la vuelve sanguijuela se atiende justo después de la causa
      if (leechHit(before?.lapses ?? 0, outcome.state.lapses, config.thresholds.leechLapses)) {
        setLeech({ cardId: card.id, lapses: outcome.state.lapses });
      }
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
    if (leech) setStep('leech');
    else next();
  };

  const closeLeech = (skipped: ReadonlySet<string> = removed) => {
    setLeech(null);
    next(skipped);
  };

  const suspendLeech = async () => {
    if (!leech) return;
    setLeechBusy(true);
    try {
      await setSuspended(api, { id: user.id, timeZone: user.timeZone }, [leech.cardId], true, {
        reason: 'leech',
      });
      const skipped = new Set(removed).add(leech.cardId);
      setRemoved(skipped);
      closeLeech(skipped);
    } finally {
      setLeechBusy(false);
    }
  };

  const showAnswer = () => {
    revealedAt.current = clock();
    setStep('back');
  };

  // Todo el repaso con el teclado (D-087). Espacio o Enter muestra la respuesta, 1 a 4 califican y
  // Espacio o Enter en la respuesta es Bien. Tras fallar, 1 a 7 eligen el motivo y Espacio omite
  // Datos de la sanguijuela que se está atendiendo. Solo las tarjetas del propio alumno se editan
  const leechCard = leech ? cardById.get(leech.cardId) : undefined;
  const leechNote = leechCard ? noteById.get(leechCard.noteId) : undefined;
  const canEditLeech =
    leechCard !== undefined &&
    leechNote !== undefined &&
    leechNote.origin !== 'preloaded' &&
    !isFromOutline(leechNote) &&
    editableDecks.has(leechCard.deckId);
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
  } else if (step === 'leech' && leech) {
    keys['1'] = () => {
      void suspendLeech();
    };
    if (canEditLeech) {
      keys['2'] = () => {
        const deck = editableDecks.get(leechCard.deckId);
        if (deck) setEditing({ deck, noteId: leechNote.id, advance: true });
      };
    }
    const keep = () => {
      closeLeech();
    };
    keys.space = keep;
    keys.enter = keep;
    keys.escape = keep;
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
  useShortcuts(
    keys,
    card !== undefined && step !== 'done' && !study.paused && editing === null && !settingsOpen,
  );

  const changeSelection = (
    <Button
      variant="ghost"
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
  // Modo enfoque (D-078) al estilo de la portada (D-150). Las pestañas arriba con el avance y las
  // acciones de la sesión. El título de la pantalla queda para el lector de pantalla y la pestaña
  // del navegador, el caso va arriba
  const sessionBar = (actions: ReactNode) => (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <title>{t.app.documentTitle(t.screens.review.title)}</title>
      <h1 tabIndex={-1} className="sr-only">
        {t.screens.review.title}
      </h1>
      <StudyTabs />
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {actions}
      </div>
    </header>
  );

  if (step === 'done' || !card || !note) {
    return (
      <>
        {sessionBar(changeSelection)}
        {extras}
        <Card tone="cream" aria-labelledby="fin-repaso" className="lg:max-w-session">
          <CardHeader>
            <CardTitle id="fin-repaso" className="flex items-center gap-2 text-heading">
              <CheckCircle2 aria-hidden className="size-6 text-success" />
              {t.review.doneTitle}
            </CardTitle>
            <CardDescription>
              {reviewed > 0
                ? focus
                  ? t.b7.focusMode.reviewDone(reviewed)
                  : t.review.doneBody(reviewed, xpGained)
                : t.review.nothingDue}
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

  const now = new Date();
  const state = states.get(card.id) ?? null;
  const isNew = state === null || state.state === 'new';
  const reveal = step === 'back' || step === 'cause' || step === 'leech';
  const { front, back } = cardFaces(note, card.ordinal);
  // Lo que falta, sin contar las tarjetas que se suspendieron en esta sesión
  const counters = remainingCounters(
    queue.slice(position).filter((id) => !removed.has(id)),
    (id) => states.get(id) ?? null,
  );
  const leechBefore = isLeech(state, config.thresholds);
  const preview = reveal ? previewReview(state, now, config, cardId) : null;
  const suggestions = leech ? leechSuggestions(checkCardQuality(draftOf(note))) : [];
  // Días completos que lleva vencida una tarjeta ya programada. Las nuevas no vencen
  const overdueDays = isNew
    ? 0
    : Math.floor((now.getTime() - new Date(state.due).getTime()) / DAY_MS);
  const branch = branches.get(card.id) ?? null;
  const deckName = deckNames.get(card.deckId) ?? '';
  // Acciones sobre esta tarjeta. Editar solo las del propio alumno, y abrir el apunte si sale de uno
  const editableDeck = editableDecks.get(card.deckId);
  const canEditCard =
    editableDeck !== undefined && note.origin !== 'preloaded' && !isFromOutline(note);
  const outlineId = isFromOutline(note) ? note.outlineId : (note.sourceOutlineId ?? null);
  const actionClass =
    'flex min-h-touch items-center gap-2.5 rounded-md text-sm font-semibold text-fg hover:text-primary-ink';
  const actionIconClass =
    'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink [&_svg]:size-4';

  return (
    <>
      {sessionBar(
        <>
          <span className="text-sm text-fg-muted">
            {t.review.progress(position + 1, queue.length)}
          </span>
          {changeSelection}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void finish();
            }}
          >
            {t.review.finish}
          </Button>
        </>,
      )}
      <ProgressBar
        value={position}
        max={queue.length}
        label={t.review.progressLabel}
        className="h-2"
      />
      {extras}
      {/* En el teléfono es una columna, la tarjeta, luego calificar fijo abajo y al final el lado. En
          computadora son doce columnas, ocho para la tarjeta y cuatro para el lado (D-150) */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="order-1 flex min-w-0 flex-col gap-5 lg:col-span-8 lg:col-start-1">
          <Card
            tone="cream"
            lift={false}
            aria-label={t.review.deck(deckName)}
            className="flex flex-col gap-5 rounded-xl p-6 shadow-navy sm:px-10 sm:py-9"
          >
            <div className="flex flex-wrap items-center gap-2.5">
              {branch ? (
                <BranchBadge branch={branch}>
                  <span aria-hidden className="size-2 rounded-full bg-current" />
                  {t.branchNames[branch] ?? branch}
                </BranchBadge>
              ) : null}
              <Badge variant={isNew ? 'info' : 'neutral'}>
                {isNew ? t.review.newCard : t.review.reviewCard}
              </Badge>
              {isQuestionNote(note) ? <Badge variant="warning">{t.review.errorCard}</Badge> : null}
              {leechBefore ? <Badge variant="danger">{t.review.leech.badge}</Badge> : null}
              {isAiNote(note) ? <Badge variant="warning">{t.aiCards.draftLabel}</Badge> : null}
              <span className="text-sm text-fg-muted">{deckName}</span>
              {overdueDays > 0 ? (
                <span className="ml-auto text-sm font-semibold text-primary-ink">
                  {t.review.overdueSince(overdueDays)}
                </span>
              ) : null}
            </div>
            <CardHtml
              html={front}
              className="text-2xl leading-snug font-bold tracking-tight text-heading"
            />
            {reveal ? (
              <>
                <hr className="h-[1.5px] w-full border-0 bg-heading" />
                <div className="flex flex-col gap-3">
                  <p className="eyebrow">{t.review.answer}</p>
                  <CardHtml html={back} />
                  {note.sourceQuote ? (
                    <p className="text-sm leading-relaxed text-fg-muted italic">
                      {isQuestionNote(note) ? t.review.sourceBank : t.review.sourceLabel} “
                      {note.sourceQuote}”{note.sourceTitle ? ` (${note.sourceTitle})` : ''}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </Card>

          {note.controversy ? (
            <ControversySignal
              controversy={note.controversy}
              onVerify={async () => {
                await resolveControversy(api, user, note.id, 'verified');
              }}
              {...(editableDeck
                ? {
                    onEdit: () => {
                      setEditing({ deck: editableDeck, noteId: note.id, advance: true });
                    },
                  }
                : {})}
            />
          ) : null}

          {timerRuns ? (
            <CardTimerBar
              remainingMs={timer.remainingMs}
              totalSeconds={settings.cardTimer.seconds}
              expired={timer.expired}
            />
          ) : null}
        </div>

        <div className="order-2 min-w-0 lg:col-span-8 lg:col-start-1">
          {step === 'leech' && leech ? (
            <LeechPanel
              lapses={leech.lapses}
              suggestions={suggestions}
              canEdit={canEditLeech}
              outlineId={isFromOutline(note) ? note.outlineId : null}
              busy={leechBusy}
              onSuspend={() => {
                void suspendLeech();
              }}
              onEdit={() => {
                if (editableDeck)
                  setEditing({ deck: editableDeck, noteId: note.id, advance: true });
              }}
              onKeep={() => {
                closeLeech();
              }}
            />
          ) : step === 'cause' ? (
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
                aria-keyshortcuts="Space Enter Escape"
                onClick={() => {
                  void reportCause(null);
                }}
              >
                {t.review.skipCause}
              </Button>
              <KeyHint>
                <Kbd>1</Kbd> a <Kbd>{Object.keys(t.review.causes).length}</Kbd>{' '}
                {t.review.keys.cause} · <Kbd>{t.review.keys.space}</Kbd> {t.review.keys.skip}
              </KeyHint>
            </fieldset>
          ) : (
            // Confianza, revelar y calificar, siempre a la mano en el teléfono (D-078)
            <ActionDock>
              {step === 'confidence' ? (
                <>
                  <p className="text-sm font-semibold text-fg-muted">
                    {t.review.confidenceQuestion}
                  </p>
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
                  <p className="text-sm font-semibold text-fg-muted">{t.review.rateQuestion}</p>
                  {/* Cuatro tarjetas de calificar (D-150). Otra vez en rojo, Difícil en ámbar, Bien
                      rellena en marino y Fácil en verde, cada una con su intervalo y su tecla */}
                  <div className="grid grid-cols-4 gap-2 sm:gap-3">
                    {RATINGS.map((rating, index) => (
                      <button
                        key={rating}
                        type="button"
                        aria-keyshortcuts={String(index + 1)}
                        className={cn(
                          'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[1rem] border-[1.5px] px-1.5 py-2.5 text-center transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0 sm:px-3',
                          rating === 'good'
                            ? 'border-primary bg-primary text-primary-fg hover:bg-primary-hover'
                            : 'border-line bg-surface hover:border-indicator hover:bg-primary-soft',
                        )}
                        onClick={() => {
                          void rate(rating);
                        }}
                      >
                        <span className={cn('text-base font-bold', RATING_TONE[rating])}>
                          {t.review.ratings[rating]}{' '}
                          {/* La tecla solo se ve donde hay teclado, como KeyHint (D-087) */}
                          <span className="hidden font-semibold [@media(hover:hover)_and_(pointer:fine)]:inline">
                            [{index + 1}]
                          </span>
                        </span>{' '}
                        {/* Sin opacidad. Sobre el marino de Bien bajaba la letra chica de 4.5 a 1 */}
                        <span
                          className={cn(
                            'text-xs',
                            rating === 'good' ? 'text-primary-fg' : 'text-fg-muted',
                          )}
                        >
                          {t.review.interval(intervalLabel(preview[rating].state, now))}
                        </span>
                      </button>
                    ))}
                  </div>
                  <KeyHint>
                    <Kbd>1</Kbd> a <Kbd>4</Kbd> {t.review.keys.rate} ·{' '}
                    <Kbd>{t.review.keys.space}</Kbd> {t.review.keys.good}
                  </KeyHint>
                </>
              ) : null}
            </ActionDock>
          )}
        </div>

        <aside className="order-3 flex min-w-0 flex-col gap-4 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
          <SessionStatsCard
            done={reviewed}
            good={tally.good}
            again={tally.again}
            counters={counters}
            current={counterKindOf(state)}
            activeMs={study.activeMs}
            xpText={lastXp > 0 && !focus ? t.review.xpGained(lastXp) : ''}
          />
          <PomodoroCard session={session} onOpenSettings={onOpenSettings} />
          {canEditCard || outlineId ? (
            <Card aria-labelledby="acciones-tarjeta" className="flex flex-col gap-1">
              <CardTitle id="acciones-tarjeta">{t.review.actions.title}</CardTitle>
              {canEditCard ? (
                <button
                  type="button"
                  className={actionClass}
                  onClick={() => {
                    setEditing({ deck: editableDeck, noteId: note.id, advance: false });
                  }}
                >
                  <span aria-hidden className={actionIconClass}>
                    <Pencil />
                  </span>
                  {t.review.actions.edit}
                </button>
              ) : null}
              {outlineId ? (
                <Link
                  to={`${screenPath('outlines')}?apunte=${encodeURIComponent(outlineId)}`}
                  className={actionClass}
                >
                  <span aria-hidden className={actionIconClass}>
                    <BookOpen />
                  </span>
                  {t.review.actions.outline}
                </Link>
              ) : null}
            </Card>
          ) : null}
        </aside>
      </div>
      {editing ? (
        <DeckEditorDialog
          session={session}
          deck={editing.deck}
          initialNoteId={editing.noteId}
          onClose={() => {
            const { advance } = editing;
            setEditing(null);
            if (advance) closeLeech();
          }}
        />
      ) : null}
    </>
  );
}
