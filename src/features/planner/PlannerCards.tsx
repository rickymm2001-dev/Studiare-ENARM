// Tarjetas del planificador que se usan en Progreso y Plan (D-119 B3, comentario 13).
// Semana de 7 días con lo planeado contra lo hecho y aviso de sobrecarga con sus opciones.
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import { updateProfile } from '@/data/usecases/profile';
import type { DayPlan, OverloadOption } from '@/engines/planner';
import { addDays } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import type { ReadySession } from '../shared/RequireSession';

const minutes = (value: number) => Math.round(value);

export function OverloadCard({
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
        ? // Bajar las nuevas también apaga el modo sin límite, si no el número no tendría efecto
          updateProfile(api, session.user, {
            settings: { newCardsPerDay: option.value, unlimitedNewCards: false },
          })
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

export function WeekCard({ week, today }: { week: readonly DayPlan[]; today: string }) {
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
                day.day === today && 'border-indicator bg-primary-soft',
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
