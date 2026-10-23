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
  /** true si el tiempo por repaso sale de su historial. Con la referencia no se avisa de nada */
  measured: boolean;
  /** true si el tiempo por tarjeta nueva también. Sin él las nuevas no se pueden contar */
  newMeasured?: boolean;
}

export type PlanFeasibility =
  | {
      status: 'calibrating';
      /** Faltan minutos declarados, repasos propios o tarjetas nuevas propias */
      reason: 'needs_minutes' | 'needs_history' | 'needs_new_history';
    }
  | {
      status: 'ok' | 'over';
      /** Minutos que pide el trabajo de hoy, redondeados */
      needMinutes: number;
      /** Minutos al día que el alumno dedica a tarjetas, redondeados */
      budgetMinutes: number;
    };

/**
 * Si el trabajo de tarjetas de hoy cabe en el tiempo que el alumno dijo que estudia. El trabajo es el
 * menor entre el límite y lo que de verdad hay hoy en la cola (available), igual que la sugerencia de
 * nuevas de la carga diaria. Sin available se usan los topes, que dicen si llegar a todos cabría. Los
 * minutos se redondean antes de compararlos, así nunca sale 30 contra 30 como advertencia
 */
export function planFeasibility(input: {
  limits: PlanLimits;
  /** Lo que hoy hay de verdad por estudiar, entre repasos y nuevas, contando lo que ya hizo */
  available?: { reviews: number; newCards: number };
  /** Minutos de estudio al día que declaró. null si no los ha puesto */
  dailyMinutes: number | null;
  times: PlanTimes;
  /** Fracción de sus minutos que va a tarjetas, de 0 a 1 (la misma de la carga diaria) */
  cardsTimeShare: number;
}): PlanFeasibility {
  const { limits, available, dailyMinutes, times } = input;
  if (dailyMinutes === null || !Number.isFinite(dailyMinutes) || dailyMinutes <= 0) {
    return { status: 'calibrating', reason: 'needs_minutes' };
  }
  if (!times.measured) return { status: 'calibrating', reason: 'needs_history' };
  const reviews = available
    ? Math.min(limits.reviewsPerDay, available.reviews)
    : limits.reviewsPerDay;
  const newLimit = limits.unlimitedNewCards ? Number.POSITIVE_INFINITY : limits.newCardsPerDay;
  const newCards = available
    ? Math.min(newLimit, available.newCards)
    : limits.unlimitedNewCards
      ? 0
      : limits.newCardsPerDay;
  // Las nuevas solo se cuentan con su propio ritmo. Con la referencia se inventaría el tiempo
  if (newCards > 0 && times.newMeasured !== true) {
    return { status: 'calibrating', reason: 'needs_new_history' };
  }
  const needMinutes = Math.round(
    (reviews * times.secondsPerReview + newCards * times.secondsPerNew) / 60,
  );
  const budgetMinutes = Math.round(dailyMinutes * input.cardsTimeShare);
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
