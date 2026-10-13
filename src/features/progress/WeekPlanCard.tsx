// La semana en Progreso (comentario 13 del plan del cambio, B3). La pantalla del planificador se
// quitó y aquí queda lo que ayuda a decidir qué estudiar. Los próximos 7 días con lo planeado
// contra lo hecho, el aviso de sobrecarga con sus ajustes y el tiempo al día del que sale el plan,
// con sus mismos textos y los mismos cambios al perfil. Las acciones de hoy viven en Inicio y no se
// repiten. Los colores de la barra de cada día son los de la carga de Inicio, programado y
// realizado.
import { TriangleAlert } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { useDataApi } from '@/data/context';
import type { Card as DeckCard, Deck } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { updateProfile } from '@/data/usecases/profile';
import type { DayPlan, OverloadOption, PlannerWarning } from '@/engines/planner';
import { addDays } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { SkeletonRows } from '@/ui/components/skeleton';
import { CalibratingNote } from '@/ui/states/states';
import type { ReadySession } from '../shared/RequireSession';
import { MEASURED_DAYS_NEEDED, type PlannerView } from './planView';
import { useWeekPlan } from './useWeekPlan';
import type { DayDone, WeekDay, WeekPlan } from './weekPlan';

const text = t.weekPlan;

/** Límites de los minutos al día, los mismos del esquema del perfil */
const MIN_DAILY_MINUTES = 5;
const MAX_DAILY_MINUTES = 720;

const minutes = (value: number) => Math.round(value);

export function WeekPlanCard({
  session,
  events,
  content,
}: {
  session: ReadySession;
  events: readonly AppEvent[];
  content: { decks: readonly Deck[]; cards: readonly DeckCard[] };
}) {
  const week = useWeekPlan(session, events, content);
  return (
    // Ocupa las dos columnas de Progreso, porque la semana y el tiempo van lado a lado
    <Card aria-labelledby="semana-titulo" className="lg:col-span-2">
      <CardHeader className="mb-3">
        <CardTitle id="semana-titulo">{t.planner.weekTitle}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {week === undefined ? (
        <SkeletonRows label={text.loading} rows={4} />
      ) : (
        <WeekBody session={session} week={week} />
      )}
    </Card>
  );
}

function WeekBody({ session, week }: { session: ReadySession; week: WeekPlan }) {
  const [applied, setApplied] = useState(false);
  const { view, questionLimit } = week;
  const limitNote =
    questionLimit !== null && week.days.some((day) => day.plan.simulatorCapped)
      ? t.planner.limitNote(questionLimit)
      : null;
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        {view.plan.warnings.map((warning) => (
          <OverloadSection
            key={warning.kind}
            session={session}
            warning={warning}
            onApplied={() => {
              setApplied(true);
            }}
          />
        ))}
        {/* Vive fuera del aviso para que se siga viendo y oyendo cuando el ajuste lo quita */}
        <p role="status" className={applied ? 'text-sm text-success' : 'sr-only'}>
          {applied ? t.planner.applied : ''}
        </p>
        <DayList days={week.days} today={week.today} />
        {limitNote ? <p className="text-sm text-fg-muted">{limitNote}</p> : null}
        {view.cardCount === 0 ? (
          <p className="text-sm text-fg-muted">{t.planner.noDecksBody}</p>
        ) : null}
      </div>
      <MinutesSection session={session} view={view} />
    </div>
  );
}

/**
 * Aviso de sobrecarga del planificador. Cada ajuste guarda lo mismo que antes. Bajar las nuevas
 * apaga también el modo sin límite y subir el tiempo cambia los minutos declarados
 */
function OverloadSection({
  session,
  warning,
  onApplied,
}: {
  session: ReadySession;
  warning: PlannerWarning;
  onApplied: () => void;
}) {
  const api = useDataApi();
  const apply = (option: OverloadOption) => {
    const patch =
      option.action === 'reduce_new'
        ? // Sin apagar el modo sin límite el número nuevo no tendría efecto
          updateProfile(api, session.user, {
            settings: { newCardsPerDay: option.value, unlimitedNewCards: false },
          })
        : updateProfile(api, session.user, {
            dailyMinutes: Math.min(MAX_DAILY_MINUTES, option.value),
          });
    void patch.then(() => {
      onApplied();
    });
  };
  return (
    <section
      aria-labelledby="sobrecarga-titulo"
      className="flex flex-col gap-2 border-l-4 border-l-warning pl-3"
    >
      <h3 id="sobrecarga-titulo" className="flex items-center gap-2 font-semibold [&_svg]:size-5">
        <TriangleAlert aria-hidden className="shrink-0 text-warning" />
        {t.planner.overloadTitle}
      </h3>
      <p className="text-sm text-fg-muted">
        {t.planner.overloadBody(
          minutes(warning.averageNeededMinutes),
          minutes(warning.availableMinutes),
        )}
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {warning.options.map((option) => (
          <li key={option.action} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
            <span className="min-w-0 flex-1 text-sm">
              {option.action === 'reduce_new'
                ? t.planner.reduceNew(option.value, minutes(option.effectMinutesPerDay))
                : t.planner.raiseMinutes(
                    Math.min(MAX_DAILY_MINUTES, option.value),
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
    </section>
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

function plannedText(plan: DayPlan, isToday: boolean): string {
  const parts = [
    plan.reviews > 0 ? t.planner.reviewsShort(plan.reviews) : null,
    plan.newCards > 0 ? t.planner.newShort(plan.newCards) : null,
    plan.simulatorQuestions > 0 ? t.planner.questionsShort(plan.simulatorQuestions) : null,
    plan.challenge ? t.planner.challengeShort : null,
  ].filter((part) => part !== null);
  if (parts.length > 0) return parts.join(' · ');
  return isToday && plan.minutesUsed >= plan.minutesAvailable
    ? text.timeCovered
    : t.planner.emptyDay;
}

function doneText(done: DayDone): string {
  const parts = [
    done.minutes > 0 ? text.doneMinutes(done.minutes) : null,
    done.cards > 0 ? text.doneCards(done.cards) : null,
    done.questions > 0 ? text.doneQuestions(done.questions) : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(' · ') : text.nothingDone;
}

/** Los 7 días con lo planeado y, en el día que ya empezó, lo hecho */
function DayList({ days, today }: { days: readonly WeekDay[]; today: string }) {
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label={text.daysLabel} className="flex flex-col divide-y divide-line">
        {days.map((day) => (
          <DayRow key={day.plan.day} day={day} today={today} />
        ))}
      </ol>
      {/* La barra solo se ve. Las cifras ya van escritas en cada día */}
      <div aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-chart-done" />
          {text.done}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-chart-scheduled" />
          {text.planned}
        </span>
      </div>
    </div>
  );
}

function DayRow({ day, today }: { day: WeekDay; today: string }) {
  const { plan, done, isToday } = day;
  const label = t.planner.dayMinutes(
    minutes(plan.minutesUsed + plan.minutesPlanned),
    minutes(plan.minutesAvailable),
  );
  return (
    <li aria-current={isToday ? 'date' : undefined} className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold first-letter:uppercase">{dayLabel(plan.day, today)}</span>
        <span className="text-sm text-fg-muted tabular-nums">{label}</span>
      </div>
      <DayBar
        used={plan.minutesUsed}
        planned={plan.minutesPlanned}
        available={plan.minutesAvailable}
      />
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-sm">
        {isToday ? (
          <>
            <dt className="text-fg-muted">{text.done}</dt>
            <dd>{doneText(done)}</dd>
          </>
        ) : null}
        <dt className="text-fg-muted">{isToday ? text.toDo : text.planned}</dt>
        <dd>{plannedText(plan, isToday)}</dd>
      </dl>
    </li>
  );
}

/** Lo hecho y lo planeado sobre el tiempo del día. Si lo hecho pasa del tiempo, la escala crece */
function DayBar({
  used,
  planned,
  available,
}: {
  used: number;
  planned: number;
  available: number;
}) {
  const scale = Math.max(available, used + planned, 1);
  const width = (value: number) => `${(value / scale) * 100}%`;
  return (
    <div aria-hidden className="flex h-2 w-full overflow-hidden rounded-sm bg-line">
      {used > 0 ? <span className="h-full bg-chart-done" style={{ width: width(used) }} /> : null}
      {planned > 0 ? (
        <span className="h-full bg-chart-scheduled" style={{ width: width(planned) }} />
      ) : null}
    </div>
  );
}

/** De dónde salen los minutos del plan y el campo para declararlos, como en el planificador */
function MinutesSection({ session, view }: { session: ReadySession; view: PlannerView }) {
  const { user } = session;
  const [saved, setSaved] = useState(false);
  const source = view.minutes;
  return (
    <section
      aria-labelledby="tiempo-titulo"
      className="flex flex-col gap-3 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5"
    >
      <h3 id="tiempo-titulo" className="font-semibold">
        {t.planner.minutesTitle}
      </h3>
      {source.kind === 'measured' ? (
        <p className="text-sm text-fg-muted">
          {t.planner.minutesMeasured(source.days, minutes(source.average))}
        </p>
      ) : null}
      {source.kind === 'declared' ? (
        <p className="text-sm text-fg-muted">
          {t.planner.minutesDeclared(source.minutes)}{' '}
          {source.measuredAverage !== null
            ? t.planner.minutesRealAverage(source.measuredDays, minutes(source.measuredAverage))
            : t.planner.minutesRealSoon}
        </p>
      ) : null}
      {source.kind === 'provisional' ? (
        <div className="flex flex-col gap-2">
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
      {/* La clave rehace el campo cuando los minutos cambian desde fuera, como con el aviso */}
      <MinutesForm key={user.dailyMinutes ?? 'sin-minutos'} session={session} onSaved={setSaved} />
      <p role="status" className={cn('text-sm', saved ? 'text-success' : 'sr-only')}>
        {saved ? t.planner.minutesSaved : ''}
      </p>
    </section>
  );
}

function MinutesForm({
  session,
  onSaved,
}: {
  session: ReadySession;
  onSaved: (saved: boolean) => void;
}) {
  const api = useDataApi();
  const { user } = session;
  const [value, setValue] = useState(String(user.dailyMinutes ?? ''));
  const [invalid, setInvalid] = useState(false);
  const parsed = Number(value);
  const valid =
    Number.isInteger(parsed) && parsed >= MIN_DAILY_MINUTES && parsed <= MAX_DAILY_MINUTES;
  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid) {
      setInvalid(true);
      onSaved(false);
      return;
    }
    void updateProfile(api, user, { dailyMinutes: parsed }).then(() => {
      onSaved(true);
    });
  };
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={save} noValidate>
      <TextField
        label={t.planner.minutesLabel}
        type="number"
        min={MIN_DAILY_MINUTES}
        max={MAX_DAILY_MINUTES}
        inputMode="numeric"
        value={value}
        error={invalid ? t.planner.minutesError : null}
        className="min-w-44 flex-1"
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
          onSaved(false);
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
            onSaved(false);
            void updateProfile(api, user, { dailyMinutes: null });
          }}
        >
          {t.planner.minutesUseReal}
        </Button>
      ) : null}
    </form>
  );
}
