// Calendario (V4-B6, rediseñado en D-150). Tu mes de estudio en tres columnas. A la izquierda la
// píldora de hoy, el plan de hoy y las cifras del mes. Al centro el mes con una píldora por cada cosa
// real de cada día, los repasos que FSRS proyecta, las tarjetas hechas, las sesiones terminadas, los
// domingos de simulador del plan, el ENARM y los retos de Party. A la derecha el detalle del día
// elegido en marino con Empezar ahora y, en salvia, el reto de Party o el siguiente día cargado.
// Debajo sigue el plan por semanas hasta el ENARM con la rama de cada semana, el orden de ramas, el
// .ics y los consejos de la guía, que ya existían. Todo el cálculo de fechas vive en
// src/engines/studyCalendar.ts y las piezas de cada día en dayItems.ts. Lo proyectado sale de la
// misma carga futura de Progreso y llega a FORECAST_DAYS días, así que más allá la pantalla lo dice
// en lugar de afirmar que no hay carga. La rejilla se recorre con flechas, Inicio y Fin, y en el
// teléfono se desplaza de lado para que las píldoras se lean.
import { ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { ENARM_EXAM, examDateFor } from '@/config/exam';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Challenge } from '@/data/schemas/activity';
import { topicTaxonomy } from '@/demo/content';
import {
  challengesByDay,
  icsOf,
  monthGrid,
  monthSummary,
  moveDayByKey,
  nextBusyDay,
  planEvents,
  sessionsByDay,
  shiftMonth,
  studyWeeks,
  weekdayIndex,
  yearMonthOf,
  type StudyWeek,
} from '@/engines/studyCalendar';
import { daysBetween, studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { useDecksAndCards } from '../decks/useDecksAndCards';
import { buildSnapshot } from '../home/snapshot';
import { useFutureLoad } from '../progress/useFutureLoad';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { usePlanAllows } from '../shared/useActivePlan';
import { useUserEvents } from '../shared/useUserEvents';
import { BranchOrder } from './BranchOrder';
import { itemsForDay, startTarget, type DayItem, type DayItemKind } from './dayItems';

const text = t.calendar;
const WEEKS_SHOWN = 8;
/** Días que proyecta la carga futura. Más allá no hay dato y la pantalla lo dice */
const FORECAST_DAYS = 60;

/** El color de cada píldora. Cielo suave lo programado, panel lo hecho, marino las sesiones, borde
 *  cielo el plan y salvia Party. Son los de la leyenda */
const PILL_CLASS: Record<DayItemKind, string> = {
  reviews: 'bg-primary-soft text-primary-ink',
  newCards: 'bg-primary-soft text-primary-ink',
  done: 'bg-panel text-fg',
  session: 'bg-primary text-primary-fg',
  planSimulator: 'border-[1.5px] border-indicator bg-surface text-primary-ink',
  exam: 'border-[1.5px] border-indicator bg-surface text-primary-ink',
  party: 'bg-sage text-fg',
};
const LEGEND: { kind: DayItemKind; label: string }[] = [
  { kind: 'reviews', label: text.legendItems.reviews },
  { kind: 'done', label: text.legendItems.done },
  { kind: 'session', label: text.legendItems.sessions },
  { kind: 'planSimulator', label: text.legendItems.plan },
  { kind: 'party', label: text.legendItems.party },
];
/** La raya de color a la izquierda de cada renglón del plan de hoy */
const BAR_CLASS: Record<DayItemKind, string> = {
  reviews: 'bg-indicator',
  newCards: 'bg-indicator',
  done: 'bg-panel',
  session: 'bg-primary',
  planSimulator: 'bg-indicator',
  exam: 'bg-indicator',
  party: 'bg-sage',
};

const longDay = (day: string) =>
  new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
const shortDay = (day: string) =>
  new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
const weekdayName = (day: string) =>
  new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
const monthName = (year: number, month: number) =>
  new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 15)),
  );

const branchName = (key: string) =>
  topicTaxonomy.branches.find((branch) => branch.key === key)?.name ?? text.unknownBranch;

export function CalendarScreen() {
  return (
    <RequireSession screen="calendar">{(session) => <Calendar session={session} />}</RequireSession>
  );
}

function Calendar({ session }: { session: ReadySession }) {
  const { user, settings } = session;
  const api = useDataApi();
  const events = useUserEvents(user.id);
  const content = useDecksAndCards();
  const today = studyDayOf(new Date(), user.timeZone);
  const [cursor, setCursor] = useState(() => yearMonthOf(today));
  const [selected, setSelected] = useState(today);
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  // El día que debe recibir el foco cuando la rejilla cambie de mes con el teclado
  const pendingFocus = useRef<string | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);

  const fullExamOpen = usePlanAllows(user.id, 'fullExam');
  const load = useFutureLoad(
    session,
    events ?? [],
    content ?? { decks: [], cards: [] },
    FORECAST_DAYS,
  );
  const snapshot = useMemo(
    () => (events ? buildSnapshot({ events, user, settings, now: new Date() }) : null),
    [events, user, settings],
  );
  // Los retos del grupo del alumno que viven en este navegador. En la nube Party tiene su propio
  // puente y aquí no se adivina nada, así que sin dato local no hay píldora
  const challenges = useLiveData(async (): Promise<Challenge[]> => {
    const memberships = await api.repos.memberships.list();
    const mine = memberships.find((item) => item.userId === user.id && item.leftAt === null);
    if (!mine) return [];
    return (await api.repos.challenges.list()).filter(
      (item) => item.groupId === mine.groupId && item.kind === 'collective',
    );
  }, [api.repos, user.id]);
  // La fecha del ENARM es de la plataforma y la del perfil solo la sustituye en la demo (D-059)
  const examDate = examDateFor(user);
  const provisionalDate = !user.examDate && ENARM_EXAM.provisional;
  const weeks = useMemo(
    () => studyWeeks({ today, examDate, branches: settings.branches }),
    [today, examDate, settings.branches],
  );
  const sessions = useMemo(() => sessionsByDay(events ?? []), [events]);
  const challengeDays = useMemo(
    () => challengesByDay(challenges ?? [], user.timeZone),
    [challenges, user.timeZone],
  );

  useEffect(() => {
    const day = pendingFocus.current;
    if (day === null) return;
    pendingFocus.current = null;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus();
  }, [cursor, selected]);

  if (events === undefined || content === undefined || snapshot === null) {
    return (
      <>
        <ScreenHeader
          kicker={t.screens.calendar.title}
          title={text.heroTitle}
          documentTitle={t.screens.calendar.title}
          description={text.heroLead}
        />
        <LoadingState />
      </>
    );
  }

  const forecast = new Map((load?.days ?? []).map((day) => [day.day, day]));
  const forecastCounts = new Map(
    (load?.days ?? []).map((day) => [day.day, day.reviews + day.newCards]),
  );
  const forecastEnd = load?.days.at(-1)?.day ?? null;
  const context = {
    today,
    forecast,
    activity: snapshot.activity,
    sessions,
    weeks,
    examDate,
    challenges: challengeDays,
  };
  const weekOf = (day: string): StudyWeek | undefined =>
    weeks.find((week) => day >= week.start && day <= week.end);
  const simulatorTotal = weeks.filter((week) => week.simulatorSunday !== null).length;

  const grid = monthGrid(cursor.year, cursor.month);
  const gridDays = grid.weeks.flat().filter((day): day is string => day !== null);
  // Solo un día de la rejilla entra con tabulador. Los demás se alcanzan con las flechas
  const tabbable = gridDays.includes(selected) ? selected : gridDays[0];
  const move = (delta: number) => {
    setCursor(shiftMonth(cursor.year, cursor.month, delta));
  };
  const goToDay = (day: string) => {
    setSelected(day);
    const month = yearMonthOf(day);
    if (month.year !== cursor.year || month.month !== cursor.month) setCursor(month);
    pendingFocus.current = day;
  };
  const onGridKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const target = event.target as HTMLElement;
    const day = target.dataset.day;
    if (!day) return;
    const next = moveDayByKey(day, event.key);
    if (next === null) return;
    event.preventDefault();
    goToDay(next);
  };

  const todayItems = itemsForDay(today, context);
  const selectedItems = itemsForDay(selected, context);
  const summary = monthSummary({
    year: cursor.year,
    month: cursor.month,
    today,
    forecast: forecastCounts,
    forecastEnd,
    sessions,
  });
  const busy = nextBusyDay(forecastCounts, today);
  const upcomingChallenge =
    [...challengeDays.entries()]
      .filter(([day]) => day >= today)
      .sort(([a], [b]) => a.localeCompare(b))[0] ?? null;

  const detail = (() => {
    const lines: string[] = [];
    const activity = snapshot.activity[selected];
    if (selected <= today && activity && (activity.cards > 0 || activity.questions > 0)) {
      lines.push(text.detailDone(activity.cards, activity.questions, activity.focusMinutes));
    }
    // Un día pasado o de hoy sin nada lo dice. Hoy también dice lo que le queda. Uno futuro dice lo
    // que se proyecta, que no hay carga dentro del horizonte, o que el horizonte no llega hasta ahí,
    // porque más allá no hay dato y decir que no hay carga sería afirmar algo que no se sabe
    if (selected <= today && lines.length === 0) {
      lines.push(selected === today ? text.detailNothingToday : text.detailNothingPast);
    }
    if (selected === today) {
      const planned = forecast.get(today);
      if (planned && planned.reviews + planned.newCards > 0) {
        lines.push(text.detail.pending(planned.reviews, planned.newCards));
      }
    }
    if (selected > today) {
      const planned = forecast.get(selected);
      if (planned && planned.reviews + planned.newCards > 0) {
        lines.push(text.detailForecast(planned.reviews, planned.newCards));
      } else if (daysBetween(today, selected) > FORECAST_DAYS) {
        lines.push(text.detailBeyond(FORECAST_DAYS));
      } else {
        lines.push(load === null ? text.detailNoDecks : text.detailNoLoad);
      }
    }
    const week = weekOf(selected);
    if (week?.branch && !week.examWeek) lines.push(text.detailWeek(branchName(week.branch)));
    if (week?.simulatorSunday === selected && week.simulatorNumber !== null) {
      lines.push(text.detailSimulator(week.simulatorNumber, simulatorTotal));
    }
    if (examDate === selected) lines.push(text.detailExam);
    return lines;
  })();
  const start = startTarget(selected, today, selectedItems);

  const exportPlan = () => {
    const ics = icsOf(
      planEvents(weeks, examDate, {
        week: (branch) => text.plan.eventWeek(branchName(branch)),
        simulator: text.plan.eventSimulator,
        exam: text.plan.eventExam,
      }),
      new Date(),
    );
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = text.plan.fileName;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const shown = showAllWeeks ? weeks : weeks.slice(0, WEEKS_SHOWN);
  const daysLeft = daysBetween(today, examDate);
  const lead = daysLeft >= 0 ? `${text.heroLead} ${text.heroCountdown(daysLeft)}` : text.heroLead;

  return (
    <>
      <ScreenHeader
        kicker={t.screens.calendar.title}
        title={text.heroTitle}
        documentTitle={t.screens.calendar.title}
        description={lead}
        actions={
          <Button asChild>
            <Link to={screenPath('simulatorSetup')}>
              <Plus aria-hidden />
              {text.newSession}
            </Link>
          </Button>
        }
      />
      {daysLeft >= 0 && provisionalDate ? (
        <p className="-mt-2 text-xs text-fg-muted">{text.provisionalDate}</p>
      ) : null}

      <div className="flex flex-wrap items-start gap-5">
        {/* Hoy. En computadora toma 3 de 12 columnas, en teléfono todo el ancho */}
        <aside
          aria-label={text.detail.today}
          className="flex w-full min-w-0 flex-col gap-4 lg:w-[calc(25%-0.9375rem)]"
        >
          <div className="flex items-center gap-3.5 rounded-full border border-line bg-surface py-2 pr-4 pl-3">
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-extrabold text-heading"
            >
              {Number(today.slice(8))}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold">{text.todayPill(weekdayName(today))}</span>
              <span className="text-sm text-fg-muted">{text.todayCount(todayItems.length)}</span>
            </span>
          </div>

          <Card tone="cream" aria-labelledby="plan-hoy" className="flex flex-col gap-3">
            <CardTitle id="plan-hoy" className="text-base">
              {text.todayPlan.title}
            </CardTitle>
            {todayItems.length === 0 ? (
              <p className="text-sm text-fg-muted">
                {load === null ? text.detailNoDecks : text.todayPlan.empty}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {todayItems.map((item, index) => (
                  <li
                    key={`${item.kind}-${String(index)}`}
                    className="flex gap-3 rounded-md bg-surface px-3 py-2.5"
                  >
                    <span
                      aria-hidden
                      className={cn('w-1 shrink-0 rounded-sm', BAR_CLASS[item.kind])}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <strong className="text-sm">{item.title}</strong>
                      {item.hint ? (
                        <span className="text-xs text-fg-muted">{item.hint}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card aria-labelledby="este-mes" className="flex flex-col gap-2.5">
            <CardTitle id="este-mes" className="text-base">
              {text.month.title}
            </CardTitle>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{text.month.sessionsDone}</dt>
                <dd className="font-bold">{summary.sessionsDone.toLocaleString('es-MX')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{text.month.scheduled}</dt>
                <dd className="font-bold">{summary.scheduled.toLocaleString('es-MX')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{text.month.busiest}</dt>
                <dd className="font-bold">
                  {summary.busiest
                    ? `${shortDay(summary.busiest.day)}, ${summary.busiest.count.toLocaleString('es-MX')}`
                    : text.month.none}
                </dd>
              </div>
            </dl>
            {load === null ? (
              <p className="text-xs text-fg-muted">{text.detailNoDecks}</p>
            ) : !summary.forecastCovers ? (
              <p className="text-xs text-fg-muted">{text.month.partial(FORECAST_DAYS)}</p>
            ) : null}
          </Card>
        </aside>

        {/* El mes. 6 de 12 columnas en computadora */}
        <Card
          aria-labelledby="calendario-mes"
          lift={false}
          className="flex w-full min-w-0 flex-col gap-3.5 p-3 sm:p-5 lg:w-[calc(50%-1.25rem)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full border border-line"
                aria-label={text.prev}
                onClick={() => {
                  move(-1);
                }}
              >
                <ChevronLeft aria-hidden />
              </Button>
              {/* Al cambiar de mes el lector de pantalla dice el mes nuevo, porque el foco se queda en el botón */}
              <h2
                id="calendario-mes"
                aria-live="polite"
                aria-atomic="true"
                className="text-xl font-extrabold tracking-tight first-letter:uppercase"
              >
                {monthName(cursor.year, cursor.month)}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full border border-line"
                aria-label={text.next}
                onClick={() => {
                  move(1);
                }}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full border border-line"
              onClick={() => {
                setCursor(yearMonthOf(today));
                setSelected(today);
              }}
            >
              {text.today}
            </Button>
          </div>

          {/* En el teléfono la rejilla se desplaza de lado para que las píldoras se lean */}
          {/* relative para que los nombres largos de los días, que solo lee el lector de pantalla y van
              en posición absoluta, queden dentro de la caja que se desplaza y no ensanchen la página */}
          <div className="relative -mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <div className="min-w-[34rem]">
              <table
                ref={gridRef}
                onKeyDown={onGridKeyDown}
                className="w-full table-fixed border-separate border-spacing-1"
              >
                <caption className="sr-only">
                  {text.gridLabel(monthName(cursor.year, cursor.month))}
                </caption>
                <thead>
                  <tr>
                    {text.weekdaysLong.map((name) => (
                      <th
                        key={name}
                        scope="col"
                        abbr={name}
                        className="pb-1 text-center text-xs font-bold text-fg-muted"
                      >
                        {/* Lun a Dom a la vista y el nombre completo para el lector de pantalla */}
                        <span aria-hidden className="inline-block first-letter:uppercase">
                          {name.slice(0, 3)}
                        </span>
                        <span className="sr-only">{name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.weeks.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((day, cellIndex) => {
                        if (day === null) {
                          return <td key={cellIndex} className="rounded-[10px] bg-muted/60 p-0" />;
                        }
                        const items = itemsForDay(day, context);
                        const isSelected = day === selected;
                        const isToday = day === today;
                        return (
                          <td key={day} className="p-0 align-top">
                            <DayCell
                              day={day}
                              items={items}
                              isSelected={isSelected}
                              isToday={isToday}
                              tabbable={day === tabbable}
                              branch={
                                weekdayIndex(day) === 0 &&
                                weekOf(day)?.branch &&
                                !weekOf(day)?.examWeek
                                  ? branchName(weekOf(day)?.branch ?? '')
                                  : null
                              }
                              onSelect={() => {
                                setSelected(day);
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-fg-muted">
            {LEGEND.map((item) => (
              <li key={item.kind} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn('size-3 rounded-[3px]', PILL_CLASS[item.kind])} />
                {item.label}
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-muted">{text.legend}</p>
        </Card>

        {/* El día elegido. 3 de 12 columnas en computadora */}
        <aside
          aria-label={text.detailTitle(longDay(selected))}
          className="flex w-full min-w-0 flex-col gap-4 lg:w-[calc(25%-0.9375rem)]"
        >
          <Card
            tone="navy"
            aria-live="polite"
            aria-labelledby="calendario-dia"
            className="flex flex-col gap-3.5"
          >
            {/* El kicker en claro sobre marino, no en cielo tinta como el eyebrow, por el contraste */}
            <span className="text-xs font-bold tracking-[0.12em] text-primary-fg/80 uppercase first-letter:uppercase">
              {selected === today ? text.detail.today : longDay(selected)}
            </span>
            <h2 id="calendario-dia" className="text-xl font-extrabold tracking-tight">
              <span className="sr-only">{text.detailTitle(longDay(selected))}. </span>
              {selectedItems[0]?.title ?? text.detail.emptyTitle}
            </h2>
            <ul className="flex flex-col gap-1.5 text-sm text-primary-fg/85">
              {detail.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {start ? (
              <Button
                asChild
                className="bg-surface text-heading hover:bg-surface hover:text-heading active:bg-surface"
              >
                <Link to={screenPath(start)}>
                  {text.detail.start}
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            ) : null}
          </Card>

          {upcomingChallenge ? (
            <Card tone="sage" aria-labelledby="reto-party" className="flex flex-col gap-2.5">
              <span className="eyebrow first-letter:uppercase">
                {longDay(upcomingChallenge[0])}
              </span>
              <CardTitle id="reto-party" className="text-lg">
                {text.partyCard.title}
              </CardTitle>
              {upcomingChallenge[1].map((challenge) => (
                <p key={challenge.id} className="text-sm leading-relaxed">
                  {challenge.title}. {text.partyCard.ends(longDay(upcomingChallenge[0]))}
                </p>
              ))}
              {upcomingChallenge[1].some((challenge) => challenge.isSimulated) ? (
                <SimulatedDataLabel className="self-start" />
              ) : null}
              <Link
                to={screenPath('party')}
                className="text-sm font-bold text-heading underline-offset-4 hover:underline"
              >
                {text.partyCard.go}
              </Link>
            </Card>
          ) : (
            <Card tone="sage" aria-labelledby="siguiente-cargado" className="flex flex-col gap-2.5">
              {busy ? (
                <span className="eyebrow first-letter:uppercase">{longDay(busy.day)}</span>
              ) : null}
              <CardTitle id="siguiente-cargado" className="text-lg">
                {text.nextBusy.title}
              </CardTitle>
              <p className="text-sm leading-relaxed">
                {load === null
                  ? text.detailNoDecks
                  : busy
                    ? text.nextBusy.body(longDay(busy.day), busy.count)
                    : text.nextBusy.empty}
              </p>
            </Card>
          )}
        </aside>
      </div>

      {/* Lo que el Calendario ya hacía. El plan por semanas con el orden de ramas, el .ics y los consejos */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card aria-labelledby="plan-semanas">
          <CardHeader className="mb-3">
            <CardTitle id="plan-semanas" className="group-title">
              {text.plan.title}
            </CardTitle>
            <CardDescription>{text.plan.hint}</CardDescription>
          </CardHeader>
          <div className="mb-3">
            <BranchOrder session={session} branches={topicTaxonomy.branches} />
          </div>
          {weeks.length === 0 ? (
            <p className="text-sm text-fg-muted">{text.plan.empty}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <ol className="flex flex-col divide-y divide-line">
                {shown.map((week) => (
                  <li key={week.start} className="flex flex-col gap-0.5 py-2 first:pt-0">
                    <span className="text-sm font-medium">
                      {week.examWeek
                        ? `${shortDay(week.start)} al ${shortDay(week.end)}. ${text.plan.exam}`
                        : text.plan.week(
                            shortDay(week.start),
                            shortDay(week.end),
                            week.branch ? branchName(week.branch) : '',
                          )}
                    </span>
                    {week.simulatorNumber !== null ? (
                      <span className="text-sm text-fg-muted">
                        {text.plan.simulator(week.simulatorNumber, simulatorTotal)}
                        {week.simulatorSunday ? `. ${longDay(week.simulatorSunday)}` : ''}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
              {simulatorTotal > 0 && fullExamOpen === false ? (
                <p className="text-sm text-fg-muted">
                  {text.plan.simulatorPaid}{' '}
                  <Link
                    to={screenPath('subscription')}
                    className="font-medium text-primary-ink underline underline-offset-2"
                  >
                    {t.billing.featureSeePlans}
                  </Link>
                </p>
              ) : null}
              {weeks.length > WEEKS_SHOWN ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  aria-pressed={showAllWeeks}
                  onClick={() => {
                    setShowAllWeeks(!showAllWeeks);
                  }}
                >
                  {showAllWeeks ? text.plan.showLess : text.plan.showAll(weeks.length)}
                </Button>
              ) : null}
              <div className="flex flex-col gap-1 border-t border-line pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="self-start"
                  onClick={exportPlan}
                >
                  <Download aria-hidden />
                  {text.plan.export}
                </Button>
                <p className="text-sm text-fg-muted">{text.plan.exportHint}</p>
              </div>
            </div>
          )}
        </Card>

        <Disclosure title={text.tips.title}>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {text.tips.items.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </>
  );
}

/**
 * Un día de la rejilla. Botón con el número arriba a la derecha y una píldora por cada cosa real del
 * día. Hoy lleva el círculo cielo y el fondo crema, el elegido el borde cielo. El nombre accesible dice
 * el día completo y cada cosa completa, porque las píldoras abrevian
 */
function DayCell({
  day,
  items,
  isSelected,
  isToday,
  tabbable,
  branch,
  onSelect,
}: {
  day: string;
  items: readonly DayItem[];
  isSelected: boolean;
  isToday: boolean;
  tabbable: boolean;
  /** La rama de la semana, solo en el lunes y en pantallas anchas */
  branch: string | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-day={day}
      tabIndex={tabbable ? 0 : -1}
      aria-pressed={isSelected}
      aria-current={isToday ? 'date' : undefined}
      aria-label={text.cellLabel(
        longDay(day),
        items.map((item) => item.long),
      )}
      onClick={onSelect}
      className={cn(
        'flex min-h-20 w-full flex-col gap-1 rounded-[10px] border p-1.5 text-left transition-colors hover:bg-cream sm:min-h-23',
        isSelected ? 'border-indicator' : 'border-line',
        isToday ? 'bg-cream' : isSelected ? 'bg-muted' : 'bg-surface',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'self-end text-xs font-semibold tabular-nums',
          isToday
            ? 'flex size-6 items-center justify-center rounded-full bg-primary-soft font-extrabold text-heading ring-1 ring-indicator'
            : 'text-fg-muted',
        )}
      >
        {Number(day.slice(8))}
      </span>
      {items.map((item, index) => (
        <span
          key={`${item.kind}-${String(index)}`}
          aria-hidden
          className={cn(
            'block w-full truncate rounded-sm px-1.5 py-0.5 text-xs leading-tight font-semibold',
            PILL_CLASS[item.kind],
          )}
        >
          {item.short}
        </span>
      ))}
      {branch ? (
        <span aria-hidden className="hidden truncate text-xs font-medium text-primary-ink xl:block">
          {branch}
        </span>
      ) : null}
    </button>
  );
}
