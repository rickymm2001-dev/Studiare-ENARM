// Calendario (V4-B6). El mes con lo que hiciste cada día y lo que se proyecta que vas a repasar, el
// domingo de cada simulador y el día del examen, y debajo el plan por semanas hasta el ENARM con la
// rama de cada semana. El plan se puede llevar a Google Calendar o al calendario del teléfono con un
// archivo .ics. Todo el cálculo vive en src/engines/studyCalendar.ts. Lo proyectado sale de la misma
// carga futura de Progreso y llega a FORECAST_DAYS días, así que cambia si repasas más o menos que hoy
// y más allá de ese horizonte la pantalla lo dice en lugar de afirmar que no hay carga. En
// teléfono cada día muestra un punto si tiene algo y el detalle de abajo da el texto, porque siete
// columnas no alcanzan para las notas. La tarjeta del mes lleva menos relleno en teléfono para que cada
// día mida 44 px de ancho como mínimo, el objetivo táctil de la app.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { ENARM_EXAM, examDateFor } from '@/config/exam';
import { topicTaxonomy } from '@/demo/content';
import {
  icsOf,
  monthGrid,
  planEvents,
  studyWeeks,
  weekdayIndex,
  type StudyWeek,
} from '@/engines/studyCalendar';
import { daysBetween, studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { LoadingState } from '@/ui/states/states';
import { useDecksAndCards } from '../decks/useDecksAndCards';
import { buildSnapshot } from '../home/snapshot';
import { useFutureLoad } from '../progress/useFutureLoad';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { usePlanAllows } from '../shared/useActivePlan';
import { useUserEvents } from '../shared/useUserEvents';
import { BranchOrder } from './BranchOrder';

const text = t.calendar;
const WEEKS_SHOWN = 8;
/** Días que proyecta la carga futura. Más allá no hay dato y la pantalla lo dice */
const FORECAST_DAYS = 60;

/** Una nota de un día, corta para la vista y larga para el nombre accesible */
interface DayNote {
  short: string;
  long: string;
}

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
  const events = useUserEvents(user.id);
  const content = useDecksAndCards();
  const today = studyDayOf(new Date(), user.timeZone);
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [selected, setSelected] = useState(today);
  const [showAllWeeks, setShowAllWeeks] = useState(false);

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
  // La fecha del ENARM es de la plataforma y la del perfil solo la sustituye en la demo (D-059)
  const examDate = examDateFor(user);
  const provisionalDate = !user.examDate && ENARM_EXAM.provisional;
  const weeks = useMemo(
    () => studyWeeks({ today, examDate, branches: settings.branches }),
    [today, examDate, settings.branches],
  );

  if (events === undefined || content === undefined || snapshot === null) {
    return (
      <>
        <ScreenHeader
          title={t.screens.calendar.title}
          description={t.screens.calendar.description}
        />
        <LoadingState />
      </>
    );
  }

  const forecast = new Map((load?.days ?? []).map((day) => [day.day, day]));
  const weekOf = (day: string): StudyWeek | undefined =>
    weeks.find((week) => day >= week.start && day <= week.end);
  const simulatorTotal = weeks.filter((week) => week.simulatorSunday !== null).length;
  const notesOf = (day: string): DayNote[] => {
    const notes: DayNote[] = [];
    const activity = snapshot.activity[day];
    if (day <= today && activity && activity.cards > 0) {
      notes.push({ short: text.done(activity.cards), long: text.doneLong(activity.cards) });
    }
    const planned = forecast.get(day);
    if (day > today && planned && planned.reviews + planned.newCards > 0) {
      const count = planned.reviews + planned.newCards;
      notes.push({ short: text.forecast(count), long: text.forecastLong(count) });
    }
    const week = weekOf(day);
    if (week?.simulatorSunday === day) {
      notes.push({ short: text.simulatorShort, long: text.simulatorLong });
    }
    if (examDate === day) notes.push({ short: text.examShort, long: text.examLong });
    return notes;
  };

  const grid = monthGrid(cursor.year, cursor.month);
  const move = (delta: number) => {
    const index = cursor.year * 12 + (cursor.month - 1) + delta;
    setCursor({ year: Math.floor(index / 12), month: (index % 12) + 1 });
  };

  const detail = (() => {
    const lines: string[] = [];
    const activity = snapshot.activity[selected];
    if (selected <= today && activity && (activity.cards > 0 || activity.questions > 0)) {
      lines.push(text.detailDone(activity.cards, activity.questions, activity.focusMinutes));
    }
    // Un día pasado o de hoy sin nada lo dice. Uno futuro dice lo que se proyecta, que no hay carga
    // dentro del horizonte, o que el horizonte no llega hasta ahí, porque más allá no hay dato y
    // decir que no hay carga sería afirmar algo que no se sabe
    if (selected <= today && lines.length === 0) {
      lines.push(selected === today ? text.detailNothingToday : text.detailNothingPast);
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

  return (
    <>
      <ScreenHeader title={t.screens.calendar.title} description={t.screens.calendar.description} />
      {daysLeft >= 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{text.countdown(daysLeft)}</p>
          {provisionalDate ? <p className="text-xs text-fg-muted">{text.provisionalDate}</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card aria-labelledby="calendario-mes" className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {/* Al cambiar de mes el lector de pantalla dice el mes nuevo, porque el foco se queda en el botón */}
            <h2
              id="calendario-mes"
              aria-live="polite"
              aria-atomic="true"
              className="text-lg font-bold first-letter:uppercase"
            >
              {monthName(cursor.year, cursor.month)}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="max-sm:min-h-touch"
                aria-label={text.prev}
                onClick={() => {
                  move(-1);
                }}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="max-sm:min-h-touch"
                onClick={() => {
                  setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
                  setSelected(today);
                }}
              >
                {text.today}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="max-sm:min-h-touch"
                aria-label={text.next}
                onClick={() => {
                  move(1);
                }}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>

          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">
              {text.gridLabel(monthName(cursor.year, cursor.month))}
            </caption>
            <thead>
              <tr>
                {text.weekdays.map((letter, index) => (
                  <th
                    key={index}
                    scope="col"
                    abbr={text.weekdaysLong[index]}
                    className="pb-1 text-xs font-semibold text-fg-muted"
                  >
                    {letter}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.weeks.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((day, cellIndex) => {
                    if (day === null) return <td key={cellIndex} className="p-px sm:p-0.5" />;
                    const notes = notesOf(day);
                    const week = weekOf(day);
                    const isSelected = day === selected;
                    return (
                      <td key={day} className="p-px align-top sm:p-0.5">
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          aria-current={day === today ? 'date' : undefined}
                          aria-label={text.cellLabel(
                            longDay(day),
                            notes.map((note) => note.long),
                          )}
                          onClick={() => {
                            setSelected(day);
                          }}
                          className={cn(
                            'flex min-h-16 w-full flex-col items-start gap-0.5 rounded-md border p-1 text-left text-xs hover:bg-muted sm:min-h-20 sm:p-1.5',
                            isSelected ? 'border-indicator bg-muted' : 'border-line',
                            day === today && 'ring-1 ring-fg',
                            week?.simulatorSunday === day && 'bg-accent/10',
                          )}
                        >
                          <span className="text-sm font-semibold">{Number(day.slice(8))}</span>
                          {/* En teléfono un punto avisa que hay algo y el texto va en el detalle de abajo */}
                          {notes.length > 0 ? (
                            <span
                              aria-hidden
                              className="size-1.5 rounded-full bg-indicator sm:hidden"
                            />
                          ) : null}
                          {notes.map((note) => (
                            <span key={note.short} className="hidden text-fg-muted sm:block">
                              {note.short}
                            </span>
                          ))}
                          {weekdayIndex(day) === 0 && week?.branch && !week.examWeek ? (
                            <span className="hidden font-medium text-primary-ink lg:inline">
                              {branchName(week.branch)}
                            </span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-fg-muted">{text.legend}</p>

          <section
            aria-live="polite"
            aria-labelledby="calendario-dia"
            className="mt-3 flex flex-col gap-1 rounded-lg border border-line p-3"
          >
            <h3 id="calendario-dia" className="font-semibold first-letter:uppercase">
              {text.detailTitle(longDay(selected))}
            </h3>
            {detail.map((line) => (
              <p key={line} className="text-sm">
                {line}
              </p>
            ))}
          </section>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card aria-labelledby="plan-semanas">
            <CardHeader className="mb-3">
              <CardTitle id="plan-semanas">{text.plan.title}</CardTitle>
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
                  <Button type="button" className="self-start" onClick={exportPlan}>
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
      </div>
    </>
  );
}
