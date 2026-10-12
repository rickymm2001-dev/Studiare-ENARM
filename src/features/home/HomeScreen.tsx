// Inicio (pantalla 2) con el diseño de Ricardo del 2026-10-12 (D-116). Ya no es un tablero que se
// acomoda. Saludo con racha y nivel arriba, Tus repasos (meta diaria, carga de repaso y tarjetas
// vencidas), Tus simuladores (sesgos o trampas y temas para reforzar, con calibrando), una columna con
// el plan actual y el botón para cambiarlo, las misiones de hoy y el reto de Party, y el heatmap del
// año abajo. Cada cifra sale de la bitácora con los mismos motores que el resto de la app.
// 0.8 cm entre los bloques en computadora y 20 px en el teléfono, columnas que terminan a la misma
// altura y el heatmap a todo el ancho (D-117 y D-118).
import { CreditCard, Layers, Target } from 'lucide-react';
import { useId, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { LoadingState } from '@/ui/states/states';
import type { Card as DeckCard, Deck } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { followedDeckIds } from '../decks/followed';
import { LandingScreen } from '../landing/LandingScreen';
import { PartyWidget } from '../party/PartyWidget';
import { useFutureLoad } from '../progress/useFutureLoad';
import { MissionList } from '../rewards/parts';
import { useRewards } from '../rewards/useRewards';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useAccount } from '../shared/useAccount';
import { useActivePlan } from '../shared/useActivePlan';
import { useBiasVocabulary } from '../shared/useBiasVocabulary';
import { useUserEvents } from '../shared/useUserEvents';
import { LOAD_DAYS, ReviewLoadCard } from './sections/ReviewLoadCard';
import { buildSnapshot, type Snapshot } from './snapshot';
import { BiasPatternWidget, WeakTopicsWidget } from './widgets/AnalysisWidgets';
import { HeatmapWidget } from './widgets/HeatmapWidget';

const text = t.home;
const NO_SETTINGS = {} as const;
const NO_EVENTS: readonly AppEvent[] = [];
const NO_CONTENT: { decks: readonly Deck[]; cards: readonly DeckCard[] } = { decks: [], cards: [] };

export function HomeScreen() {
  // Sin sesión, la raíz es la portada de venta (D-068)
  const session = useSession();
  if (session.status === 'signed-out') return <LandingScreen />;
  return <RequireSession screen="home">{(ready) => <Dashboard session={ready} />}</RequireSession>;
}

function Dashboard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const events = useUserEvents(user.id);
  const account = useAccount(user.id);
  const content = useLiveData(async () => {
    const [decks, cards] = await Promise.all([api.repos.decks.list(), api.repos.cards.list()]);
    return { decks, cards };
  }, [api.repos, session.isDemo, session.user.id]);
  // Las tarjetas que Repasar sí ofrece, para que las vencidas cuenten lo mismo
  const cards = useMemo(() => {
    if (!content) return undefined;
    const followed = followedDeckIds(session, content.decks);
    return new Set(
      content.cards.filter((card) => followed.has(card.deckId)).map((card) => card.id),
    );
  }, [content, session]);
  // Lo que te toca cada uno de los próximos 7 días, con la proyección de Progreso (D-118)
  const load = useFutureLoad(session, events ?? NO_EVENTS, content ?? NO_CONTENT, LOAD_DAYS);
  const vocabulary = useBiasVocabulary();

  if (events === undefined || cards === undefined || account === undefined) {
    return <LoadingState />;
  }
  const snapshot = buildSnapshot({ events, user, settings, now: new Date(), activeCardIds: cards });

  return (
    <>
      <ScreenHeader
        title={text.welcome(user.alias, account?.sex ?? null)}
        documentTitle={t.screens.home.title}
        description={t.screens.home.description}
      />
      {/* En el teléfono va todo en una columna, con el plan antes del heatmap para que cambiar de
          plan quede a la mano. En computadora son las tres columnas del diseño y el heatmap abajo,
          de orilla a orilla, para que no quede espacio en blanco bajo la columna del plan */}
      <div
        className={cn(
          'grid grid-cols-1 gap-5 [grid-template-areas:"repasos"_"simuladores"_"lateral"_"heatmap"] lg:gap-7.5',
          'lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:[grid-template-areas:"repasos_simuladores"_"lateral_lateral"_"heatmap_heatmap"]',
          'xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(15rem,17rem)] xl:[grid-template-areas:"repasos_simuladores_lateral"_"heatmap_heatmap_heatmap"]',
        )}
      >
        <Group title={text.reviewsTitle} className="[grid-area:repasos]">
          {/* Las tarjetas crecen hasta la altura de la fila, para que nada quede en blanco */}
          <div className="grid grow grid-cols-1 gap-5 sm:grid-cols-2 lg:gap-7.5">
            <div className="flex flex-col gap-5 lg:gap-7.5">
              <DailyGoalCard snapshot={snapshot} />
              <DueCard snapshot={snapshot} />
            </div>
            <ReviewLoadCard load={load} />
          </div>
        </Group>

        <Group
          title={text.simulatorsTitle}
          className="[grid-area:simuladores] lg:border-l lg:border-line lg:pl-7.5"
        >
          <AnalysisCard title={t.vocabulary[vocabulary].homeTitle}>
            <BiasPatternWidget session={session} events={events} settings={NO_SETTINGS} />
          </AnalysisCard>
          <AnalysisCard title={text.topicsTitle}>
            <WeakTopicsWidget session={session} events={events} settings={NO_SETTINGS} />
          </AnalysisCard>
        </Group>

        <aside className="grid grid-cols-1 gap-5 [grid-area:lateral] md:grid-cols-3 lg:gap-7.5 xl:grid-cols-1 xl:content-start xl:border-l xl:border-line xl:pl-7.5">
          <PlanCard userId={user.id} />
          <MissionsSection session={session} />
          <SideSection title={t.widgets.names.party_challenge}>
            <PartyWidget session={session} snapshot={snapshot} events={events} />
          </SideSection>
        </aside>

        <CalendarCard
          snapshot={snapshot}
          since={studyDayOf(new Date(user.createdAt), user.timeZone)}
        />
      </div>
    </>
  );
}

/** Un grupo del diseño con su título grande, como Tus repasos */
function Group({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-5', className)}>
      <h2 id={id} className="text-xl font-medium text-fg sm:text-2xl">
        {title}
      </h2>
      {/* El título queda más cerca de sus tarjetas que las tarjetas entre sí, para que se lea como
          un grupo */}
      <div className="flex grow flex-col gap-5 lg:gap-7.5">{children}</div>
    </section>
  );
}

/** El título de una tarjeta dentro de un grupo. Es h3 porque el grupo ya tiene su h2 */
function CardHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="mb-2 text-lg font-bold text-fg sm:text-xl">
      {children}
    </h3>
  );
}

function DailyGoalCard({ snapshot }: { snapshot: Snapshot }) {
  const id = useId();
  const { goal } = snapshot;
  const done = snapshot.todayActivity[goal.metric];
  const metric = t.widgets.goal.metricNames[goal.metric];
  // Una frase por día, la misma durante todo el día de estudio
  const dayNumber = Math.floor(Date.parse(`${snapshot.today}T12:00:00Z`) / 86_400_000);
  const quote = text.quotes[dayNumber % text.quotes.length] ?? text.quotes[0];
  return (
    <Card aria-labelledby={id} className="flex grow flex-col gap-2 p-5">
      <CardHeading id={id}>{t.widgets.names.daily_goal}</CardHeading>
      <div className="flex items-center gap-3">
        <Target aria-hidden className="size-8 shrink-0 text-primary sm:size-9" />
        <div className="flex min-w-0 flex-col">
          <span className="text-2xl font-extrabold sm:text-3xl">
            {t.widgets.goal.ratio(Math.min(done, goal.value), goal.value)}
          </span>
          <span className="text-sm text-fg-muted">
            {done >= goal.value ? t.widgets.goal.met : metric}
          </span>
        </div>
      </div>
      <figure className="text-sm">
        <blockquote>{quote.text}</blockquote>
        <figcaption className="text-xs text-fg-muted">{quote.author}</figcaption>
      </figure>
      <ProgressBar
        className="mt-auto"
        value={Math.min(done, goal.value)}
        max={goal.value}
        label={t.widgets.goal.progress(done, goal.value, metric)}
      />
    </Card>
  );
}

function DueCard({ snapshot }: { snapshot: Snapshot }) {
  const id = useId();
  return (
    <Card aria-labelledby={id} className="flex grow flex-col gap-3 p-5">
      <CardHeading id={id}>{text.dueTitle}</CardHeading>
      <div>
        <p className="sr-only">{text.dueLabel(snapshot.dueCards)}</p>
        <p aria-hidden className="flex items-center gap-3">
          <Layers className="size-9 shrink-0 text-primary sm:size-10" />
          <span className="text-4xl font-extrabold sm:text-5xl">
            {snapshot.dueCards.toLocaleString('es-MX')}
          </span>
        </p>
        <p aria-hidden className="mt-1 text-lg sm:text-xl">
          {text.dueCaption(snapshot.dueCards)}
        </p>
      </div>
      {snapshot.dueCards === 0 ? <p className="text-sm text-fg-muted">{text.nothingDue}</p> : null}
      <p className="text-sm text-fg-muted">
        {t.widgets.today.done(snapshot.todayActivity.cards, snapshot.todayActivity.questions)}
      </p>
      {/* El botón queda abajo aunque la tarjeta crezca */}
      <Button asChild className="mt-auto w-full">
        <Link to={screenPath('review')}>{t.widgets.today.review}</Link>
      </Button>
    </Card>
  );
}

/** El heatmap del año con su título y una línea que los separa (D-118) */
function CalendarCard({ snapshot, since }: { snapshot: Snapshot; since: string }) {
  const id = useId();
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-4 p-5 [grid-area:heatmap]">
      <h2 id={id} className="border-b border-line pb-3 text-lg font-bold text-fg sm:text-xl">
        {text.calendarTitle}
      </h2>
      <HeatmapWidget
        snapshot={snapshot}
        since={since}
        settings={{ range: 365, metric: 'cards' }}
        summaryAtEnd
        fluid
      />
    </Card>
  );
}

function AnalysisCard({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card aria-labelledby={id} className="flex grow flex-col p-5">
      <CardHeading id={id}>{title}</CardHeading>
      {children}
    </Card>
  );
}

/** Plan actual con el botón para cambiarlo, siempre a la vista en Inicio */
function PlanCard({ userId }: { userId: string }) {
  const id = useId();
  const plan = useActivePlan(userId);
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3 self-start p-5">
      <h2 id={id} className="text-lg font-bold text-fg sm:text-xl">
        {text.plan.title}
      </h2>
      {plan === undefined ? (
        <p role="status" className="text-sm text-fg-muted">
          {t.states.loading.label}
        </p>
      ) : (
        <>
          <p className="flex items-center gap-3">
            <CreditCard aria-hidden className="size-8 shrink-0 text-primary" />
            <span className="text-2xl font-extrabold text-primary">{t.billing.plans[plan]}</span>
          </p>
          <Button asChild className="w-full">
            <Link to={screenPath('subscription')}>
              {plan === 'free' ? text.plan.upgrade : text.plan.change}
            </Link>
          </Button>
        </>
      )}
    </Card>
  );
}

function MissionsSection({ session }: { session: ReadySession }) {
  const rewards = useRewards(session);
  return (
    <SideSection title={t.widgets.names.missions}>
      {rewards ? (
        <MissionList missions={rewards.missions.daily} label={t.widgets.names.missions} />
      ) : (
        <p role="status" className="text-sm text-fg-muted">
          {t.states.loading.label}
        </p>
      )}
    </SideSection>
  );
}

/** Una sección de la columna lateral, sin marco de tarjeta, como en el diseño */
function SideSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="text-lg font-bold text-fg sm:text-xl">
        {title}
      </h2>
      {children}
    </section>
  );
}
