// Entradas del planificador a partir de lo que guarda la app (7.10, 13). Las cuentas las hace el
// motor planner. Aquí solo se juntan los datos reales del alumno, sin React ni Dexie, para
// poder probarlo con tarjetas y actividad armadas a mano.
import { projectLoad, type DayLoad, type QueueCard, type SchedulerConfig } from '@/engines/fsrs';
import { buildPlan, type PlannerOutput } from '@/engines/planner';
import { addDays } from '@/engines/studyDay';
import type { ReviewedToday } from '@/engines/fsrs';
import type { DaySummary } from '../home/snapshot';

/** Minutos al día que usa el plan mientras no hay declarados ni suficientes días medidos */
export const PROVISIONAL_MINUTES = 60;
/** Días de estudio que hacen falta para usar el promedio real en vez de lo declarado */
export const MEASURED_DAYS_NEEDED = 3;
/** Cuántos días hacia atrás se miran para el promedio real */
export const MEASURED_WINDOW_DAYS = 14;
/** Días que cubre el plan de la semana */
export const PLAN_DAYS = 7;

/**
 * Minutos de estudio de los últimos días con actividad, sin contar hoy porque todavía no termina
 * y su total engañaría al promedio. Solo entran los días con estudio
 */
export function measuredMinutes(activity: Readonly<Record<string, DaySummary>>, today: string) {
  const minutes: number[] = [];
  for (let back = 1; back <= MEASURED_WINDOW_DAYS; back += 1) {
    const value = activity[addDays(today, -back)]?.focusMinutes ?? 0;
    if (value > 0) minutes.push(value);
  }
  return minutes;
}

export type MinutesSource =
  /** Lo que declaró el alumno. Gana sobre el promedio medido porque es lo que pidió. Si ya hay
   * días de estudio suficientes, se informa su promedio real al lado */
  | { kind: 'declared'; minutes: number; measuredDays: number; measuredAverage: number | null }
  /** Promedio de los días de estudio medidos, mientras el alumno no declare minutos */
  | { kind: 'measured'; days: number; average: number }
  /** Valor inicial mientras faltan días de estudio. Calibrando */
  | { kind: 'provisional'; measuredDays: number };

export interface PlannerView {
  plan: PlannerOutput;
  minutes: MinutesSource;
  /** Tarjetas nuevas por día de hoy, que es lo que se propone bajar si hay sobrecarga */
  newCardsPerDay: number;
  /** Cuántas tarjetas de mazos seguidos entran al plan. Con cero solo hay simulador y retos */
  cardCount: number;
}

/**
 * Deja la carga lista para el motor. La proyección cuenta como repaso la segunda vista de cada
 * tarjeta nueva el mismo día (su paso de aprendizaje), pero el motor ya cobra ese rato dentro del
 * tiempo de una nueva, así que se resta para no contarla dos veces. Después recorta cada día a los
 * límites del alumno y descuenta lo que ya hizo hoy, para que coincida con la cola de Repasar
 */
export function applyLimits(
  load: readonly DayLoad[],
  limits: { reviewsPerDay: number; newCardsPerDay: number },
  done: ReviewedToday,
): DayLoad[] {
  return load.map((day, index) => ({
    day: day.day,
    reviews: Math.min(
      Math.max(0, day.reviews - day.newCards),
      Math.max(0, limits.reviewsPerDay - (index === 0 ? done.reviewCount : 0)),
    ),
    newCards: Math.min(
      day.newCards,
      Math.max(0, limits.newCardsPerDay - (index === 0 ? done.newCount : 0)),
    ),
  }));
}

export function buildPlannerView(input: {
  now: Date;
  today: string;
  config: SchedulerConfig;
  cards: readonly QueueCard[];
  /** Lo que ya repasó hoy, para no contar dos veces las nuevas ni los repasos */
  reviewedToday: ReviewedToday;
  activity: Readonly<Record<string, DaySummary>>;
  /** Minutos que declaró el alumno. null si no los ha dicho */
  declaredMinutes: number | null;
  examDate: string | null;
  /** Claves de subespecialidad en orden de prioridad, de los temas a reforzar */
  priorityTopics: readonly string[];
  /** Preguntas que le deja contestar su plan, hoy y por día. null es sin límite */
  questionLimit?: { today: number | null; perDay: number | null };
}): PlannerView {
  const { config, now, today } = input;
  const limits = {
    reviewsPerDay: config.thresholds.reviewsPerDay,
    newCardsPerDay: config.thresholds.newCardsPerDay,
  };
  const project = (newPerDay: number) =>
    applyLimits(
      projectLoad({
        cards: input.cards,
        now,
        days: PLAN_DAYS,
        config: { ...config, thresholds: { ...config.thresholds, newCardsPerDay: newPerDay } },
      }),
      { ...limits, newCardsPerDay: newPerDay },
      input.reviewedToday,
    );
  const load = project(limits.newCardsPerDay);
  // Si hay sobrecarga se propone la mitad de nuevas por día. Con cero no hay nada que bajar
  const fewerNew = Math.floor(limits.newCardsPerDay / 2);
  const measured = measuredMinutes(input.activity, today);

  // Lo declarado gana. El motor prefiere los minutos medidos si hay 3 días, así que sin declarar se
  // le pasan y declarando se le ocultan, para que el ajuste que el alumno aplica sí cambie el plan
  const plan = buildPlan({
    today,
    examDate: input.examDate,
    declaredMinutes: input.declaredMinutes ?? PROVISIONAL_MINUTES,
    pomodoroMinutes: input.declaredMinutes === null ? measured : [],
    load,
    ...(limits.newCardsPerDay > 0
      ? { loadWithFewerNew: { newPerDay: fewerNew, load: project(fewerNew) } }
      : {}),
    priorityTopics: input.priorityTopics,
    ...(input.questionLimit ? { questionLimit: input.questionLimit } : {}),
  });

  const measuredAverage =
    measured.length >= MEASURED_DAYS_NEEDED
      ? measured.reduce((sum, value) => sum + value, 0) / measured.length
      : null;
  const minutes: MinutesSource =
    input.declaredMinutes !== null
      ? {
          kind: 'declared',
          minutes: input.declaredMinutes,
          measuredDays: measured.length,
          measuredAverage,
        }
      : plan.minutesSource === 'pomodoro'
        ? { kind: 'measured', days: measured.length, average: plan.minutesAvailable }
        : { kind: 'provisional', measuredDays: measured.length };

  return {
    plan,
    minutes,
    newCardsPerDay: limits.newCardsPerDay,
    cardCount: input.cards.length,
  };
}
