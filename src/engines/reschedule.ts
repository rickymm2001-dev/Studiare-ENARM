/**
 * Atrasos de repaso (D-085, fila 5 de la tabla de controversias).
 *
 * Qué hace. Calcula a qué fecha debe pasar cada tarjeta cuando el alumno se atrasa. Reparte las
 * vencidas entre varios días, pospone, adelanta repasos y deshace un cambio anterior. Avisa cuando
 * hay tantas vencidas que conviene un plan de recuperación.
 * Entradas. Las tarjetas (QueueCard), el momento actual, la configuración del alumno y los
 * parámetros de cada acción (días, cantidad).
 * Salidas. Asignaciones { cardId, from, to } con las dos fechas en ISO UTC. El motor solo calcula.
 * Quien lo usa las guarda en un evento nuevo cards_rescheduled (kind, cards, days, undoes), porque la
 * bitácora solo se agrega y un repaso ya registrado no se edita. Un cambio de fecha tampoco toca el
 * pasado. Las asignaciones solo mueven la fecha de vencimiento y nunca la estabilidad ni la
 * dificultad de FSRS. La estabilidad la corrige el siguiente repaso con el tiempo transcurrido.
 * Método
 *   - Atraso. Tarjeta que ya salió de la etapa nueva y venció antes del inicio del día de estudio
 *     de hoy (4 a. m. locales, 9.4). Lo que vence hoy no es atraso
 *   - Aviso de recuperación. Se activa cuando las vencidas llegan a lo mayor entre un mínimo y una
 *     fracción del límite diario de repasos. Sugiere de 2 a 7 días y calcula el plan con la mitad
 *     del límite diario por día. La otra mitad queda libre para los repasos propios de cada día, así
 *     el alumno no paga el atraso con un día imposible
 *   - Repartir. Pone las vencidas entre hoy y los siguientes días de estudio, 1 a 7. Las más
 *     olvidadas (menor retrievability) van primero y caen en los primeros días. Cada día recibe lo
 *     más parejo posible sin pasar de su capacidad, que es el límite diario menos lo que ya vence ese
 *     día. Si no alcanza la capacidad total, overCapacity es true y se reparte parejo ignorándola
 *   - Días fáciles. Repartir salta los días marcados como casi sin repasos (minimum) y da la mitad
 *     de capacidad a los de menos repasos (reduced). Hoy cuenta siempre. Se reparte entre N días
 *     útiles aunque eso estire el calendario
 *   - Las que se quedan hoy no generan asignación. Su fecha ya pasó y siguen vencidas hoy
 *   - Posponer. Lleva todas las tarjetas programadas, estén vencidas o no, al menos hasta el inicio
 *     del día de estudio dentro de N días. Nunca adelanta una tarjeta
 *   - Adelantar. Trae al presente los próximos repasos que todavía no vencen hoy
 *   - Deshacer. Solo regresa las tarjetas cuyo vencimiento sigue siendo el del cambio. Si la persona
 *     ya la repasó o la movió otra vez, no se toca
 *   - Modo examen. Ningún vencimiento nuevo cae en o después del inicio del día del ENARM. Si el
 *     examen ya empezó, no hay a dónde repartir ni posponer
 *   - Las tarjetas nuevas (estado new o sin estado) nunca se mueven
 *   - Es determinista. El orden de las tarjetas de entrada no cambia el resultado, porque todo
 *     empate se rompe por cardId. Se espera un cardId distinto por tarjeta
 * Umbrales. Repartir de 1 a 7 días, posponer de 1 a 30, adelantar hasta 5,000, lotes de 500 por
 * evento. El mínimo de vencidas y la fracción del límite del aviso vienen en RecoveryRules, que
 * decide quien llama desde la configuración.
 */
import type { FsrsCardState } from '@/data/schemas/common';
import { weekdayOf } from './easyDays';
import { examDeadline, retrievabilityOf, type QueueCard, type SchedulerConfig } from './fsrs';
import { addDays, studyDayEnd, studyDayOf, studyDayStart } from './studyDay';
import { inBatches } from './suspension';

/** Máximo de días entre los que se reparten los atrasos */
export const MAX_SPREAD_DAYS = 7;
/** Máximo de días que se puede posponer */
export const MAX_POSTPONE_DAYS = 30;
/** Máximo de repasos que se adelantan en una sola acción */
export const MAX_ADVANCE_COUNT = 5000;
/** Tarjetas por evento cards_rescheduled. Lo que pasa de ahí se parte en lotes */
export const RESCHEDULE_BATCH = 500;

/** Cambio de fecha de una tarjeta. Las dos fechas son ISO UTC */
export interface RescheduledCard {
  cardId: string;
  from: string;
  to: string;
}

export interface RecoveryRules {
  /** Atrasadas mínimas para avisar, sin importar el límite diario */
  minOverdue: number;
  /** Fracción del límite diario de repasos desde la que se avisa */
  overdueShareOfLimit: number;
}

export interface OverdueSummary {
  overdue: number;
  reviewLimit: number;
  needsRecovery: boolean;
  /** Días de estudio sugeridos para repartir. 1 si no hace falta recuperación */
  suggestedDays: number;
}

export interface SpreadPlan {
  /** Solo las tarjetas que cambian de fecha. Las que se quedan hoy no aparecen */
  assignments: RescheduledCard[];
  /** Cuántas atrasadas recibe cada día del plan, hoy incluido. Vacío si no hay días antes del examen */
  perDay: { day: string; count: number }[];
  /** La capacidad de los días no alcanza para todas y se repartió ignorándola */
  overCapacity: boolean;
}

/** Tarjeta ya programada, con su estado y su vencimiento leído una sola vez */
interface ScheduledCard {
  card: QueueCard;
  state: FsrsCardState;
  dueMs: number;
}

/** null si la tarjeta es nueva (estado new o sin estado) o si su fecha no se puede leer */
function scheduledOf(card: QueueCard): ScheduledCard | null {
  const state = card.state;
  if (state === null || state.state === 'new') return null;
  const dueMs = Date.parse(state.due);
  return Number.isNaN(dueMs) ? null : { card, state, dueMs };
}

/** Comparación por unidades de código, igual en cualquier idioma del dispositivo */
function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Del vencimiento más cercano al más lejano. Los empates se resuelven por cardId */
function byDueThenId(a: ScheduledCard, b: ScheduledCard): number {
  return a.dueMs - b.dueMs || compareIds(a.card.cardId, b.card.cardId);
}

/** Entero dentro de [min, max]. Lo que no es número da min */
function clampInt(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function isoOf(ms: number): string {
  return new Date(ms).toISOString();
}

/** Mismo instante aunque el texto venga con otro formato. Si no se pueden leer, el texto exacto */
function sameInstant(a: string, b: string): boolean {
  if (a === b) return true;
  const first = Date.parse(a);
  return !Number.isNaN(first) && first === Date.parse(b);
}

/**
 * Tarjetas atrasadas, de la más vencida a la menos vencida y luego por cardId. Son las que ya
 * salieron de nuevas y vencieron antes del inicio del día de estudio de hoy
 */
export function overdueCards(
  cards: readonly QueueCard[],
  now: Date,
  timeZone: string,
): QueueCard[] {
  const todayStart = studyDayStart(studyDayOf(now, timeZone), timeZone).getTime();
  const overdue: ScheduledCard[] = [];
  for (const card of cards) {
    const scheduled = scheduledOf(card);
    if (scheduled && scheduled.dueMs < todayStart) overdue.push(scheduled);
  }
  return overdue.sort(byDueThenId).map((entry) => entry.card);
}

/** Cuántas hay atrasadas y si conviene un plan de recuperación */
export function summarizeOverdue(input: {
  cards: readonly QueueCard[];
  now: Date;
  config: SchedulerConfig;
  rules: RecoveryRules;
}): OverdueSummary {
  const { config, rules } = input;
  const overdue = overdueCards(input.cards, input.now, config.timeZone).length;
  const reviewLimit = config.thresholds.reviewsPerDay;
  const threshold = Math.max(rules.minOverdue, Math.ceil(rules.overdueShareOfLimit * reviewLimit));
  const needsRecovery = overdue > 0 && overdue >= threshold;
  // La recuperación usa la mitad del límite por día y deja la otra mitad para los repasos propios
  // de cada día. Entre 2 y 7 días, que es lo que admite repartir
  const recoveryPerDay = Math.max(1, Math.floor(reviewLimit / 2));
  const suggestedDays = needsRecovery
    ? Math.min(MAX_SPREAD_DAYS, Math.max(2, Math.ceil(overdue / recoveryPerDay)))
    : 1;
  return { overdue, reviewLimit, needsRecovery, suggestedDays };
}

/**
 * Reparte un total entre días, lo más parejo posible y sin pasar de la capacidad de cada uno. Busca
 * el nivel más alto que cabe y los sobrantes (menos de uno por día) van a los primeros días con
 * espacio. Requiere que el total no pase de la suma de capacidades
 */
function allocateEvenly(capacities: readonly number[], total: number): number[] {
  const filledAt = (level: number) =>
    capacities.reduce((sum, capacity) => sum + Math.min(capacity, level), 0);
  let low = 0;
  let high = capacities.reduce((max, capacity) => Math.max(max, capacity), 0);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (filledAt(middle) <= total) low = middle;
    else high = middle - 1;
  }
  let extra = total - filledAt(low);
  return capacities.map((capacity) => {
    const base = Math.min(capacity, low);
    if (extra > 0 && base < capacity) {
      extra -= 1;
      return base + 1;
    }
    return base;
  });
}

/**
 * Reparte las atrasadas entre hoy y los siguientes días de estudio (1 a 7). Las más olvidadas
 * van primero. Hoy no genera asignación, solo cuenta en perDay, que cuenta las atrasadas que recibe
 * cada día y no lo que ya vencía ese día
 */
export function spreadOverdue(input: {
  cards: readonly QueueCard[];
  now: Date;
  config: SchedulerConfig;
  days: number;
}): SpreadPlan {
  const { now, config } = input;
  const timeZone = config.timeZone;
  const today = studyDayOf(now, timeZone);
  const todayStart = studyDayStart(today, timeZone).getTime();
  const deadline = examDeadline(config)?.getTime() ?? null;

  // Días disponibles. Ninguno empieza en o después del inicio del día del ENARM. Los días que el
  // alumno marcó como casi sin repasos no reciben atrasadas y los de menos repasos reciben la mitad.
  // Hoy siempre cuenta, porque las vencidas ya están ahí. Se piden N días útiles y se busca hasta
  // 7 días más allá para completarlos
  const slots: { day: string; start: number; end: number; share: number }[] = [];
  const requested = clampInt(input.days, 1, MAX_SPREAD_DAYS);
  for (let offset = 0; slots.length < requested && offset < requested + 7; offset += 1) {
    const day = addDays(today, offset);
    const start = studyDayStart(day, timeZone).getTime();
    if (deadline !== null && start >= deadline) break;
    const level = offset === 0 ? 'normal' : (config.easyDays?.[weekdayOf(day)] ?? 'normal');
    if (level === 'minimum') continue;
    slots.push({
      day,
      start,
      end: studyDayEnd(day, timeZone).getTime(),
      share: level === 'reduced' ? 0.5 : 1,
    });
  }
  if (slots.length === 0) return { assignments: [], perDay: [], overCapacity: false };

  // Una sola pasada. Las atrasadas se reparten y las demás ocupan la capacidad de su día
  const pending: ScheduledCard[] = [];
  const alreadyDue = slots.map(() => 0);
  for (const card of input.cards) {
    const scheduled = scheduledOf(card);
    if (!scheduled) continue;
    if (scheduled.dueMs < todayStart) {
      pending.push(scheduled);
      continue;
    }
    const index = slots.findIndex(
      (slot) => scheduled.dueMs >= slot.start && scheduled.dueMs < slot.end,
    );
    if (index >= 0) alreadyDue[index] = (alreadyDue[index] ?? 0) + 1;
  }

  const capacities = alreadyDue.map((due, index) =>
    Math.floor(Math.max(0, config.thresholds.reviewsPerDay - due) * (slots[index]?.share ?? 1)),
  );
  const capacityTotal = capacities.reduce((sum, capacity) => sum + capacity, 0);
  const overCapacity = capacityTotal < pending.length;
  const allocation = allocateEvenly(
    overCapacity ? slots.map(() => pending.length) : capacities,
    pending.length,
  );

  // Las de menor retrievability primero, y a igualdad por cardId
  const ranked = pending
    .map((entry) => ({ entry, retrievability: retrievabilityOf(entry.state, now) }))
    .sort(
      (a, b) =>
        a.retrievability - b.retrievability || compareIds(a.entry.card.cardId, b.entry.card.cardId),
    );

  const assignments: RescheduledCard[] = [];
  const perDay: { day: string; count: number }[] = [];
  let cursor = 0;
  slots.forEach((slot, index) => {
    const count = allocation[index] ?? 0;
    perDay.push({ day: slot.day, count });
    if (index > 0) {
      const to = isoOf(slot.start);
      for (const { entry } of ranked.slice(cursor, cursor + count)) {
        assignments.push({ cardId: entry.card.cardId, from: entry.state.due, to });
      }
    }
    cursor += count;
  });
  return { assignments, perDay, overCapacity };
}

/**
 * Pospone todas las tarjetas programadas al menos hasta el inicio del día de estudio dentro de
 * `days` días (1 a 30). Nunca adelanta una tarjeta ni pasa del inicio del día del ENARM. Con el
 * examen ya empezado no hay nada que posponer
 */
export function postponeCards(input: {
  cards: readonly QueueCard[];
  now: Date;
  config: SchedulerConfig;
  days: number;
}): RescheduledCard[] {
  const { now, config } = input;
  const deadline = examDeadline(config)?.getTime() ?? null;
  if (deadline !== null && deadline <= now.getTime()) return [];
  const timeZone = config.timeZone;
  const requested = clampInt(input.days, 1, MAX_POSTPONE_DAYS);
  const target = studyDayStart(addDays(studyDayOf(now, timeZone), requested), timeZone).getTime();
  // Todas llegan al mismo instante. Las que ya vencen después, o en ese instante, no se tocan
  const destination = deadline === null ? target : Math.min(target, deadline);
  const to = isoOf(destination);
  const moved: ScheduledCard[] = [];
  for (const card of input.cards) {
    const scheduled = scheduledOf(card);
    if (scheduled && scheduled.dueMs < destination) moved.push(scheduled);
  }
  return moved
    .sort(byDueThenId)
    .map((entry) => ({ cardId: entry.card.cardId, from: entry.state.due, to }));
}

/**
 * Trae al presente los próximos `count` repasos que todavía no vencen hoy, del más cercano al más
 * lejano. Su nuevo vencimiento es el momento actual
 */
export function advanceReviews(input: {
  cards: readonly QueueCard[];
  now: Date;
  config: SchedulerConfig;
  count: number;
}): RescheduledCard[] {
  const { now, config } = input;
  const limit = clampInt(input.count, 0, MAX_ADVANCE_COUNT);
  if (limit === 0) return [];
  const todayEnd = studyDayEnd(studyDayOf(now, config.timeZone), config.timeZone).getTime();
  const upcoming: ScheduledCard[] = [];
  for (const card of input.cards) {
    const scheduled = scheduledOf(card);
    if (scheduled && scheduled.dueMs >= todayEnd) upcoming.push(scheduled);
  }
  const to = now.toISOString();
  return upcoming
    .sort(byDueThenId)
    .slice(0, limit)
    .map((entry) => ({ cardId: entry.card.cardId, from: entry.state.due, to }));
}

/**
 * Deshace un cambio anterior. Solo regresa las tarjetas cuyo vencimiento actual sigue siendo el que
 * puso el cambio. Si la persona ya la repasó o la movió otra vez, no se toca
 */
export function undoAssignments(input: {
  moved: readonly RescheduledCard[];
  currentDue: (cardId: string) => string | null;
}): RescheduledCard[] {
  const undone: RescheduledCard[] = [];
  for (const move of input.moved) {
    const current = input.currentDue(move.cardId);
    if (current === null || !sameInstant(current, move.to)) continue;
    if (sameInstant(current, move.from)) continue;
    undone.push({ cardId: move.cardId, from: current, to: move.from });
  }
  return undone;
}

/** Parte las asignaciones en lotes de lo que admite un evento cards_rescheduled */
export function rescheduleBatches(assignments: readonly RescheduledCard[]): RescheduledCard[][] {
  return inBatches(assignments, RESCHEDULE_BATCH);
}
