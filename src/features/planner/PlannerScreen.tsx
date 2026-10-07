// Planificador (pantalla 13, 7.10). Plan de hoy y de la semana con la carga real de repaso del
// alumno, su tiempo disponible y los temas a reforzar. Si la carga no cabe en el tiempo, avisa y
// propone ajustes con su efecto en minutos al día. Los minutos salen del promedio real cuando hay
// 3 días de estudio y, mientras tanto, de lo que declara el alumno o de un valor inicial que
// aparece como calibrando.
import { BookOpenCheck, ClipboardList, Flag, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { updateProfile } from '@/data/usecases/profile';
import { topicTaxonomy } from '@/demo/content';
import { analyzeTopics, type TopicResponse } from '@/engines/topics';
import { suspendedCardIds } from '@/engines/suspension';
import { examDateFor } from '@/config/exam';
import { addDays, studyDayOf } from '@/engines/studyDay';
import type { DayPlan, OverloadOption } from '@/engines/planner';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { ProgressBar } from '@/ui/components/progress-bar';
import { CalibratingNote, EmptyState, LoadingState } from '@/ui/states/states';
import { followedDeckIds } from '../decks/followed';
import { buildSnapshot } from '../home/snapshot';
import { latestCardStates, reviewedToday } from '../review/study';
import { schedulerConfig } from '../review/schedulerConfig';
import { topicsCalibration } from '../progress/analysis';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { dailyQuestions } from '../shared/dailyLimit';
import { reservedByStoredExam } from '../exam/examStorage';
import { buildPlannerView, MEASURED_DAYS_NEEDED, type PlannerView } from './planView';

const topicName = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, topic.name] as const),
  ),
);

export function PlannerScreen() {
  return (
    <RequireSession screen="planner">{(session) => <Planner session={session} />}</RequireSession>
  );
}

function Planner({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const events = useUserEvents(user.id);
  const content = useLiveData(async () => {
    const [decks, cards] = await Promise.all([api.repos.decks.list(), api.repos.cards.list()]);
    return { decks, cards };
  }, [api.repos]);
  const questions = useLiveData(() => api.repos.questions.listLatest(), [api.repos]);
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(user.id).then((value) => value ?? null),
    [api.repos, user.id],
  );

  const ready =
    events !== undefined &&
    content !== undefined &&
    questions !== undefined &&
    subscription !== undefined;
  const result = useMemo(() => {
    if (!ready) return null;
    const now = new Date();
    const today = studyDayOf(now, user.timeZone);
    const followed = followedDeckIds(session, content.decks);
    // Las tarjetas suspendidas no cuentan para la carga ni para el plan (D-085)
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
    // El plan Gratis solo deja 20 preguntas al día, así que el bloque de práctica no pasa de ahí
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
    });
    // Si ya hay temas con dominio listo, el plan apunta al más débil. Si no, dice cuánto falta
    const calibration =
      analysis.priorities.length > 0
        ? null
        : topicsCalibration(
            new Map(analysis.topics.map((entry) => [entry.topic, entry])),
            DEFAULT_THRESHOLDS.topics.minResponsesPerTopic,
          );
    return { view, today, calibration, limit: daily.limit };
    // session cambia con el perfil, así que sus ajustes y su alumno ya están cubiertos
  }, [ready, events, content, questions, subscription, session, user, settings]);

  const header = (
    <ScreenHeader title={t.screens.planner.title} description={t.screens.planner.description} />
  );
  if (result === null) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  const { view, today, calibration, limit } = result;
  return (
    <>
      {header}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <TodayCard view={view} calibration={calibration} limit={limit} />
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
          <MinutesCard session={session} view={view} />
        </div>
      </div>
      <WeekCard week={view.plan.week} today={today} />
    </>
  );
}

const minutes = (value: number) => Math.round(value);

function TodayCard({
  view,
  calibration,
  limit,
}: {
  view: PlannerView;
  /** Preguntas por día del plan. null es sin límite */
  limit: number | null;
  /** Cuánto falta para que el plan apunte a un tema débil. null si ya hay temas listos */
  calibration: { have: number; need: number } | null;
}) {
  const { today } = view.plan;
  const topic = today.simulatorTopic;
  const topicLabel = topic ? (topicName.get(topic) ?? topic) : null;
  const rows = [
    today.reviews + today.newCards > 0
      ? {
          key: 'cards',
          icon: <BookOpenCheck />,
          text: t.planner.cardsLine(today.reviews, today.newCards),
          to: screenPath('review'),
          action: t.planner.goReview,
        }
      : null,
    today.simulatorQuestions > 0
      ? {
          key: 'simulator',
          icon: <ClipboardList />,
          text: t.planner.simulator(today.simulatorQuestions, topicLabel),
          to: topic
            ? `${screenPath('simulatorSetup')}?topic=${encodeURIComponent(topic)}`
            : screenPath('simulatorSetup'),
          action: t.planner.goSimulate,
        }
      : null,
    today.challenge
      ? {
          key: 'challenge',
          icon: <Flag />,
          text: t.planner.challenge(10),
          to: screenPath('party'),
          action: t.planner.goParty,
        }
      : null,
  ].filter((row) => row !== null);

  return (
    <Card aria-labelledby="plan-hoy">
      <CardHeader className="mb-2 flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle id="plan-hoy">{t.planner.todayTitle}</CardTitle>
        <span className="text-sm text-fg-muted">
          {t.planner.minutesOf(minutes(today.minutesPlanned), minutes(today.minutesAvailable))}
        </span>
      </CardHeader>
      <ProgressBar
        value={today.minutesPlanned}
        max={today.minutesAvailable}
        label={t.planner.minutesOf(minutes(today.minutesPlanned), minutes(today.minutesAvailable))}
        className="mb-3 h-2"
      />
      {rows.length === 0 ? (
        <EmptyState
          title={t.planner.nothingToday}
          description={t.planner.nothingTodayHint}
          className="py-5"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line p-3"
            >
              <span aria-hidden className="text-primary [&_svg]:size-5">
                {row.icon}
              </span>
              <span className="min-w-0 flex-1 font-medium">{row.text}</span>
              <Button asChild size="sm" variant="secondary">
                <Link to={row.to}>{row.action}</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {today.simulatorCapped && limit !== null ? (
        <p className="mt-3 text-sm text-fg-muted">{t.planner.limitNote(limit)}</p>
      ) : null}
      {view.cardCount === 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted p-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t.planner.noDecksTitle}</p>
            <p className="text-sm text-fg-muted">{t.planner.noDecksBody}</p>
          </div>
          <Button asChild size="sm">
            <Link to={screenPath('decks')}>{t.planner.goDecks}</Link>
          </Button>
        </div>
      ) : null}
      {calibration ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <CalibratingNote
            current={calibration.have}
            target={calibration.need}
            unit={t.widgets.weakTopics.unit}
          />
          <p className="text-sm text-fg-muted">{t.planner.topicsCalibrating}</p>
        </div>
      ) : null}
    </Card>
  );
}

function OverloadCard({
  session,
  needed,
  available,
  options,
}: {
  session: ReadySession;
  needed: number;
  available: number;
  options: readonly OverloadOption[];
}) {
  const api = useDataApi();
  const [applied, setApplied] = useState(false);
  const apply = (option: OverloadOption) => {
    const patch =
      option.action === 'reduce_new'
        ? updateProfile(api, session.user, { settings: { newCardsPerDay: option.value } })
        : updateProfile(api, session.user, { dailyMinutes: Math.min(720, option.value) });
    void patch.then(() => {
      setApplied(true);
    });
  };
  return (
    <Card aria-labelledby="sobrecarga" className="border-l-4 border-l-warning">
      <CardHeader className="mb-2">
        <CardTitle id="sobrecarga" className="flex items-center gap-2 [&_svg]:size-5">
          <TriangleAlert aria-hidden className="text-warning" />
          {t.planner.overloadTitle}
        </CardTitle>
      </CardHeader>
      <p className="mb-3 text-sm text-fg-muted">
        {t.planner.overloadBody(minutes(needed), minutes(available))}
      </p>
      <ul className="flex flex-col gap-2">
        {options.map((option) => (
          <li
            key={option.action}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line p-3"
          >
            <span className="min-w-0 flex-1 text-sm">
              {option.action === 'reduce_new'
                ? t.planner.reduceNew(option.value, minutes(option.effectMinutesPerDay))
                : t.planner.raiseMinutes(
                    Math.min(720, option.value),
                    minutes(option.effectMinutesPerDay),
                  )}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                apply(option);
              }}
            >
              {t.planner.apply}
            </Button>
          </li>
        ))}
      </ul>
      <p role="status" className={applied ? 'mt-2 text-sm text-success' : 'sr-only'}>
        {applied ? t.planner.applied : ''}
      </p>
    </Card>
  );
}

function MinutesCard({ session, view }: { session: ReadySession; view: PlannerView }) {
  const api = useDataApi();
  const { user } = session;
  const [value, setValue] = useState(String(user.dailyMinutes ?? ''));
  const [status, setStatus] = useState('');
  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 5 && parsed <= 720;
  const source = view.minutes;
  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid) {
      setStatus(t.planner.minutesError);
      return;
    }
    void updateProfile(api, user, { dailyMinutes: parsed }).then(() => {
      setStatus(t.planner.minutesSaved);
    });
  };
  return (
    <Card aria-labelledby="tiempo-titulo">
      <CardHeader className="mb-2">
        <CardTitle id="tiempo-titulo">{t.planner.minutesTitle}</CardTitle>
      </CardHeader>
      {source.kind === 'measured' ? (
        <p className="mb-3 text-sm text-fg-muted">
          {t.planner.minutesMeasured(source.days, minutes(source.average))}
        </p>
      ) : null}
      {source.kind === 'declared' ? (
        <p className="mb-3 text-sm text-fg-muted">
          {t.planner.minutesDeclared(source.minutes)}{' '}
          {source.measuredAverage !== null
            ? t.planner.minutesRealAverage(source.measuredDays, minutes(source.measuredAverage))
            : t.planner.minutesRealSoon}
        </p>
      ) : null}
      {source.kind === 'provisional' ? (
        <div className="mb-3 flex flex-col gap-2">
          <CalibratingNote
            current={source.measuredDays}
            target={MEASURED_DAYS_NEEDED}
            unit={t.planner.minutesUnit}
          />
          <p className="text-sm text-fg-muted">
            {t.planner.minutesProvisional(minutes(view.plan.minutesAvailable))}
          </p>
        </div>
      ) : null}
      <form className="flex flex-wrap items-end gap-3" onSubmit={save} noValidate>
        <TextField
          label={t.planner.minutesLabel}
          type="number"
          min={5}
          max={720}
          inputMode="numeric"
          value={value}
          error={status === t.planner.minutesError ? status : null}
          className="min-w-44 flex-1"
          onChange={(event) => {
            setValue(event.target.value);
            setStatus('');
          }}
        />
        <Button type="submit" variant="secondary">
          {t.planner.minutesSave}
        </Button>
        {user.dailyMinutes !== null ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void updateProfile(api, user, { dailyMinutes: null }).then(() => {
                setValue('');
                setStatus('');
              });
            }}
          >
            {t.planner.minutesUseReal}
          </Button>
        ) : null}
      </form>
      <p
        role="status"
        className={cn(
          'mt-2 text-sm',
          status === t.planner.minutesSaved ? 'text-success' : 'sr-only',
        )}
      >
        {status === t.planner.minutesSaved ? status : ''}
      </p>
    </Card>
  );
}

const dateFormat = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function dayLabel(day: string, today: string): string {
  if (day === today) return t.planner.today;
  if (day === addDays(today, 1)) return t.planner.tomorrow;
  return dateFormat.format(new Date(`${day}T12:00:00Z`));
}

function WeekCard({ week, today }: { week: readonly DayPlan[]; today: string }) {
  return (
    <Card aria-labelledby="semana-titulo">
      <CardHeader className="mb-2">
        <CardTitle id="semana-titulo">{t.planner.weekTitle}</CardTitle>
      </CardHeader>
      <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {week.map((day) => {
          const parts = [
            day.reviews > 0 ? t.planner.reviewsShort(day.reviews) : null,
            day.newCards > 0 ? t.planner.newShort(day.newCards) : null,
            day.simulatorQuestions > 0 ? t.planner.questionsShort(day.simulatorQuestions) : null,
            day.challenge ? t.planner.challengeShort : null,
          ].filter((part) => part !== null);
          const label = t.planner.dayMinutes(
            minutes(day.minutesPlanned),
            minutes(day.minutesAvailable),
          );
          return (
            <li
              key={day.day}
              className={cn(
                'flex flex-col gap-1.5 rounded-lg border border-line p-3',
                day.day === today && 'border-primary bg-primary-soft',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold first-letter:uppercase">
                  {dayLabel(day.day, today)}
                </span>
                <span className="text-sm text-fg-muted">{label}</span>
              </div>
              <ProgressBar
                value={day.minutesPlanned}
                max={day.minutesAvailable}
                label={label}
                className="h-1.5"
              />
              <p className="text-sm text-fg-muted">
                {parts.length > 0 ? parts.join(' · ') : t.planner.emptyDay}
              </p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
