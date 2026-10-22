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
 *   - Preguntas. La meta de preguntas del día. No sale con cero
 *   - Lo hecho cuenta todo lo estudiado hoy, también lo de una sesión por tema, porque es estudio
 *     aunque no gaste el cupo de la cola
 *   - La fracción nunca pasa de 1, para no dibujar una barra más larga que su pista
 * Lo que no hace. No cambia ningún límite ni la cola del día. La guía solo propone cifras y el
 * alumno decide si las aplica
 */

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
}

function row(key: PlanKey, done: number, target: number): PlanRow {
  return {
    key,
    done,
    target,
    fraction: target === 0 ? 0 : Math.min(1, done / target),
    met: done >= target,
  };
}

export function dailyPlan(input: { limits: PlanLimits; done: PlanDone }): PlanRow[] {
  const { limits, done } = input;
  const rows: PlanRow[] = [];
  const cardsTarget = limits.reviewsPerDay + (limits.unlimitedNewCards ? 0 : limits.newCardsPerDay);
  if (cardsTarget > 0) rows.push(row('cards', done.cards, cardsTarget));
  if (!limits.unlimitedNewCards && limits.newCardsPerDay > 0) {
    rows.push(row('newCards', done.newCards, limits.newCardsPerDay));
  }
  if (limits.questionsPerDay > 0)
    rows.push(row('questions', done.questions, limits.questionsPerDay));
  return rows;
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
