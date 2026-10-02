// Proveedor de instantáneas de los widgets (9.1). Lee la bitácora del alumno y arma lo que cada
// widget muestra, con los motores reales. Agregar un widget nuevo no toca los motores.
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { AppEvent } from '@/data/schemas/events';
import type { FsrsCardState } from '@/data/schemas/common';
import type { User, UserSettings } from '@/data/schemas/people';
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

const emptyDay = (): DaySummary => ({ cards: 0, questions: 0, focusMinutes: 0, xp: 0 });

export function buildSnapshot(input: {
  events: readonly AppEvent[];
  user: User;
  settings: UserSettings;
  now: Date;
}): Snapshot {
  const { events, user, settings, now } = input;
  const tz = user.timeZone;
  const today = studyDayOf(now, tz);
  const activity: Record<string, DaySummary> = {};
  const latestCard = new Map<string, FsrsCardState>();
  let totalXp = 0;
  let errorsToday = 0;
  for (const event of events) {
    const day = studyDayOf(new Date(event.at), event.tz);
    const entry = (activity[day] ??= emptyDay());
    switch (event.type) {
      case 'card_reviewed':
        entry.cards += 1;
        latestCard.set(event.payload.cardId, event.payload.stateAfter);
        break;
      case 'question_answered':
        entry.questions += 1;
        if (!event.payload.correct && day === today) errorsToday += 1;
        break;
      case 'pomodoro_completed':
        if (event.payload.phase === 'focus')
          entry.focusMinutes += Math.round(event.payload.actualMinutes);
        break;
      case 'xp_awarded':
        entry.xp += event.payload.amount;
        totalXp += event.payload.amount;
        break;
      default:
        break;
    }
  }
  const endOfToday = studyDayEnd(today, tz).getTime();
  let dueCards = 0;
  for (const state of latestCard.values())
    if (new Date(state.due).getTime() < endOfToday) dueCards += 1;
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
    daysToExam: user.examDate ? daysBetween(today, user.examDate) : null,
    weeklyXp,
  };
}
