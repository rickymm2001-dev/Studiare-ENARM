// Acciones del tutor que cambian algo (8.2). Las demás solo llevan a otra pantalla. Cada una es un
// ajuste pequeño del propio alumno, que él puede deshacer en Configuración.
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { updateProfile } from '@/data/usecases/profile';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;

/** Enciende el resaltado de negaciones en práctica y en examen */
export async function enableNegationHighlight(api: Api, user: User): Promise<User> {
  return updateProfile(api, user, {
    settings: { negationHighlightPractice: true, negationHighlightExam: true },
  });
}

/** Enfoque de 25 minutos como máximo y descansos de 5 como mínimo, para las sesiones largas */
export const SHORT_FOCUS_MINUTES = 25;
export const SHORT_BREAK_MINUTES = 5;

export async function shortenPomodoro(
  api: Api,
  user: User,
): Promise<{ user: User; focus: number; rest: number }> {
  const current = user.settings.pomodoro;
  const focus = Math.min(current.focusMinutes, SHORT_FOCUS_MINUTES);
  const rest = Math.max(current.shortBreakMinutes, SHORT_BREAK_MINUTES);
  const next = await updateProfile(api, user, {
    settings: { pomodoro: { ...current, focusMinutes: focus, shortBreakMinutes: rest } },
  });
  return { user: next, focus, rest };
}
