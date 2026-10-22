// Calendario (V4-B6). El mes con lo que hiciste cada día y lo que se proyecta que vas a repasar, el
// domingo de cada simulador y el día del examen, y debajo el plan por semanas hasta el ENARM con la
// rama de cada semana. El plan se puede llevar a Google Calendar o al calendario del teléfono con un
// archivo .ics. Todo el cálculo vive en src/engines/studyCalendar.ts. Lo proyectado sale de la misma
// carga futura de Progreso, así que cambia si repasas más o menos que hoy.
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
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
import { useUserEvents } from '../shared/useUserEvents';

const text = t.calendar;
const WEEKS_SHOWN = 8;

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
  topicTaxonomy.branches.find((branch) => branch.key === key)?.name ?? key;

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

  const load = useFutureLoad(session, events ?? [], content ?? { decks: [], cards: [] }, 60);
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
  const notesOf = (day: string): string[] => {
    const notes: string[] = [];
    const activity = snapshot.activity[day];
    if (day <= today && activity && activity.cards > 0) notes.push(text.done(activity.cards));
    const planned = forecast.get(day);
    if (day > today && planned && planned.reviews + planned.newCards > 0) {
      notes.push(text.forecast(planned.reviews + planned.newCards));
    }
    const week = weekOf(day);
    if (week?.simulatorSunday === day) notes.push(text.simulatorShort);
    if (examDate === day) notes.push(text.examShort);
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
    const planned = forecast.get(selected);
    if (selected > today && planned && planned.reviews + planned.newCards > 0) {
      lines.push(text.detailForecast(planned.reviews, planned.newCards));
    }
    const week = weekOf(selected);
    if (week?.branch && !week.examWeek) lines.push(text.detailWeek(branchName(week.branch)));
    if (week?.simulatorSunday === selected && week.simulatorNumber !== null) {
      lines.push(text.detailSimulator(week.simulatorNumber, simulatorTotal));
    }
    if (examDate === selected) lines.push(text.detailExam);
    return lines.length === 0 ? [text.detailNothing] : lines;
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
      {daysLeft >= 0 ? <p className="text-sm font-medium">{text.countdown(daysLeft)}</p> : null}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card aria-labelledby="calendario-mes">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="calendario-mes" className="text-lg font-bold capitalize">
              {monthName(cursor.year, cursor.month)}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
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
                    if (day === null) return <td key={cellIndex} className="p-0.5" />;
                    const notes = notesOf(day);
                    const week = weekOf(day);
                    const isSelected = day === selected;
                    return (
                      <td key={day} className="p-0.5 align-top">
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          aria-current={day === today ? 'date' : undefined}
                          aria-label={text.cellLabel(longDay(day), notes)}
                          onClick={() => {
                            setSelected(day);
                          }}
                          className={cn(
                            'flex min-h-16 w-full flex-col items-start gap-0.5 rounded-md border p-1.5 text-left text-xs hover:bg-muted sm:min-h-20',
                            isSelected ? 'border-primary bg-muted' : 'border-line',
                            day === today && 'ring-1 ring-fg',
                            week?.simulatorSunday === day && 'bg-accent/10',
                          )}
                        >
                          <span className="text-sm font-semibold">{Number(day.slice(8))}</span>
                          {notes.map((note) => (
                            <span key={note} className="text-fg-muted">
                              {note}
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
            <h3 id="calendario-dia" className="font-semibold capitalize">
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
            {provisionalDate ? (
              <p className="mb-3 text-sm text-fg-muted">{text.provisionalDate}</p>
            ) : null}
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
