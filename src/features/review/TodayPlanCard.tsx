// Plan de hoy dentro de Repasar (V4-B10, fase 2). Las mismas tres cifras de Inicio, tarjetas, nuevas y
// preguntas, en una tarjeta compacta de la columna de empezar. Debajo dice si los límites de hoy caben en
// los minutos que el alumno declaró. Compara lo que de verdad toca hoy, no los topes, y sale solo con su
// ritmo real de repaso y de tarjetas nuevas y con sus minutos puestos. Mientras falte algo de eso dice
// calibrando y no avisa de nada (planFeasibility).
import { useMemo } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { AppEvent } from '@/data/schemas/events';
import { estimateCardTimes, MIN_NEW_SAMPLES_TO_MEASURE } from '@/engines/dailyLoad';
import { dailyPlan, newCardsStudiedToday, planFeasibility } from '@/engines/dailyPlan';
import { t } from '@/i18n/es-MX';
import { homePlanText } from '@/i18n/homePlan';
import { reviewPlanText } from '@/i18n/reviewPlan';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { CalibratingNote } from '@/ui/states/states';
import { buildSnapshot } from '../home/snapshot';
import { useSubscription } from '../profile/useSubscription';
import type { ReadySession } from '../shared/RequireSession';
import { dailyQuestions } from '../shared/dailyLimit';
import { timeSamplesOf } from './dailyLoadData';

const RULES = DEFAULT_THRESHOLDS.daily;

export function TodayPlanCard({
  session,
  events,
  pending,
  onOpenSettings,
}: {
  session: ReadySession;
  events: readonly AppEvent[];
  /** Lo que queda por estudiar hoy en la cola, que ya respeta los límites del día */
  pending: { reviews: number; newCards: number };
  /** Abre Ajustes del repaso, donde se bajan los límites */
  onOpenSettings?: () => void;
}) {
  const { user, settings } = session;
  const subscription = useSubscription(user.id);
  // Un solo recorrido de la bitácora, y solo cuando cambia
  const data = useMemo(() => {
    const snapshot = buildSnapshot({ events, user, settings, now: new Date() });
    return {
      today: snapshot.today,
      cards: snapshot.todayActivity.cards,
      questions: snapshot.todayActivity.questions,
      newCards: newCardsStudiedToday(events, snapshot.today),
      times: estimateCardTimes(timeSamplesOf(events), {
        minReviewsToMeasure: RULES.minReviewsToMeasure,
        referenceSecondsPerReview: RULES.referenceSecondsPerReview,
        referenceSecondsPerNew: RULES.referenceSecondsPerNew,
        capSeconds: RULES.cardTimeCapSeconds,
      }),
    };
  }, [events, user, settings]);

  // Sin saber el plan no se sabe el tope de preguntas, así que se espera en lugar de mostrar otra cifra
  if (subscription === undefined) return null;
  const questionsCap = dailyQuestions({
    events,
    subscription,
    timeZone: user.timeZone,
    now: new Date(),
  }).limit;
  const limits = {
    reviewsPerDay: settings.reviewsPerDay,
    newCardsPerDay: settings.newCardsPerDay,
    unlimitedNewCards: settings.unlimitedNewCards,
    questionsPerDay: settings.questionsPerDay,
  };
  const rows = dailyPlan({
    limits,
    questionsCap,
    done: { cards: data.cards, newCards: data.newCards, questions: data.questions },
  });
  if (rows.length === 0) return null;
  const feasibility = planFeasibility({
    limits,
    // Lo que ya hizo hoy más lo que queda. Los repasos son las tarjetas hechas menos las nuevas
    available: {
      reviews: Math.max(0, data.cards - data.newCards) + pending.reviews,
      newCards: data.newCards + pending.newCards,
    },
    dailyMinutes: user.dailyMinutes,
    times: data.times,
    cardsTimeShare: RULES.cardsTimeShare,
  });

  return (
    <Card aria-labelledby="plan-de-hoy-repasar" className="flex flex-col gap-2.5 p-3 sm:p-4">
      <CardHeader className="mb-0">
        <CardTitle id="plan-de-hoy-repasar" className="text-base">
          {t.widgets.plan.title}
        </CardTitle>
      </CardHeader>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const name = t.widgets.plan.rows[row.key];
          return (
            <li key={row.key} className="flex flex-col gap-0.5">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span>{name}</span>
                <span className="tabular-nums text-fg-muted">
                  {t.widgets.goal.ratio(row.done, row.target)}
                </span>
              </span>
              <ProgressBar
                className="h-1.5"
                value={row.done}
                max={row.target}
                label={t.widgets.plan.label(name, row.done, row.target)}
              />
              {row.capped && questionsCap !== null ? (
                <span className="text-xs text-fg-muted">{homePlanText.capped(questionsCap)}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {feasibility.status === 'over' ? (
        <div className="flex flex-col items-start gap-1.5 rounded-md border border-warning bg-warning-soft p-2.5 text-sm">
          <p className="font-medium">
            {reviewPlanText.over(feasibility.needMinutes, feasibility.budgetMinutes)}
          </p>
          <p>{reviewPlanText.overHint}</p>
          {onOpenSettings ? (
            <Button variant="secondary" size="sm" onClick={onOpenSettings}>
              {reviewPlanText.openSettings}
            </Button>
          ) : null}
        </div>
      ) : null}
      {feasibility.status === 'calibrating' && feasibility.reason === 'needs_minutes' ? (
        <div role="status" className="flex flex-col items-start gap-1.5 rounded-md bg-muted p-2.5">
          <p className="text-sm">{reviewPlanText.needsMinutes}</p>
          <Button asChild variant="secondary" size="sm">
            <Link to={screenPath('progress')}>{reviewPlanText.goToMinutes}</Link>
          </Button>
        </div>
      ) : null}
      {feasibility.status === 'calibrating' && feasibility.reason === 'needs_history' ? (
        <CalibratingNote
          current={data.times.reviews}
          target={RULES.minReviewsToMeasure}
          unit={reviewPlanText.historyUnit}
        />
      ) : null}
      {feasibility.status === 'calibrating' && feasibility.reason === 'needs_new_history' ? (
        <CalibratingNote
          current={data.times.newSamples ?? 0}
          target={MIN_NEW_SAMPLES_TO_MEASURE}
          unit={reviewPlanText.newHistoryUnit}
        />
      ) : null}
    </Card>
  );
}
