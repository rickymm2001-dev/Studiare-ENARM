/**
 * Planificador del día y de la semana (7.10).
 *
 * Qué hace. Arma el plan de hoy y de la semana con repasos, nuevas, un bloque de simulador y un
 * reto. Si la carga proyectada no cabe en el tiempo disponible, avisa y propone bajar nuevas por
 * día o subir minutos, con el efecto estimado de cada opción.
 * Entradas. Fecha del ENARM y hoy, minutos declarados y minutos reales de enfoque (Pomodoro), la
 * carga por día del motor fsrs, la carga con menos nuevas por día, los temas a reforzar del motor
 * topics y los segundos estimados por tipo.
 * Salidas. Plan de hoy, plan de la semana y avisos con sus opciones.
 * Método
 *   - Minutos disponibles. Los reales si hay al menos 3 días con Pomodoro, si no los declarados (J)
 *   - Hoy primero van los repasos, luego las nuevas, luego el simulador del tema más prioritario y
 *     al final un reto, cada uno mientras quepa
 *   - Sobrecarga si el promedio de minutos de repaso de los próximos 7 días pasa del disponible.
 *     El efecto de bajar nuevas es la diferencia de minutos promedio entre ambas proyecciones. El de
 *     subir minutos es cuántos faltan
 * Umbrales. Segundos por repaso, nueva, pregunta y reto por defecto (J).
 */
import type { DayLoad } from './fsrs';
import { daysBetween } from './studyDay';

export interface PlannerTiming {
  secondsPerReview: number;
  secondsPerNew: number;
  secondsPerQuestion: number;
  challengeMinutes: number;
}

export const DEFAULT_TIMING: PlannerTiming = {
  secondsPerReview: 15,
  secondsPerNew: 40,
  secondsPerQuestion: 90,
  challengeMinutes: 10,
};

export interface DayPlan {
  day: string;
  reviews: number;
  newCards: number;
  simulatorQuestions: number;
  /** El límite de preguntas del plan del alumno recortó el bloque de simulador de este día */
  simulatorCapped: boolean;
  /** Tema del simulador, el primero de las prioridades de topics */
  simulatorTopic: string | null;
  challenge: boolean;
  minutesPlanned: number;
  minutesAvailable: number;
}

export interface OverloadOption {
  action: 'reduce_new' | 'increase_minutes';
  /** Nuevas por día propuestas, o minutos por día propuestos */
  value: number;
  /** Minutos por día que libera o que agrega */
  effectMinutesPerDay: number;
}

export interface PlannerWarning {
  kind: 'overload';
  averageNeededMinutes: number;
  availableMinutes: number;
  options: OverloadOption[];
}

export interface PlannerOutput {
  today: DayPlan;
  week: DayPlan[];
  minutesAvailable: number;
  minutesSource: 'pomodoro' | 'declared';
  daysToExam: number | null;
  warnings: PlannerWarning[];
}

const reviewMinutes = (load: DayLoad, timing: PlannerTiming) =>
  (load.reviews * timing.secondsPerReview + load.newCards * timing.secondsPerNew) / 60;

function planDay(
  load: DayLoad,
  minutesAvailable: number,
  topic: string | null,
  timing: PlannerTiming,
  /** Tope de preguntas de simulador de este día. null es sin tope */
  questionCap: number | null,
): DayPlan {
  let remaining = minutesAvailable * 60;
  const reviews = Math.min(load.reviews, Math.floor(remaining / timing.secondsPerReview));
  remaining -= reviews * timing.secondsPerReview;
  const newCards = Math.min(
    load.newCards,
    Math.max(0, Math.floor(remaining / timing.secondsPerNew)),
  );
  remaining -= newCards * timing.secondsPerNew;
  const challenge = remaining >= timing.challengeMinutes * 60 * 2;
  if (challenge) remaining -= timing.challengeMinutes * 60;
  const fitting = Math.max(0, Math.floor(remaining / timing.secondsPerQuestion));
  const simulatorQuestions = questionCap === null ? fitting : Math.min(fitting, questionCap);
  remaining -= simulatorQuestions * timing.secondsPerQuestion;
  return {
    day: load.day,
    reviews,
    newCards,
    simulatorQuestions,
    simulatorCapped: simulatorQuestions < fitting,
    simulatorTopic: simulatorQuestions > 0 ? topic : null,
    challenge,
    minutesPlanned: (minutesAvailable * 60 - remaining) / 60,
    minutesAvailable,
  };
}

export function buildPlan(input: {
  today: string;
  examDate: string | null;
  declaredMinutes: number;
  /** Minutos de enfoque reales por día con Pomodoro, de los últimos días */
  pomodoroMinutes: readonly number[];
  /** Carga de los próximos días con la configuración actual. El primer día es hoy */
  load: readonly DayLoad[];
  /** Carga si se bajan las nuevas por día al valor propuesto */
  loadWithFewerNew?: { newPerDay: number; load: readonly DayLoad[] };
  priorityTopics: readonly string[];
  timing?: PlannerTiming;
  /**
   * Preguntas que el plan del alumno le deja contestar. Hoy es lo que le queda y los demás días el
   * límite diario completo. null es sin límite. Así el plan no propone más práctica de la permitida
   */
  questionLimit?: { today: number | null; perDay: number | null };
}): PlannerOutput {
  const timing = input.timing ?? DEFAULT_TIMING;
  const usePomodoro = input.pomodoroMinutes.length >= 3;
  const minutesAvailable = usePomodoro
    ? input.pomodoroMinutes.reduce((sum, value) => sum + value, 0) / input.pomodoroMinutes.length
    : input.declaredMinutes;
  const week = input.load
    .slice(0, 7)
    .map((load, index) =>
      planDay(
        load,
        minutesAvailable,
        input.priorityTopics[index % Math.max(input.priorityTopics.length, 1)] ?? null,
        timing,
        (index === 0 ? input.questionLimit?.today : input.questionLimit?.perDay) ?? null,
      ),
    );
  const emptyDay: DayLoad = { day: input.today, reviews: 0, newCards: 0 };
  const today =
    week[0] ??
    planDay(
      emptyDay,
      minutesAvailable,
      input.priorityTopics[0] ?? null,
      timing,
      input.questionLimit?.today ?? null,
    );

  const average = (loads: readonly DayLoad[]) => {
    const days = loads.slice(0, 7);
    return days.length === 0
      ? 0
      : days.reduce((sum, load) => sum + reviewMinutes(load, timing), 0) / days.length;
  };
  const needed = average(input.load);
  const warnings: PlannerWarning[] = [];
  if (needed > minutesAvailable) {
    const options: OverloadOption[] = [];
    if (input.loadWithFewerNew) {
      options.push({
        action: 'reduce_new',
        value: input.loadWithFewerNew.newPerDay,
        effectMinutesPerDay: needed - average(input.loadWithFewerNew.load),
      });
    }
    options.push({
      action: 'increase_minutes',
      value: Math.ceil(needed),
      effectMinutesPerDay: needed - minutesAvailable,
    });
    warnings.push({
      kind: 'overload',
      averageNeededMinutes: needed,
      availableMinutes: minutesAvailable,
      options,
    });
  }
  return {
    today,
    week,
    minutesAvailable,
    minutesSource: usePomodoro ? 'pomodoro' : 'declared',
    daysToExam: input.examDate === null ? null : daysBetween(input.today, input.examDate),
    warnings,
  };
}
