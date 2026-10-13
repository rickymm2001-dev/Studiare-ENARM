// Inicio (pantalla 2) con el diseño de Ricardo del 2026-10-12 (D-116). Ya no es un tablero que se
// acomoda. Saludo con racha y nivel arriba, Tus repasos (meta diaria, carga de repaso y tarjetas
// vencidas), Tus simuladores (sesgos o trampas y temas para reforzar, con calibrando), una columna con
// el plan actual y el botón para cambiarlo, las misiones de hoy y el reto de Party, y el heatmap del
// año abajo. Cada cifra sale de la bitácora con los mismos motores que el resto de la app.
// Medio centímetro (gap-5) entre todo, columnas que terminan a la misma altura y el heatmap a todo
// el ancho (D-117).
import { CreditCard, Layers, Target } from 'lucide-react';
import { useId, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { monthlyReviewLoad } from '@/engines/monthlyLoad';
import { studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { SkeletonRows } from '@/ui/components/skeleton';
import { LoadingState } from '@/ui/states/states';
import { followedDeckIds } from '../decks/followed';
import { LandingScreen } from '../landing/LandingScreen';
import { PartyWidget } from '../party/PartyWidget';
import { MissionList } from '../rewards/parts';
import { useRewards } from '../rewards/useRewards';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useAccount } from '../shared/useAccount';
import { useActivePlan } from '../shared/useActivePlan';
import { useBiasVocabulary } from '../shared/useBiasVocabulary';
import { useUserEvents } from '../shared/useUserEvents';
import { ReviewLoadCard } from './sections/ReviewLoadCard';
import { buildSnapshot, type Snapshot } from './snapshot';
import { BiasPatternWidget, WeakTopicsWidget } from './widgets/AnalysisWidgets';
import { HeatmapWidget } from './widgets/HeatmapWidget';

const text = t.home;
const NO_SETTINGS = {} as const;

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
  // Las tarjetas que Repasar sí ofrece, para que las vencidas cuenten lo mismo
  const cards = useLiveData(async () => {
    const [decks, all] = await Promise.all([api.repos.decks.list(), api.repos.cards.list()]);
    const followed = followedDeckIds(session, decks);
    return new Set(all.filter((card) => followed.has(card.deckId)).map((card) => card.id));
  }, [api.repos, session.isDemo, session.user.id, session.settings.followedDecks.join(',')]);
  const vocabulary = useBiasVocabulary();
  const load = useMemo(
    () =>
      events && cards
        ? monthlyReviewLoad({
            events,
            timeZone: user.timeZone,
            today: studyDayOf(new Date(), user.timeZone),
            monthsBack: 2,
            monthsAhead: 2,
            activeCardIds: cards,
          })
        : null,
    [events, cards, user.timeZone],
  );

  if (events === undefined || cards === undefined || account === undefined || load === null) {
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
          'grid grid-cols-1 gap-5 [grid-template-areas:"repasos"_"simuladores"_"lateral"_"heatmap"]',
          'lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:[grid-template-areas:"repasos_simuladores"_"lateral_lateral"_"heatmap_heatmap"]',
          'xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(15rem,17rem)] xl:[grid-template-areas:"repasos_simuladores_lateral"_"heatmap_heatmap_heatmap"]',
        )}
      >
        <Group title={text.reviewsTitle} className="[grid-area:repasos]">
          {/* Las tarjetas crecen hasta la altura de la fila, para que nada quede en blanco */}
          <div className="grid grow grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-5">
              <DailyGoalCard snapshot={snapshot} />
              <DueCard snapshot={snapshot} />
            </div>
            <ReviewLoadCard load={load} />
          </div>
        </Group>

        <Group
          title={text.simulatorsTitle}
          className="[grid-area:simuladores] lg:border-l lg:border-line lg:pl-5"
        >
          <AnalysisCard title={t.vocabulary[vocabulary].homeTitle}>
            <BiasPatternWidget session={session} events={events} settings={NO_SETTINGS} />
          </AnalysisCard>
          <AnalysisCard title={text.topicsTitle}>
            <WeakTopicsWidget session={session} events={events} settings={NO_SETTINGS} />
          </AnalysisCard>
        </Group>

        <aside className="grid grid-cols-1 gap-5 [grid-area:lateral] md:grid-cols-3 xl:grid-cols-1 xl:content-start xl:border-l xl:border-line xl:pl-5">
          <PlanCard userId={user.id} />
          <MissionsSection session={session} />
          <SideSection title={t.widgets.names.party_challenge}>
            <PartyWidget session={session} snapshot={snapshot} events={events} />
          </SideSection>
        </aside>

        <Card aria-label={t.widgets.names.heatmap} className="p-5 [grid-area:heatmap]">
          <HeatmapWidget
            snapshot={snapshot}
            since={studyDayOf(new Date(user.createdAt), user.timeZone)}
            settings={{ range: 365, metric: 'cards' }}
            summaryAtEnd
            fluid
          />
        </Card>
      </div>
    </>
  );
}

/**
 * Un grupo del diseño con su título, como Tus repasos. Va un paso arriba del título de las tarjetas
 * y abajo del saludo, que es el único título fuerte de la pantalla (H05 de la revisión de B2)
 */
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
      <h2 id={id} className="text-lg font-semibold text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * El título de una tarjeta dentro de un grupo, del tamaño de CardTitle. Es h3 porque el grupo ya
 * tiene su h2
 */
function CardHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="mb-2 text-base font-semibold text-fg">
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
        <Target aria-hidden className="size-8 shrink-0 text-fg-muted sm:size-9" />
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
          <Layers className="size-9 shrink-0 text-fg-muted sm:size-10" />
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
      <h2 id={id} className="text-lg font-semibold text-fg">
        {text.plan.title}
      </h2>
      {plan === undefined ? (
        // El nombre del plan y el botón, con su misma altura (H04)
        <SkeletonRows
          label={t.states.loading.label}
          rows={2}
          rowClassName="h-10"
          className="gap-3"
        />
      ) : (
        <>
          <p className="flex items-center gap-3">
            <CreditCard aria-hidden className="size-8 shrink-0 text-fg-muted" />
            <span className="text-xl font-bold text-fg">{t.billing.plans[plan]}</span>
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
        // Las tres misiones del día, cada una con su línea y su barra (H04)
        <SkeletonRows
          label={t.states.loading.label}
          rows={3}
          rowClassName="h-12"
          className="gap-3"
        />
      )}
    </SideSection>
  );
}

/** Una sección de la columna lateral, sin marco de tarjeta, como en el diseño */
function SideSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}
