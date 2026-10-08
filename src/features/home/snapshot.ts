// Proveedor de instantáneas de los widgets (9.1). Lee la bitácora del alumno y arma lo que cada
// widget muestra, con los motores reales. Agregar un widget nuevo no toca los motores.
import { examDateFor } from '@/config/exam';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { AppEvent } from '@/data/schemas/events';
import type { FsrsCardState } from '@/data/schemas/common';
import type { User, UserSettings } from '@/data/schemas/people';
import { suspendedCardIds } from '@/engines/suspension';
import { computeStreak, type DayActivity, type StreakState } from '@/engines/streak';
import { addDays, daysBetween, studyDayEnd, studyDayOf } from '@/engines/studyDay';
import { levelFor, type LevelInfo } from '@/engines/xp';

export interface DaySummary extends DayActivity {
  xp: number;
}

export interface Snapshot {
  today: string;
  activity: Record<string, DaySummary>;
  streak: StreakState;
  totalXp: number;
  level: LevelInfo;
  todayActivity: DaySummary;
  goal: UserSettings['dailyGoal'];
  /** Tarjetas cuyo último vencimiento ya llegó */
  dueCards: number;
  /** Errores de opción múltiple de hoy */
  errorsToday: number;
  daysToExam: number | null;
  /** XP de la semana en curso, desde el lunes a las 4 a. m. (9.6) */
  weeklyXp: number;
}

function addMinutes(map: Map<string, number>, day: string, minutes: number) {
  map.set(day, (map.get(day) ?? 0) + minutes);
}

const emptyDay = (): DaySummary => ({ cards: 0, questions: 0, focusMinutes: 0, xp: 0 });

export function buildSnapshot(input: {
  events: readonly AppEvent[];
  user: User;
  settings: UserSettings;
  now: Date;
  /**
   * Tarjetas vivas de los mazos que sigue el alumno. Si se pasa, solo ellas cuentan como por
   * repasar, igual que en Repasar. Sin ella cuentan todas las que tienen repasos
   */
  activeCardIds?: ReadonlySet<string>;
}): Snapshot {
  const { events, user, settings, now, activeCardIds } = input;
  const tz = user.timeZone;
  const today = studyDayOf(now, tz);
  const activity: Record<string, DaySummary> = {};
  const latestCard = new Map<string, FsrsCardState>();
  let totalXp = 0;
  let errorsToday = 0;
  // Minutos de estudio del día. Cuenta el tiempo activo de las sesiones y los enfoques del Pomodoro,
  // y se queda con el mayor para no contar dos veces el mismo rato (D-063)
  const sessions = new Map<string, number>();
  const pomodoro = new Map<string, number>();
  for (const event of events) {
    const day = studyDayOf(new Date(event.at), event.tz);
    const entry = (activity[day] ??= emptyDay());
    switch (event.type) {
      case 'card_reviewed':
        entry.cards += 1;
        latestCard.set(event.payload.cardId, event.payload.stateAfter);
        break;
      case 'cards_rescheduled':
        // Solo cambia el vencimiento, igual que en latestCardStates
        for (const moved of event.payload.cards) {
          const state = latestCard.get(moved.cardId);
          if (state) latestCard.set(moved.cardId, { ...state, due: moved.to });
        }
        break;
      case 'question_answered':
        entry.questions += 1;
        if (!event.payload.correct && day === today) errorsToday += 1;
        break;
      case 'pomodoro_completed':
        if (event.payload.phase === 'focus') addMinutes(pomodoro, day, event.payload.actualMinutes);
        break;
      case 'session_ended':
        addMinutes(sessions, day, event.payload.durationMs / 60000);
        break;
      case 'xp_awarded':
        entry.xp += event.payload.amount;
        totalXp += event.payload.amount;
        break;
      default:
        break;
    }
  }
  for (const [day, entry] of Object.entries(activity)) {
    entry.focusMinutes = Math.round(Math.max(sessions.get(day) ?? 0, pomodoro.get(day) ?? 0));
  }
  const endOfToday = studyDayEnd(today, tz).getTime();
  // Una tarjeta suspendida no toca hoy, y tampoco la borrada o la de un mazo que ya no se sigue
  const suspended = suspendedCardIds(events);
  let dueCards = 0;
  for (const [cardId, state] of latestCard) {
    if (suspended.has(cardId) || (activeCardIds && !activeCardIds.has(cardId))) continue;
    if (new Date(state.due).getTime() < endOfToday) dueCards += 1;
  }
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  let weeklyXp = 0;
  for (const [day, summary] of Object.entries(activity)) {
    if (day >= monday && day <= today) weeklyXp += summary.xp;
  }
  return {
    today,
    activity,
    streak: computeStreak({
      activity,
      goal: settings.dailyGoal,
      today,
      thresholds: DEFAULT_THRESHOLDS.streak,
    }),
    totalXp,
    level: levelFor(totalXp),
    todayActivity: activity[today] ?? emptyDay(),
    goal: settings.dailyGoal,
    dueCards,
    errorsToday,
    daysToExam: daysBetween(today, examDateFor(user)),
    weeklyXp,
  };
}
