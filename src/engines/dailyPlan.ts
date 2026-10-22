/**
 * Plan de hoy (V4-B4, los consejos de la guía que Ricardo pasó).
 *
 * Qué hace. Pone lado a lado lo que el alumno ya hizo hoy y lo que se propuso, con las tres cifras
 * de la guía: tarjetas del día, tarjetas nuevas y preguntas.
 * Entradas. Los límites del alumno, que son sus ajustes de repaso, y lo hecho hoy.
 * Salidas. Una fila por cifra con lo hecho, la meta, la fracción avanzada y si ya se cumplió.
 * Método
 *   - Tarjetas del día. La meta es el límite de repasos más el de nuevas, porque la guía cuenta las
 *     300 tarjetas del día con sus 50 nuevas adentro. Con nuevas sin límite, solo el de repasos
 *   - Nuevas. El límite de nuevas del día. No sale con nuevas sin límite ni con cero
 *   - Preguntas. La meta de preguntas del día, que no pasa del tope diario del plan del alumno. Si el
 *     tope manda, la fila lo marca con capped, porque pedir 50 a quien solo puede 20 dejaría la barra
 *     sin llegar nunca al 100 por ciento. No sale con cero
 *   - Lo hecho cuenta todo lo estudiado hoy, también lo de una sesión por tema, porque es estudio
 *     aunque no gaste el cupo de la cola. Las nuevas también, y newCardsStudiedToday las cuenta aparte
 *     de reviewedToday, que deja fuera esas sesiones para no gastar el cupo
 *   - La fracción nunca pasa de 1, para no dibujar una barra más larga que su pista
 * Alcanzable (planFeasibility). Compara el tiempo que piden las tarjetas del plan con los minutos que el
 *   alumno declaró. Los minutos de tarjetas son la parte de su tiempo que ya usa la carga diaria
 *   (cardsTimeShare). El tiempo por tarjeta sale de su propio historial y nunca de una referencia, porque
 *   un aviso con tiempos inventados sería un dato falso. Sin minutos declarados o sin historial
 *   suficiente el estado es calibrando y no avisa de nada
 * Lo que no hace. No cambia ningún límite ni la cola del día. La guía solo propone cifras y el
 * alumno decide si las aplica
 */
import type { AppEvent } from '@/data/schemas/events';
import { studyDayOf } from './studyDay';

/**
 * Las cifras de la guía como límites de Ajustes del repaso. 300 tarjetas al día con 50 nuevas son 250
 * repasos y 50 nuevas, y 50 preguntas
 */
export const GUIDE_PLAN = { reviewsPerDay: 250, newCardsPerDay: 50, questionsPerDay: 50 } as const;

export interface PlanLimits {
  reviewsPerDay: number;
  newCardsPerDay: number;
  unlimitedNewCards: boolean;
  questionsPerDay: number;
}

export interface PlanDone {
  /** Tarjetas calificadas hoy, nuevas y repasos */
  cards: number;
  /** De ellas, las que eran nuevas */
  newCards: number;
  questions: number;
}

export type PlanKey = 'cards' | 'newCards' | 'questions';

export interface PlanRow {
  key: PlanKey;
  done: number;
  target: number;
  /** De 0 a 1 */
  fraction: number;
  met: boolean;
  /** La meta es el tope diario de su plan y no lo que el alumno ajustó, que era más. Solo en preguntas */
  capped: boolean;
}

function row(key: PlanKey, done: number, target: number, capped = false): PlanRow {
  return {
    key,
    done,
    target,
    fraction: target === 0 ? 0 : Math.min(1, done / target),
    met: done >= target,
    capped,
  };
}

export function dailyPlan(input: {
  limits: PlanLimits;
  done: PlanDone;
  /** Preguntas por día que permite el plan del alumno. null o sin dato es sin tope */
  questionsCap?: number | null;
}): PlanRow[] {
  const { limits, done } = input;
  const cap = input.questionsCap ?? null;
  const rows: PlanRow[] = [];
  const cardsTarget = limits.reviewsPerDay + (limits.unlimitedNewCards ? 0 : limits.newCardsPerDay);
  if (cardsTarget > 0) rows.push(row('cards', done.cards, cardsTarget));
  if (!limits.unlimitedNewCards && limits.newCardsPerDay > 0) {
    rows.push(row('newCards', done.newCards, limits.newCardsPerDay));
  }
  if (limits.questionsPerDay > 0) {
    const capped = cap !== null && limits.questionsPerDay > cap;
    rows.push(row('questions', done.questions, capped ? cap : limits.questionsPerDay, capped));
  }
  return rows;
}

/** Tiempo por tarjeta del alumno, del estimador de la carga diaria (estimateCardTimes) */
export interface PlanTimes {
  secondsPerReview: number;
  secondsPerNew: number;
  /** true si salen de su historial. Con los tiempos de referencia no se avisa de nada */
  measured: boolean;
}

export type PlanFeasibility =
  | { status: 'calibrating'; reason: 'needs_minutes' | 'needs_history' }
  | {
      status: 'ok' | 'over';
      /** Minutos que piden los límites de hoy si se llegara a todos */
      needMinutes: number;
      /** Minutos al día que el alumno dedica a tarjetas */
      budgetMinutes: number;
    };

/**
 * Si los límites de tarjetas de hoy caben en el tiempo que el alumno dijo que estudia. Los límites son
 * topes y la cola puede tener menos, así que over dice que llegar a todos no cabe, no que hoy toquen
 * tantas
 */
export function planFeasibility(input: {
  limits: PlanLimits;
  /** Minutos de estudio al día que declaró. null si no los ha puesto */
  dailyMinutes: number | null;
  times: PlanTimes;
  /** Fracción de sus minutos que va a tarjetas, de 0 a 1 (la misma de la carga diaria) */
  cardsTimeShare: number;
}): PlanFeasibility {
  const { limits, dailyMinutes, times } = input;
  if (dailyMinutes === null || !Number.isFinite(dailyMinutes) || dailyMinutes <= 0) {
    return { status: 'calibrating', reason: 'needs_minutes' };
  }
  if (!times.measured) return { status: 'calibrating', reason: 'needs_history' };
  const seconds =
    limits.reviewsPerDay * times.secondsPerReview +
    (limits.unlimitedNewCards ? 0 : limits.newCardsPerDay * times.secondsPerNew);
  const needMinutes = seconds / 60;
  const budgetMinutes = dailyMinutes * input.cardsTimeShare;
  return { status: needMinutes > budgetMinutes ? 'over' : 'ok', needMinutes, budgetMinutes };
}

/**
 * Tarjetas nuevas que el alumno estudió hoy, también en una sesión por tema. reviewedToday las deja
 * fuera porque no gastan el cupo de la cola, pero el plan cuenta todo lo estudiado, y si las nuevas
 * no incluyeran esas sesiones saldrían menos nuevas que tarjetas hechas en total
 */
export function newCardsStudiedToday(events: readonly AppEvent[], today: string): number {
  let count = 0;
  for (const event of events) {
    if (event.type !== 'card_reviewed' || studyDayOf(new Date(event.at), event.tz) !== today)
      continue;
    const before = event.payload.stateBefore;
    if (before === null || before.state === 'new') count += 1;
  }
  return count;
}

/** Si los límites ya son las cifras de la guía, para no ofrecer aplicarlas otra vez */
export function matchesGuidePlan(limits: PlanLimits): boolean {
  return (
    !limits.unlimitedNewCards &&
    limits.reviewsPerDay === GUIDE_PLAN.reviewsPerDay &&
    limits.newCardsPerDay === GUIDE_PLAN.newCardsPerDay &&
    limits.questionsPerDay === GUIDE_PLAN.questionsPerDay
  );
}
