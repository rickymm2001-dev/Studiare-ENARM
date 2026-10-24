// Las últimas sesiones del simulador para el lateral de Armar tu simulador (D-150). Salen de la
// bitácora, de los session_ended de práctica, examen y duelo. Una práctica dirigida se reconoce por el
// muestreo dirigido que dejó su session_started. Sin React ni Dexie. Nada se inventa: items y correct son
// los que registró la sesión, y una sesión sin aciertos registrados se dice sin calificar.
import type { AppEvent } from '@/data/schemas/events';

export type RecentSessionMode = 'practice' | 'targeted' | 'exam' | 'challenge';

export interface RecentSession {
  sessionId: string;
  mode: RecentSessionMode;
  /** Preguntas que contestó en la sesión */
  items: number;
  /** Aciertos, o null si la sesión cerró sin calificarse */
  correct: number | null;
  durationMs: number;
  /** Cuándo terminó, en ISO */
  endedAt: string;
}

export function recentSessions(events: readonly AppEvent[], limit = 3): RecentSession[] {
  const targeted = new Set<string>();
  for (const event of events) {
    if (event.type !== 'session_started') continue;
    if (event.payload.config.sampling === 'targeted') targeted.add(event.sessionId ?? '');
  }
  const ended: RecentSession[] = [];
  for (const event of events) {
    if (event.type !== 'session_ended' || event.payload.kind === 'review') continue;
    const kind = event.payload.kind;
    const sessionId = event.sessionId ?? event.id;
    ended.push({
      sessionId,
      mode: kind === 'practice' && targeted.has(sessionId) ? 'targeted' : kind,
      items: event.payload.items,
      correct: event.payload.correct,
      durationMs: event.payload.durationMs,
      endedAt: event.at,
    });
  }
  return ended.sort((a, b) => b.endedAt.localeCompare(a.endedAt)).slice(0, limit);
}

/** Aciertos redondeados en por ciento, o null sin calificar o sin preguntas */
export function accuracyPercent(session: Pick<RecentSession, 'items' | 'correct'>): number | null {
  if (session.correct === null || session.items === 0) return null;
  return Math.round((session.correct / session.items) * 100);
}

/** El día de una fecha en la zona del alumno, como 2026-10-24 */
function dayOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * Cuándo fue la sesión, para leerse. Hoy, Ayer, el día de la semana si fue en la última semana y, si no,
 * el día y el mes. Las palabras Hoy y Ayer las pone quien llama, que tiene los textos
 */
export function sessionDayLabel(
  endedAt: string,
  now: Date,
  timeZone: string,
  words: { today: string; yesterday: string },
): string {
  const day = dayOf(endedAt, timeZone);
  const today = dayOf(now.toISOString(), timeZone);
  if (day === today) return words.today;
  const dayMs = 24 * 60 * 60 * 1000;
  const daysAgo = Math.round(
    (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${day}T12:00:00Z`).getTime()) / dayMs,
  );
  if (daysAgo === 1) return words.yesterday;
  const date = new Date(endedAt);
  if (daysAgo > 1 && daysAgo < 7) {
    const weekday = new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'long' }).format(date);
    return weekday.charAt(0).toLocaleUpperCase('es-MX') + weekday.slice(1);
  }
  return new Intl.DateTimeFormat('es-MX', { timeZone, day: 'numeric', month: 'long' }).format(date);
}
