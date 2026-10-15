// La semana de Progreso (comentario 13 del plan del cambio, B3). Junta lo que guarda la app para el
// plan de los próximos 7 días y lo que el alumno ya hizo en cada uno, sin React ni Dexie, para
// probarlo con datos armados a mano. El plan lo arma buildPlannerView con el motor planner, con las
// mismas entradas que usaba la pantalla del planificador.
import { examDateFor } from '@/config/exam';
import type { Card, Deck } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import type { Subscription } from '@/data/schemas/people';
import type { DayPlan } from '@/engines/planner';
import { studyDayOf } from '@/engines/studyDay';
import { suspendedCardIds } from '@/engines/suspension';
import { followedDeckIds } from '../decks/followed';
import { buildSnapshot } from '../home/snapshot';
import { schedulerConfig } from '../review/schedulerConfig';
import { latestCardStates, reviewedToday } from '../review/study';
import type { QuotaInfo } from '@/data/bank/contracts';
import { dailyQuestions } from '../shared/dailyLimit';
import type { ReadySession } from '../shared/RequireSession';
import { buildPlannerView, type PlannerView } from './planView';

/** Lo que el alumno hizo en un día, con las mismas cuentas de Inicio y del heatmap */
export interface DayDone {
  cards: number;
  questions: number;
  minutes: number;
}

export interface WeekDay {
  plan: DayPlan;
  isToday: boolean;
  /** Lo hecho ese día. Solo hoy puede tener algo, porque los demás días todavía no llegan */
  done: DayDone;
}

export interface WeekPlan {
  /** Día de estudio de hoy, AAAA-MM-DD */
  today: string;
  /** Los 7 días del plan, de hoy en adelante */
  days: WeekDay[];
  view: PlannerView;
  /** Preguntas por día del plan del alumno. null es sin límite */
  questionLimit: number | null;
}

/** Sin límite de nuevas, la propuesta de bajarlas parte de esto si el alumno no tenía un número */
const REDUCE_NEW_FALLBACK = 20;

export function buildWeekPlan(input: {
  now: Date;
  session: Pick<ReadySession, 'user' | 'settings' | 'isDemo'>;
  events: readonly AppEvent[];
  decks: readonly Deck[];
  cards: readonly Card[];
  /** null si no tiene suscripción, que es el plan Gratis */
  subscription: Pick<Subscription, 'plan' | 'status'> | null;
  /** Preguntas de un examen abierto que cuentan para hoy aunque todavía no estén en la bitácora */
  reservedQuestions: number;
  /** La última cuota del banco de la nube (B11, 5.5). Sin ella cuenta solo la app */
  serverQuota?: QuotaInfo | null;
}): WeekPlan {
  const { now, session, events } = input;
  const { user, settings } = session;
  const today = studyDayOf(now, user.timeZone);
  const followed = followedDeckIds(session, input.decks);
  // Las tarjetas suspendidas no cuentan para la carga ni para el plan (D-085)
  const suspended = suspendedCardIds(events);
  const cards = input.cards.filter((card) => followed.has(card.deckId) && !suspended.has(card.id));
  const states = latestCardStates(events);
  const noteOfCard = new Map(cards.map((card) => [card.id, card.noteId]));
  // El plan Gratis solo deja 20 preguntas al día, así que el bloque de práctica no pasa de ahí
  const daily = dailyQuestions({
    events,
    subscription: input.subscription,
    timeZone: user.timeZone,
    now,
    reserved: input.reservedQuestions,
    serverQuota: input.serverQuota ?? null,
  });
  const { activity } = buildSnapshot({ events, user, settings, now });
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
    activity,
    declaredMinutes: user.dailyMinutes,
    examDate: examDateFor(user),
    questionLimit: { today: daily.left, perDay: daily.limit },
    // Sin límite de nuevas, bajar parte de lo que el alumno tenía guardado y no del tope enorme
    ...(settings.unlimitedNewCards
      ? {
          reduceNewFrom:
            settings.newCardsPerDay > 0 ? settings.newCardsPerDay : REDUCE_NEW_FALLBACK,
        }
      : {}),
  });
  return {
    today,
    days: view.plan.week.map((plan) => {
      const summary = activity[plan.day];
      return {
        plan,
        isToday: plan.day === today,
        done: {
          cards: summary?.cards ?? 0,
          questions: summary?.questions ?? 0,
          minutes: summary?.focusMinutes ?? 0,
        },
      };
    }),
    view,
    questionLimit: daily.limit,
  };
}
