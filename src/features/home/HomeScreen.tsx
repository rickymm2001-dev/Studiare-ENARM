// Inicio (pantalla 2) con el canvas de Ricardo del 2026-10-24 (D-150). Saludo con la fecha y los
// botones arriba, Tus repasos (estado de las tarjetas en anillo concéntrico, meta de hoy en anillos y
// carga de repaso en línea con sombreado), Tus simuladores (pulso de estudio en medidor, sesgos o
// trampas y temas por reforzar), la columna con el plan en marino, las misiones de hoy y el reto de
// Party, los indicadores clave, las tarjetas por rama en dona, las preguntas por día contra la semana
// pasada y el heatmap del año abajo. Cada cifra sale de la bitácora con los mismos motores que el
// resto de la app, y lo que no llega a su umbral dice calibrando y cuánto falta, nunca un número
// inventado (4.3). En modo enfoque (respuesta 82, B7) no van las misiones de hoy ni el reto de
// Party, como pide 4.12, y la columna lateral se queda solo con el plan.
import { ChartColumn, ChevronRight, CreditCard, Layers, Plus } from 'lucide-react';
import { useId, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useFocusMode } from '@/app/focusMode';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { isLive } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { TOPIC_TAG_PREFIX } from '@/data/usecases/errorCards';
import { dailyPlan, newCardsStudiedToday, type PlanKey, type PlanRow } from '@/engines/dailyPlan';
import type { Insight } from '@/engines/insights';
import {
  ACCURACY_RANGE,
  INDICATOR_THRESHOLDS,
  PACE_RANGE,
  accuracyVerdict,
  averageAnswerTime,
  paceVerdict,
  rangePosition,
  retentionByWeek,
  retentionVerdict,
  type IndicatorVerdict,
  ENARM_PACE_SECONDS,
} from '@/engines/keyIndicators';
import { monthlyReviewLoad } from '@/engines/monthlyLoad';
import { questionsByWeekday, type WeekComparison } from '@/engines/questionsByDay';
import { studyDayOf } from '@/engines/studyDay';
import {
  PULSE_THRESHOLDS,
  pulseInputFromEvents,
  studyPulse,
  type PulseInput,
  type PulseResult,
  type PulseTone,
} from '@/engines/studyPulse';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { homePlanText } from '@/i18n/homePlan';
import type { BranchTone } from '@/ui/branches';
import { BarsVsLine } from '@/ui/charts/bars-vs-line';
import { Donut } from '@/ui/charts/donut';
import { Gauge } from '@/ui/charts/gauge';
import { RangeBar } from '@/ui/charts/range-bar';
import { RingChart, type Ring } from '@/ui/charts/ring-chart';
import { Sparkline } from '@/ui/charts/sparkline';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { IndicatorCard, type IndicatorTone } from '@/ui/components/indicator-card';
import { SkeletonRows } from '@/ui/components/skeleton';
import { StatCard } from '@/ui/components/stat-card';
import { CalibratingState, LoadingState } from '@/ui/states/states';
import { followedDeckIds } from '../decks/followed';
import { LandingScreen } from '../landing/LandingScreen';
import { PartyWidget } from '../party/PartyWidget';
import { useAnalysis } from '../progress/useAnalysis';
import { settingsPath } from '../settings/sections';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useAccount } from '../shared/useAccount';
import { longDate, planStateOf } from '../billing/planState';
import { useSubscription } from '../profile/useSubscription';
import { useActivePlan } from '../shared/useActivePlan';
import { useBiasVocabulary } from '../shared/useBiasVocabulary';
import { useUserEvents } from '../shared/useUserEvents';
import { cardsByBranch, type CardGroups } from './cardsByBranch';
import { MissionList } from './missions/MissionList';
import { useMissions } from './missions/useMissions';
import { ReviewLoadCard } from './sections/ReviewLoadCard';
import { buildSnapshot, type Snapshot } from './snapshot';
import { dailyQuestions } from '../shared/dailyLimit';
import { BiasPatternWidget, WeakTopicsWidget } from './widgets/AnalysisWidgets';
import { HeatmapWidget } from './widgets/HeatmapWidget';

const text = t.home;
const NO_SETTINGS = {} as const;
/** Tres temas y no cinco, para que la columna de Tus simuladores no deje huecos en la de Tus repasos (V4-B1). Ver todos los temas lleva al resto */
const HOME_WEAK_TOPICS = { count: 3 };

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
  const subscription = useSubscription(user.id);
  const focus = useFocusMode();
  // Las tarjetas que Repasar sí ofrece, para que las vencidas cuenten lo mismo, con sus mazos y las
  // notas de Mis errores para decir la rama de cada una en la dona
  const content = useLiveData(async () => {
    const [decks, cards, errorNotes] = await Promise.all([
      api.repos.decks.list(),
      api.repos.cards.list(),
      api.repos.notes.listAllByTagPrefix(TOPIC_TAG_PREFIX),
    ]);
    const followed = followedDeckIds(session, decks);
    return {
      decks,
      cards,
      active: new Set(cards.filter((card) => followed.has(card.deckId)).map((card) => card.id)),
      noteTags: new Map(errorNotes.filter(isLive).map((note) => [note.id, { tags: note.tags }])),
    };
  }, [api.repos, session.isDemo, session.user.id, session.settings.followedDecks.join(',')]);
  const vocabulary = useBiasVocabulary();
  // El análisis del modelo del alumno, el mismo de los widgets, solo para la señal de fatiga
  const analysis = useAnalysis(session, events);
  const today = studyDayOf(new Date(), user.timeZone);
  const load = useMemo(
    () =>
      events && content
        ? monthlyReviewLoad({
            events,
            timeZone: user.timeZone,
            today,
            monthsBack: 2,
            monthsAhead: 2,
            activeCardIds: content.active,
          })
        : null,
    [events, content, user.timeZone, today],
  );
  const figures = useMemo(
    () => (events ? figuresFrom(events, user.timeZone, today) : null),
    [events, user.timeZone, today],
  );
  const groups = useMemo(
    () =>
      content
        ? cardsByBranch({
            cards: content.cards,
            decks: content.decks,
            noteTags: content.noteTags,
            activeCardIds: content.active,
          })
        : null,
    [content],
  );

  if (
    events === undefined ||
    content === undefined ||
    account === undefined ||
    subscription === undefined ||
    load === null ||
    figures === null ||
    groups === null
  ) {
    return <LoadingState />;
  }
  const snapshot = buildSnapshot({
    events,
    user,
    settings,
    now: new Date(),
    activeCardIds: content.active,
  });
  // Las preguntas del plan de hoy no pasan del tope diario del plan, que en Gratis es de 20
  const questionsCap = dailyQuestions({
    events,
    subscription,
    timeZone: user.timeZone,
    now: new Date(),
  }).limit;
  const plan = dailyPlan({
    questionsCap,
    limits: {
      reviewsPerDay: settings.reviewsPerDay,
      newCardsPerDay: settings.newCardsPerDay,
      unlimitedNewCards: settings.unlimitedNewCards,
      questionsPerDay: settings.questionsPerDay,
    },
    done: {
      cards: snapshot.todayActivity.cards,
      newCards: newCardsStudiedToday(events, snapshot.today),
      questions: snapshot.todayActivity.questions,
    },
  });
  const questionsTarget = plan.find((row) => row.key === 'questions')?.target ?? 0;
  const fatigue = analysis?.report.insights.find((insight) => insight.id === 'fatigue');

  return (
    <>
      <ScreenHeader
        title={text.welcome(user.alias, account?.sex ?? null)}
        documentTitle={t.screens.home.title}
        description={text.lead(snapshot.dueCards, questionsTarget)}
        actions={
          <>
            <DatePill today={snapshot.today} />
            <Button asChild>
              <Link to={screenPath('review')}>{text.startReviews}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to={settingsPath('apariencia')}>
                <Plus aria-hidden />
                {text.customize}
              </Link>
            </Button>
          </>
        }
      />
      {/* Doce columnas desde lg, como el canvas. En el teléfono todo va en una columna, en el orden
          del artboard del teléfono, que es el mismo de arriba abajo */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Group title={text.reviewsTitle} className="lg:col-span-5">
          <CardsStatusCard status={snapshot.cardStatus} />
          <div className="grid grow grid-cols-1 gap-5 sm:grid-cols-2">
            <DailyGoalCard snapshot={snapshot} plan={plan} questionsCap={questionsCap} />
            <ReviewLoadCard load={load} />
          </div>
        </Group>

        <Group title={text.simulatorsTitle} className="lg:col-span-4">
          <PulseCard pulse={figures.pulse} />
          <AnalysisCard tone="panel" title={t.vocabulary[vocabulary].homeTitle}>
            <BiasPatternWidget session={session} events={events} settings={NO_SETTINGS} />
          </AnalysisCard>
          <AnalysisCard title={text.topicsTitle}>
            <WeakTopicsWidget session={session} events={events} settings={HOME_WEAK_TOPICS} />
            <Button asChild variant="link" size="sm" className="mt-2 self-start px-0">
              <Link to={screenPath('simulatorSetup')}>{text.simulateTopics}</Link>
            </Button>
          </AnalysisCard>
        </Group>

        {/* En modo enfoque solo queda el plan */}
        <aside
          aria-label={text.asideLabel}
          className="grid grid-cols-1 gap-5 md:grid-cols-3 lg:col-span-3 lg:grid-cols-1 lg:content-start"
        >
          <PlanCard userId={user.id} />
          {focus ? null : (
            <>
              <MissionsCard session={session} />
              <SideCard tone="sage" title={t.widgets.names.party_challenge}>
                <PartyWidget session={session} snapshot={snapshot} events={events} />
              </SideCard>
            </>
          )}
        </aside>

        <KeyIndicators
          figures={figures}
          desiredRetention={settings.desiredRetention}
          fatigue={analysis === undefined ? undefined : (fatigue ?? null)}
        />

        {/* Las dos tarjetas de abajo van bajo un título que solo oye el lector de pantalla, para que
            sus h3 sigan el orden de los demás grupos */}
        <section
          aria-labelledby="home-cards-and-questions"
          className="grid grid-cols-1 gap-5 lg:col-span-12 lg:grid-cols-12"
        >
          <h2 id="home-cards-and-questions" className="sr-only">
            {text.branches.title}, {text.questions.title}
          </h2>
          <BranchCard groups={groups} className="lg:col-span-5" />
          <QuestionsCard week={figures.week} className="lg:col-span-7" />
        </section>

        <HeatmapCard
          snapshot={snapshot}
          since={studyDayOf(new Date(user.createdAt), user.timeZone)}
        />
      </div>
    </>
  );
}

/** Las cifras de Inicio que salen de la bitácora con los motores puros */
interface Figures {
  pulseInput: PulseInput;
  pulse: PulseResult;
  pace: ReturnType<typeof averageAnswerTime>;
  retentionWeeks: ReturnType<typeof retentionByWeek>;
  week: WeekComparison;
}

function figuresFrom(events: readonly AppEvent[], timeZone: string, today: string): Figures {
  const pulseInput = pulseInputFromEvents({ events, timeZone, today });
  return {
    pulseInput,
    pulse: studyPulse(pulseInput),
    pace: averageAnswerTime({ events, timeZone, today }),
    retentionWeeks: retentionByWeek({ events, timeZone, today }),
    week: questionsByWeekday({ events, timeZone, today }),
  };
}

/** La fecha de hoy en píldora, con el número del día en un círculo crema */
function DatePill({ today }: { today: string }) {
  const date = new Date(`${today}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: 'UTC' }).format(
    date,
  );
  const longDay = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  return (
    <p className="flex items-center gap-3 rounded-full border border-line bg-surface py-1.5 pr-4 pl-1.5">
      <span className="sr-only">{text.dateLabel(`${weekday} ${longDay}`)}</span>
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cream text-base font-extrabold text-heading tabular-nums"
      >
        {Number(today.slice(8, 10))}
      </span>
      <span aria-hidden className="flex flex-col leading-tight">
        <span className="text-sm font-bold">
          {weekday.charAt(0).toUpperCase() + weekday.slice(1)}
        </span>
        <span className="text-xs text-fg-muted">{longDay}</span>
      </span>
    </p>
  );
}

/** Un grupo del diseño con su título, como Tus repasos. Es el h2 de grupo de 22 px del canvas */
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
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-4', className)}>
      <h2 id={id} className="group-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** El título de una tarjeta dentro de un grupo. Es h3 porque el grupo ya tiene su h2 */
function CardHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-base font-bold text-fg">
      {children}
    </h3>
  );
}

/** Ícono en círculo cielo junto al título, como las tarjetas de cifra */
function IconCircle({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink [&_svg]:size-5"
    >
      {children}
    </span>
  );
}

/** Estado de las tarjetas activas en anillo concéntrico. Al día en cielo, vencidas en ámbar y olvidadas en rojo */
function CardsStatusCard({ status }: { status: Snapshot['cardStatus'] }) {
  const id = useId();
  const { active, upToDate, due, forgotten } = status;
  const rings: Ring[] = [
    { value: upToDate, max: active, strokeClass: 'stroke-indicator' },
    { value: due, max: active, strokeClass: 'stroke-chart-compare' },
    { value: forgotten, max: active, strokeClass: 'stroke-danger' },
  ];
  const legend = [
    { name: text.cards.upToDate, value: upToDate, color: 'bg-indicator' },
    { name: text.cards.due, value: due, color: 'bg-chart-compare' },
    { name: text.cards.forgotten, value: forgotten, color: 'bg-danger' },
  ];
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <IconCircle>
          <Layers />
        </IconCircle>
        <CardHeading id={id}>{text.cards.title}</CardHeading>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <RingChart
          rings={rings}
          size={160}
          label={text.cards.label(active, upToDate, due, forgotten)}
        />
        <div className="flex min-w-40 flex-1 flex-col gap-3">
          <p className="flex flex-col gap-1">
            <span className="text-sm text-fg-muted">{text.cards.active}</span>
            <span className="text-3xl leading-none font-extrabold tracking-tight tabular-nums">
              {active.toLocaleString('es-MX')}
            </span>
          </p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {legend.map((row) => (
              <li key={row.name} className="flex items-center gap-2.5">
                <span aria-hidden className={cn('h-3.5 w-1 shrink-0 rounded-sm', row.color)} />
                <span className="text-fg-muted">{row.name}</span>
                <strong className="ml-auto tabular-nums">
                  {row.value.toLocaleString('es-MX')}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/** Color de cada fila de la meta de hoy en los anillos y en su leyenda. La racha va en su acento */
const GOAL_COLORS: Record<GoalRowKey, { stroke: string; dot: string }> = {
  cards: { stroke: 'stroke-indicator', dot: 'bg-indicator' },
  newCards: { stroke: 'stroke-chart-done', dot: 'bg-chart-done' },
  questions: { stroke: 'stroke-success', dot: 'bg-success' },
  streak: { stroke: 'stroke-streak', dot: 'bg-streak' },
};

type GoalRowKey = PlanKey | 'streak';

/** Una fila de la meta de hoy. Las tres del plan de la guía y la cuarta de la racha (V5, D-151) */
interface GoalRow {
  key: GoalRowKey;
  name: string;
  done: number;
  target: number;
  /** De 0 a 1 */
  fraction: number;
  capped: boolean;
}

function DailyGoalCard({
  snapshot,
  plan,
  questionsCap,
}: {
  snapshot: Snapshot;
  plan: PlanRow[];
  questionsCap: number | null;
}) {
  const id = useId();
  const { goal } = snapshot;
  // Una frase por día, la misma durante todo el día de estudio
  const dayNumber = Math.floor(Date.parse(`${snapshot.today}T12:00:00Z`) / 86_400_000);
  const quote = text.quotes[dayNumber % text.quotes.length] ?? text.quotes[0];
  // La meta de la racha que el alumno eligió en la bienvenida, con su métrica y su cifra. Siempre
  // existe, porque el esquema la trae por omisión, así que la fila siempre se ve
  const streakDone = snapshot.todayActivity[goal.metric];
  const streakRow: GoalRow = {
    key: 'streak',
    name: text.goal.streakRow(t.widgets.goal.metricNames[goal.metric]),
    done: streakDone,
    target: goal.value,
    fraction: Math.min(streakDone / goal.value, 1),
    capped: false,
  };
  const rows: GoalRow[] = [
    ...plan.map((row) => ({ ...row, name: t.widgets.plan.rows[row.key] })),
    streakRow,
  ];
  // El avance del día es el promedio de sus filas, cada una recortada al 100 por ciento
  const percent = Math.round(
    (rows.reduce((sum, row) => sum + row.fraction, 0) / rows.length) * 100,
  );
  const rings: Ring[] = rows.map((row) => ({
    value: row.done,
    max: row.target,
    strokeClass: GOAL_COLORS[row.key].stroke,
  }));
  return (
    <Card tone="cream" aria-labelledby={id} className="flex grow flex-col gap-3">
      <CardHeading id={id}>{text.goal.title}</CardHeading>
      {/* Cuatro aros más finos que los tres del estado de las tarjetas, para que la cifra quepa en el
          centro */}
      <RingChart
        rings={rings}
        size={160}
        thickness={9}
        className="self-center"
        label={text.goal.label(
          percent,
          rows.map((row) => text.goal.row(row.name, row.done, row.target)).join(', '),
        )}
      >
        <span className="text-xl font-extrabold tracking-tight tabular-nums">
          {text.goal.percent(percent)}
        </span>
        <span className="text-xs text-fg-muted">{text.goal.ofDay}</span>
      </RingChart>
      <ul className="flex flex-col gap-1.5 text-xs">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-0.5">
            <span className="grid grid-cols-[0.625rem_1fr_auto] items-center gap-2">
              <span
                aria-hidden
                className={cn('size-2.5 rounded-[3px]', GOAL_COLORS[row.key].dot)}
              />
              <span>{text.goal.row(row.name, row.done, row.target)}</span>
              <strong className="tabular-nums">
                {text.goal.percent(Math.round(row.fraction * 100))}
              </strong>
            </span>
            {row.capped && questionsCap !== null ? (
              <span className="pl-[1.125rem] text-fg-muted">
                {homePlanText.capped(questionsCap)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <figure className="mt-auto text-xs">
        <blockquote>{quote.text}</blockquote>
        <figcaption className="text-fg-muted">{quote.author}</figcaption>
      </figure>
    </Card>
  );
}

const PULSE_STROKE: Record<PulseTone, string> = {
  good: 'stroke-success',
  near: 'stroke-warning',
  low: 'stroke-danger',
};
const PULSE_TEXT: Record<PulseTone, string> = {
  good: 'text-success',
  near: 'text-warning',
  low: 'text-danger',
};

/** Pulso de estudio en medidor, con su estado en palabras y sus tres partes. Calibra con lo que falta */
function PulseCard({ pulse }: { pulse: PulseResult }) {
  const id = useId();
  return (
    <Card tone="cream" aria-labelledby={id} className="flex flex-col gap-4">
      <CardHeading id={id}>{text.pulse.title}</CardHeading>
      {pulse.calibrating ? (
        <PulseCalibrating needed={pulse.needed} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <Gauge
              value={pulse.score}
              max={100}
              width={170}
              strokeClass={PULSE_STROKE[pulse.tone]}
              label={text.pulse.label(pulse.score)}
            >
              <span className="text-2xl font-extrabold tracking-tight tabular-nums">
                {pulse.score}
                <span className="text-xs font-semibold text-fg-muted">{text.pulse.outOf}</span>
              </span>
            </Gauge>
            <div className="flex min-w-32 flex-1 flex-col gap-1">
              <span className={cn('text-lg font-extrabold', PULSE_TEXT[pulse.tone])}>
                {text.pulse.states[pulse.tone]}
              </span>
              <span className="text-sm leading-relaxed">
                {text.pulse.parts(
                  pulse.parts.consistency.points,
                  pulse.parts.consistency.max,
                  pulse.parts.accuracy.points,
                  pulse.parts.accuracy.max,
                  pulse.parts.retention.points,
                  pulse.parts.retention.max,
                )}
              </span>
            </div>
          </div>
          <Button asChild className="w-full">
            <Link to={screenPath('progress')}>
              {text.pulse.breakdown}
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </>
      )}
    </Card>
  );
}

/**
 * Calibrando con la parte del umbral a la que más le falta en la barra y, debajo, lo que falta de las
 * otras dos. La barra ya dice cuánto falta de la primera, así que la frase no la repite
 */
function PulseCalibrating({
  needed,
}: {
  needed: { activeDays: number; answered: number; reviews: number };
}) {
  const items = (
    [
      { key: 'activeDays', missing: needed.activeDays, target: PULSE_THRESHOLDS.activeDays },
      { key: 'answered', missing: needed.answered, target: PULSE_THRESHOLDS.answered },
      { key: 'reviews', missing: needed.reviews, target: PULSE_THRESHOLDS.reviews },
    ] as const
  )
    .filter((item) => item.missing > 0)
    .sort((a, b) => b.missing / b.target - a.missing / a.target);
  const lead = items[0] ?? {
    key: 'reviews' as const,
    missing: 0,
    target: PULSE_THRESHOLDS.reviews,
  };
  const rest = { ...needed, [lead.key]: 0 };
  const note = text.pulse.calibratingNote(rest.activeDays, rest.answered, rest.reviews);
  return (
    <CalibratingState
      current={lead.target - lead.missing}
      target={lead.target}
      unit={text.pulse.units[lead.key]}
      description={note === '' ? text.pulse.calibratingHint : note}
      className="py-0"
    />
  );
}

function AnalysisCard({
  title,
  tone = 'surface',
  children,
}: {
  title: string;
  tone?: 'surface' | 'panel';
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Card tone={tone} aria-labelledby={id} className="flex grow flex-col gap-3">
      <CardHeading id={id}>{title}</CardHeading>
      {children}
    </Card>
  );
}

/**
 * Plan actual en marino con el botón blanco para cambiarlo, siempre a la vista en Inicio. Con la
 * prueba gratis dice hasta cuándo dura (B10, 3.4)
 */
function PlanCard({ userId }: { userId: string }) {
  const id = useId();
  const plan = useActivePlan(userId);
  const subscription = useSubscription(userId);
  const trial = planStateOf(subscription);
  return (
    <Card tone="navy" aria-labelledby={id} className="flex flex-col gap-3 self-start">
      <h2 id={id} className="text-xs font-bold tracking-[0.12em] text-primary-fg/80 uppercase">
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
            <CreditCard aria-hidden className="size-7 shrink-0 text-primary-fg/80" />
            <span className="text-xl font-extrabold">{t.billing.plans[plan]}</span>
          </p>
          {trial?.kind === 'trialing' ? (
            <p className="text-sm text-primary-fg/80">
              {billingCloudText.trialUntil(longDate(trial.end))}
            </p>
          ) : null}
          <Button
            asChild
            className="w-full bg-white text-primary hover:bg-white/90 active:bg-white/80"
          >
            <Link to={screenPath('subscription')}>
              {plan === 'free' ? text.plan.upgrade : text.plan.change}
            </Link>
          </Button>
        </>
      )}
    </Card>
  );
}

function MissionsCard({ session }: { session: ReadySession }) {
  const missions = useMissions(session);
  return (
    <SideCard tone="cream" title={t.widgets.names.missions}>
      {missions ? (
        <MissionList missions={missions} label={t.widgets.names.missions} />
      ) : (
        // Las tres misiones del día, cada una con su línea y su barra (H04)
        <SkeletonRows
          label={t.states.loading.label}
          rows={3}
          rowClassName="h-12"
          className="gap-3"
        />
      )}
    </SideCard>
  );
}

/** Una tarjeta de la columna lateral. Su título es h2 porque la columna no tiene uno propio */
function SideCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'cream' | 'sage';
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Card tone={tone} aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="text-base font-bold text-fg">
        {title}
      </h2>
      {children}
    </Card>
  );
}

const VERDICT_TONE: Record<IndicatorVerdict, IndicatorTone> = {
  good: 'good',
  near: 'near',
  low: 'near',
};

/**
 * Indicadores clave. Retención, aciertos y tiempo por pregunta de los últimos 30 días, y la señal de
 * fatiga del informe de insights. Cada uno calibra con su umbral y dice cuánto falta (4.3)
 */
function KeyIndicators({
  figures,
  desiredRetention,
  fatigue,
}: {
  figures: Figures;
  desiredRetention: number;
  /** undefined mientras el análisis carga, null si el informe no trae la señal */
  fatigue: Insight | null | undefined;
}) {
  const id = useId();
  const { pulseInput, pace, retentionWeeks } = figures;
  const calibrating = t.states.calibrating.title;
  const texts = text.indicators;
  const retention = pulseInput.reviews > 0 ? pulseInput.recalled / pulseInput.reviews : 0;
  const retentionPoints = retentionWeeks
    .map((week) => week.retention)
    .filter((value): value is number => value !== null)
    .map((value) => Math.round(value * 100));
  const accuracy = pulseInput.answered > 0 ? pulseInput.correct / pulseInput.answered : 0;
  const seconds = pace.averageMs === null ? null : Math.round(pace.averageMs / 1000);
  const goalPercent = Math.round(desiredRetention * 100);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3.5 lg:col-span-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="group-title">
          {texts.title}
        </h2>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to={screenPath('progress')}>{texts.seeAll}</Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pulseInput.reviews < INDICATOR_THRESHOLDS.reviews ? (
          <IndicatorCard
            title={texts.retention.title}
            state={calibrating}
            tone="calibrating"
            value={pulseInput.reviews.toLocaleString('es-MX')}
            unit={`de ${String(INDICATOR_THRESHOLDS.reviews)} ${texts.retention.unit}`}
            note={texts.missing(
              INDICATOR_THRESHOLDS.reviews - pulseInput.reviews,
              texts.retention.unit,
            )}
          />
        ) : (
          <IndicatorCard
            title={texts.retention.title}
            state={texts.retention.states[retentionVerdict(retention, desiredRetention)]}
            tone={VERDICT_TONE[retentionVerdict(retention, desiredRetention)]}
            value={Math.round(retention * 100)}
            unit="%"
            note={texts.retention.note(goalPercent)}
          >
            {retentionPoints.length >= 2 ? (
              <Sparkline
                values={retentionPoints}
                strokeClass="stroke-success"
                fillClass="fill-success"
                height={40}
                label={texts.retention.chartLabel(retentionWeeks.length)}
              />
            ) : null}
          </IndicatorCard>
        )}
        {pulseInput.answered < INDICATOR_THRESHOLDS.answered ? (
          <IndicatorCard
            title={texts.accuracy.title}
            state={calibrating}
            tone="calibrating"
            value={pulseInput.answered.toLocaleString('es-MX')}
            unit={`de ${String(INDICATOR_THRESHOLDS.answered)} ${texts.accuracy.unit}`}
            note={texts.missing(
              INDICATOR_THRESHOLDS.answered - pulseInput.answered,
              texts.accuracy.unit,
            )}
          />
        ) : (
          <IndicatorCard
            title={texts.accuracy.title}
            state={texts.accuracy.states[accuracyVerdict(accuracy)]}
            tone={VERDICT_TONE[accuracyVerdict(accuracy)]}
            value={Math.round(accuracy * 100)}
            unit="%"
          >
            <RangeBar
              zones={['bad', 'mid', 'good']}
              position={rangePosition(accuracy, ACCURACY_RANGE.min, ACCURACY_RANGE.max)}
              label={texts.accuracy.label(Math.round(accuracy * 100))}
              ticks={texts.accuracy.ticks}
            />
          </IndicatorCard>
        )}
        {seconds === null || pace.answered < INDICATOR_THRESHOLDS.answered ? (
          <IndicatorCard
            title={texts.pace.title}
            state={calibrating}
            tone="calibrating"
            value={pace.answered.toLocaleString('es-MX')}
            unit={`de ${String(INDICATOR_THRESHOLDS.answered)} ${texts.pace.unit}`}
            note={texts.missing(INDICATOR_THRESHOLDS.answered - pace.answered, texts.pace.unit)}
          />
        ) : (
          <IndicatorCard
            title={texts.pace.title}
            state={texts.pace.states[paceVerdict(seconds)]}
            tone={VERDICT_TONE[paceVerdict(seconds)]}
            value={seconds}
            unit="s"
          >
            <RangeBar
              zones={['good', 'mid', 'bad']}
              position={rangePosition(seconds, PACE_RANGE.min, PACE_RANGE.max)}
              label={texts.pace.label(seconds, ENARM_PACE_SECONDS)}
              ticks={texts.pace.ticks(ENARM_PACE_SECONDS)}
            />
          </IndicatorCard>
        )}
        <FatigueIndicator fatigue={fatigue} />
      </div>
    </section>
  );
}

/**
 * La señal de fatiga del informe de insights (fatigueSignal). Hasta tener tres sesiones largas dice
 * calibrando. Después muestra el cambio de aciertos del último tercio, en puntos, nunca un puntaje inventado
 */
function FatigueIndicator({ fatigue }: { fatigue: Insight | null | undefined }) {
  const texts = text.indicators.fatigue;
  if (fatigue === undefined) {
    // El análisis todavía carga. Lo dice solo el lector de pantalla
    return (
      <IndicatorCard
        title={texts.title}
        state={t.states.loading.label}
        tone="calibrating"
        value={<span aria-hidden>…</span>}
      />
    );
  }
  if (fatigue === null || fatigue.state.kind === 'calibrating') {
    const have = fatigue?.state.kind === 'calibrating' ? fatigue.state.have : 0;
    const need = fatigue?.state.kind === 'calibrating' ? fatigue.state.need : 3;
    return (
      <IndicatorCard
        title={texts.title}
        state={t.states.calibrating.title}
        tone="calibrating"
        value={have.toLocaleString('es-MX')}
        unit={`de ${need.toLocaleString('es-MX')} ${texts.calibratingUnit}`}
        note={texts.calibratingNote}
      />
    );
  }
  const drop = fatigue.state.values.drop ?? 0;
  const sessions = fatigue.state.values.sessions ?? 0;
  const points = Math.round(Math.abs(drop) * 100);
  const signal = fatigue.state.level === 'focus';
  return (
    <IndicatorCard
      title={texts.title}
      state={signal ? texts.states.signal : texts.states.none}
      tone={signal ? 'near' : 'good'}
      value={`${drop > 0 ? '+' : drop < 0 ? '−' : ''}${String(points)}`}
      unit={texts.unit}
      note={texts.note(sessions)}
    />
  );
}

/** Color de cada rama en la dona y en su leyenda (D-128) */
const BRANCH_COLORS: Record<BranchTone, { stroke: string; dot: string }> = {
  mi: { stroke: 'stroke-mi', dot: 'bg-mi' },
  ped: { stroke: 'stroke-ped', dot: 'bg-ped' },
  gyo: { stroke: 'stroke-gyo', dot: 'bg-gyo' },
  cir: { stroke: 'stroke-cir', dot: 'bg-cir' },
  fam: { stroke: 'stroke-fam', dot: 'bg-fam' },
  urg: { stroke: 'stroke-urg', dot: 'bg-urg' },
  neutral: { stroke: 'stroke-line-strong', dot: 'bg-line-strong' },
};
/** Cuando se agrupa por mazo no hay color de rama, así que van los de las gráficas, por turno */
const DECK_COLORS = [
  { stroke: 'stroke-chart-scheduled', dot: 'bg-chart-scheduled' },
  { stroke: 'stroke-chart-done', dot: 'bg-chart-done' },
  { stroke: 'stroke-chart-compare', dot: 'bg-chart-compare' },
  { stroke: 'stroke-success', dot: 'bg-success' },
  { stroke: 'stroke-accent', dot: 'bg-accent' },
  { stroke: 'stroke-danger', dot: 'bg-danger' },
] as const;

/** Tarjetas activas por rama en dona, o por mazo si alguna no tiene rama */
function BranchCard({ groups, className }: { groups: CardGroups; className?: string }) {
  const id = useId();
  const colorOf = (tone: BranchTone, index: number) =>
    groups.byBranch
      ? BRANCH_COLORS[tone]
      : (DECK_COLORS[index % DECK_COLORS.length] ?? DECK_COLORS[0]);
  const parts = groups.groups
    .map((group) =>
      text.branches.part(group.name, Math.round((group.count / Math.max(groups.total, 1)) * 100)),
    )
    .join(', ');
  return (
    // Vacía queda a su altura y no se estira a la de Preguntas por día, que dejaría un hueco grande
    <Card
      aria-labelledby={id}
      className={cn('flex flex-col gap-4', groups.total === 0 && 'lg:self-start', className)}
    >
      <CardHeading id={id}>
        {groups.byBranch ? text.branches.title : text.branches.byDeck}
      </CardHeading>
      {groups.total === 0 ? (
        <p className="text-sm text-fg-muted">{text.branches.empty}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Donut
            segments={groups.groups.map((group, index) => ({
              value: group.count,
              strokeClass: colorOf(group.tone, index).stroke,
            }))}
            size={190}
            label={text.branches.label(groups.total, parts)}
          >
            <span className="text-xs text-fg-muted">{text.branches.center}</span>
            <span className="text-2xl font-extrabold tracking-tight tabular-nums">
              {groups.total.toLocaleString('es-MX')}
            </span>
          </Donut>
          <ul className="grid min-w-44 flex-1 grid-cols-2 gap-x-3 gap-y-2">
            {groups.groups.map((group, index) => (
              <li key={group.key} className="flex gap-2">
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 size-3 shrink-0 rounded-[3px]',
                    colorOf(group.tone, index).dot,
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{group.name}</span>
                  <span className="text-xs text-fg-muted tabular-nums">
                    {group.count.toLocaleString('es-MX')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Preguntas por día de esta semana en barras, contra la semana pasada en línea */
function QuestionsCard({ week, className }: { week: WeekComparison; className?: string }) {
  const texts = text.questions;
  const diff = week.totalCurrent - week.totalPrevious;
  const delta = {
    text: diff > 0 ? texts.more(diff) : diff < 0 ? texts.fewer(-diff) : texts.same,
    direction: diff > 0 ? ('up' as const) : diff < 0 ? ('down' as const) : ('flat' as const),
  };
  return (
    <StatCard
      icon={<ChartColumn />}
      title={texts.title}
      value={week.totalCurrent.toLocaleString('es-MX')}
      delta={delta}
      caption={texts.caption(week.averageCurrent)}
      className={className}
    >
      <BarsVsLine
        current={week.current}
        previous={week.previous}
        labels={texts.weekdays}
        caption={texts.tableCaption}
        currentName={texts.thisWeek}
        previousName={texts.lastWeek}
      />
      <div className="flex flex-wrap gap-3.5 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[3px] bg-chart-scheduled" />
          {texts.thisWeek}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full border-2 border-chart-compare" />
          {texts.lastWeek}
        </span>
      </div>
    </StatCard>
  );
}

/** El heatmap del año con su título y la escala de Menos a Más en la misma fila */
function HeatmapCard({ snapshot, since }: { snapshot: Snapshot; since: string }) {
  const id = useId();
  return (
    <Card aria-labelledby={id} className="lg:col-span-12">
      <HeatmapWidget
        snapshot={snapshot}
        since={since}
        settings={{ range: 365, metric: 'cards' }}
        summaryAtEnd
        fluid
        header={
          <h2 id={id} className="group-title">
            {text.yearTitle}
          </h2>
        }
        detailLink={
          <Link
            to={screenPath('calendar')}
            className="font-medium text-primary-ink underline underline-offset-2"
          >
            {t.calendar.heatmapLink}
          </Link>
        }
      />
    </Card>
  );
}
