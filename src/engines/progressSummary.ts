// Resumen de Progreso (D-150). Las cifras de arriba de la pantalla, aciertos y preguntas de los
// últimos 30 días contra los 30 anteriores, con sus series chicas para las gráficas de las tarjetas,
// la actividad de los últimos días para la racha, los aciertos por rama en una ventana de días para
// el radar y las últimas sesiones para la tabla. Funciones puras sobre la bitácora, sin React ni
// Dexie. Cada cifra dice cuánto necesita antes de mostrarse (4.3) y nada se inventa.
import type { AppEvent } from '@/data/schemas/events';
import { addDays, studyDayOf } from './studyDay';

/** Respuestas mínimas para que un porcentaje de aciertos diga algo, como en Conócete */
export const SUMMARY_THRESHOLDS = { answers: 20 } as const;

/** Días que cubre cada ventana y cuántos días llevan las series chicas */
export const SUMMARY_WINDOW = {
  days: 30,
  trendDays: 7,
  questionDays: 6,
  activityDays: 12,
} as const;

export interface WindowTally {
  answered: number;
  correct: number;
}

export interface ProgressSummary {
  /** Aciertos de los últimos 30 días y de los 30 anteriores, con el porcentaje de cada día reciente que tuvo respuestas */
  accuracy: { current: WindowTally; previous: WindowTally; trend: number[] };
  /** Preguntas contestadas en las dos ventanas y las de cada uno de los últimos 6 días, de la más vieja a hoy */
  questions: { current: number; previous: number; byDay: number[] };
  /** Tarjetas más preguntas de cada uno de los últimos 12 días, del más viejo a hoy */
  activity: number[];
}

const emptyTally = (): WindowTally => ({ answered: 0, correct: 0 });

/** Porcentaje redondeado de un conteo. null sin respuestas */
export function percentOf(tally: WindowTally): number | null {
  return tally.answered > 0 ? Math.round((tally.correct / tally.answered) * 100) : null;
}

/**
 * Cambio en puntos porcentuales entre dos ventanas. null si alguna no llega al mínimo, porque con
 * pocas respuestas la diferencia se mueve demasiado para decirla
 */
export function accuracyDelta(
  current: WindowTally,
  previous: WindowTally,
  min: number = SUMMARY_THRESHOLDS.answers,
): number | null {
  if (current.answered < min || previous.answered < min) return null;
  const now = percentOf(current);
  const before = percentOf(previous);
  return now === null || before === null ? null : now - before;
}

/** Cambio relativo en por ciento entre dos conteos. null sin conteo anterior */
export function relativeDelta(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
}

export function progressSummary(input: {
  events: readonly AppEvent[];
  timeZone: string;
  today: string;
}): ProgressSummary {
  const { events, timeZone, today } = input;
  const currentStart = addDays(today, -(SUMMARY_WINDOW.days - 1));
  const previousStart = addDays(today, -(SUMMARY_WINDOW.days * 2 - 1));
  const current = emptyTally();
  const previous = emptyTally();
  const byDay = new Map<string, { answered: number; correct: number; cards: number }>();
  for (const event of events) {
    if (event.type !== 'question_answered' && event.type !== 'card_reviewed') continue;
    const day = studyDayOf(new Date(event.at), timeZone);
    if (day > today || day < previousStart) continue;
    const entry = byDay.get(day) ?? { answered: 0, correct: 0, cards: 0 };
    if (event.type === 'card_reviewed') {
      entry.cards += 1;
    } else {
      entry.answered += 1;
      if (event.payload.correct) entry.correct += 1;
      const tally = day >= currentStart ? current : previous;
      tally.answered += 1;
      if (event.payload.correct) tally.correct += 1;
    }
    byDay.set(day, entry);
  }
  const lastDays = (count: number) =>
    Array.from({ length: count }, (_, index) => addDays(today, index - (count - 1)));
  const trend: number[] = [];
  for (const day of lastDays(SUMMARY_WINDOW.trendDays)) {
    const entry = byDay.get(day);
    const percent = entry ? percentOf(entry) : null;
    if (percent !== null) trend.push(percent);
  }
  const questionsByDay = lastDays(SUMMARY_WINDOW.questionDays).map(
    (day) => byDay.get(day)?.answered ?? 0,
  );
  const activity = lastDays(SUMMARY_WINDOW.activityDays).map((day) => {
    const entry = byDay.get(day);
    return entry ? entry.answered + entry.cards : 0;
  });
  return {
    accuracy: { current, previous, trend },
    questions: {
      current: current.answered,
      previous: previous.answered,
      byDay: questionsByDay,
    },
    activity,
  };
}

/**
 * Aciertos por rama en una ventana de días hacia atrás, de from a to días antes de hoy, los dos
 * incluidos. La rama de cada respuesta la dice quien llama, con la versión de la pregunta, y una
 * pregunta que ya no está en el banco no cuenta
 */
export function branchAccuracyInWindow(input: {
  events: readonly AppEvent[];
  branchOf: (questionVersionId: string) => string | undefined;
  timeZone: string;
  today: string;
  /** Días antes de hoy donde empieza la ventana, el más lejano */
  from: number;
  /** Días antes de hoy donde termina, el más cercano. 0 es hoy */
  to: number;
}): Map<string, WindowTally> {
  const { events, branchOf, timeZone, today, from, to } = input;
  const start = addDays(today, -from);
  const end = addDays(today, -to);
  const tallies = new Map<string, WindowTally>();
  for (const event of events) {
    if (event.type !== 'question_answered') continue;
    const day = studyDayOf(new Date(event.at), timeZone);
    if (day < start || day > end) continue;
    const branch = branchOf(event.payload.questionVersionId);
    if (!branch) continue;
    const tally = tallies.get(branch) ?? emptyTally();
    tally.answered += 1;
    if (event.payload.correct) tally.correct += 1;
    tallies.set(branch, tally);
  }
  return tallies;
}

export type SessionKind = 'review' | 'practice' | 'exam' | 'challenge';

export type SessionRowState = 'completed' | 'abandoned' | 'open';

export interface SessionRow {
  id: string;
  kind: SessionKind;
  /** Cuándo empezó, o cuándo terminó si su inicio no quedó en la bitácora */
  startedAt: string;
  /** Reactivos o tarjetas de la sesión. null mientras no termina */
  items: number | null;
  /** Correctas. null en un repaso de tarjetas o mientras no termina */
  correct: number | null;
  state: SessionRowState;
}

/**
 * Las últimas sesiones del alumno, de la más reciente a la más vieja. Una sesión que empezó y no
 * dejó su cierre queda como abierta. Una que cerró sin inicio en la bitácora cuenta desde su cierre
 */
export function recentSessions(input: {
  events: readonly AppEvent[];
  limit?: number;
}): SessionRow[] {
  const { events, limit = 6 } = input;
  const rows = new Map<string, SessionRow>();
  for (const event of events) {
    if (!event.sessionId) continue;
    if (event.type === 'session_started') {
      const existing = rows.get(event.sessionId);
      if (existing) {
        existing.startedAt = event.at;
        existing.kind = event.payload.kind;
      } else {
        rows.set(event.sessionId, {
          id: event.sessionId,
          kind: event.payload.kind,
          startedAt: event.at,
          items: null,
          correct: null,
          state: 'open',
        });
      }
    } else if (event.type === 'session_ended') {
      const existing = rows.get(event.sessionId);
      const row: SessionRow = existing ?? {
        id: event.sessionId,
        kind: event.payload.kind,
        startedAt: event.at,
        items: null,
        correct: null,
        state: 'open',
      };
      row.items = event.payload.items;
      row.correct = event.payload.correct;
      row.state = event.payload.reason === 'completed' ? 'completed' : 'abandoned';
      rows.set(event.sessionId, row);
    }
  }
  return [...rows.values()]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
    .slice(0, limit);
}
