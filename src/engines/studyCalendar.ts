/**
 * Calendario de estudio (V4-B6, los consejos de la guía que Ricardo pasó).
 *
 * Qué hace. Arma la cuadrícula de un mes, reparte las semanas que faltan para el examen entre las
 * ramas que el alumno estudia y marca los domingos de simulador completo del final. También da el
 * archivo .ics para llevar el plan a Google Calendar o al calendario del teléfono.
 * Entradas. Hoy y la fecha del examen como AAAA-MM-DD, las ramas en el orden que el alumno quiere
 * estudiarlas y, para el .ics, los textos de cada evento.
 * Salidas. Semanas que empiezan en lunes, con su rama de la semana y su domingo de simulador, y el
 * texto del .ics.
 * Método, tomado de los consejos de la guía
 *   - Cada semana se enfoca en una sola rama, para hacer los bloques de preguntas siempre de la misma
 *     especialidad y de los mismos temas. Las ramas rotan en el orden pedido
 *   - Los simuladores de todas las especialidades solo llegan al final y solo en domingo. Son de 8 a
 *     10, uno por cada uno de los últimos domingos antes del examen, FINAL_SIMULATOR_SUNDAYS como
 *     máximo y sin tocar las semanas en que todavía hay temas por estudiar si hay pocas semanas
 *   - La primera semana empieza hoy y la última es la del examen, que no lleva simulador
 *   - Con la fecha del examen ya pasada o sin ramas no hay plan por semanas
 *   - Si el examen queda más allá de MAX_PLAN_WEEKS el plan se corta antes de llegar a él y no lleva
 *     simuladores, porque serían los últimos del recorte y no los del final real
 *   - En el .ics cada evento lleva un UID que sale de su clave lógica, el lunes de la semana, el
 *     domingo del simulador o el examen, y no de su posición. Así volver a llevar el plan al
 *     calendario actualiza los eventos en vez de duplicarlos
 * Lo que no hace. No cambia lo que le toca repasar a nadie. Es un mapa, no una cola
 */
import type { AppEvent } from '@/data/schemas/events';
import { addDays, daysBetween, studyDayOf } from './studyDay';

/** Simuladores completos del final. La guía dice de 8 a 10, aquí el tope */
export const FINAL_SIMULATOR_SUNDAYS = 10;
/** Semanas que como máximo se planean, para que una fecha lejana no llene la pantalla */
export const MAX_PLAN_WEEKS = 120;

/** Día de la semana de un AAAA-MM-DD. 0 es lunes y 6 es domingo */
export function weekdayIndex(day: string): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export interface MonthGrid {
  year: number;
  /** 1 a 12 */
  month: number;
  /** Semanas de lunes a domingo. null son los días de relleno de otro mes */
  weeks: (string | null)[][];
}

export function monthGrid(year: number, month: number): MonthGrid {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  const first = `${pad(year, 4)}-${pad(month)}-01`;
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: weekdayIndex(first) }, () => null);
  for (let date = 1; date <= length; date += 1)
    cells.push(`${pad(year, 4)}-${pad(month)}-${pad(date)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let at = 0; at < cells.length; at += 7) weeks.push(cells.slice(at, at + 7));
  return { year, month, weeks };
}

export interface StudyWeek {
  /** Lunes de la semana, o hoy en la primera */
  start: string;
  /** Domingo de la semana */
  end: string;
  /** La rama de la semana, o null sin ramas */
  branch: string | null;
  /** El domingo de simulador completo, o null */
  simulatorSunday: string | null;
  /** Número del simulador entre los del final, de 1 en adelante */
  simulatorNumber: number | null;
  examWeek: boolean;
}

export function studyWeeks(input: {
  today: string;
  examDate: string;
  branches: readonly string[];
}): StudyWeek[] {
  const { today, examDate, branches } = input;
  if (branches.length === 0 || daysBetween(today, examDate) < 0) return [];
  const weeks: StudyWeek[] = [];
  let start = today;
  while (weeks.length < MAX_PLAN_WEEKS && daysBetween(start, examDate) >= 0) {
    const end = addDays(start, 6 - weekdayIndex(start));
    weeks.push({
      start,
      end,
      branch: null,
      simulatorSunday: null,
      simulatorNumber: null,
      examWeek: daysBetween(end, examDate) <= 0,
    });
    start = addDays(end, 1);
  }
  // Los domingos de simulador son los últimos antes de la semana del examen. Si hay pocas semanas,
  // los simuladores se quedan en la mitad final y la otra mitad es de temas. Si el plan se cortó antes
  // de llegar al examen no hay de dónde contar hacia atrás, así que no hay simuladores
  const reachesExam = weeks.at(-1)?.examWeek === true;
  const candidates = reachesExam
    ? weeks.filter((week) => !week.examWeek && daysBetween(week.end, examDate) > 0)
    : [];
  const sundays = Math.min(FINAL_SIMULATOR_SUNDAYS, Math.floor(candidates.length / 2));
  const chosen = candidates.slice(candidates.length - sundays);
  chosen.forEach((week, index) => {
    week.simulatorSunday = week.end;
    week.simulatorNumber = index + 1;
  });
  weeks.forEach((week, index) => {
    week.branch = branches[index % branches.length] ?? null;
  });
  return weeks;
}

export interface CalendarEvent {
  /**
   * Clave lógica del evento para su UID en el .ics, de letras minúsculas, números y guiones. Debe ser
   * la misma cada vez que se exporta el mismo evento. Sin ella el UID sale del día y la posición
   */
  uid?: string;
  /** Día completo, AAAA-MM-DD */
  day: string;
  /** Días que dura, 1 por omisión */
  days?: number;
  title: string;
  description?: string;
}

const compactDay = (day: string) => day.replace(/-/g, '');

/** Los eventos del plan por semanas y del examen, con los textos que da quien llama */
export function planEvents(
  weeks: readonly StudyWeek[],
  examDate: string,
  labels: {
    week: (branch: string) => string;
    simulator: (number: number, total: number) => string;
    exam: string;
  },
): CalendarEvent[] {
  const total = weeks.filter((week) => week.simulatorSunday !== null).length;
  const events: CalendarEvent[] = [];
  for (const week of weeks) {
    if (week.branch !== null && !week.examWeek) {
      // La semana de temas va de lunes a domingo aunque hoy sea jueves, así su inicio y su UID no
      // cambian de un día de exportar a otro
      const monday = addDays(week.start, -weekdayIndex(week.start));
      events.push({
        uid: `week-${compactDay(monday)}`,
        day: monday,
        days: 7,
        title: labels.week(week.branch),
      });
    }
    if (week.simulatorSunday !== null && week.simulatorNumber !== null) {
      events.push({
        uid: `simulator-${compactDay(week.simulatorSunday)}`,
        day: week.simulatorSunday,
        title: labels.simulator(week.simulatorNumber, total),
      });
    }
  }
  events.push({ uid: 'exam', day: examDate, title: labels.exam });
  return events.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
}

/**
 * Quita los caracteres de control, que en un .ics pueden abrir una línea nueva o romper el archivo,
 * menos el tabulador y los saltos de línea, que se escapan después
 */
function withoutControls(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('');
}

function escapeText(value: string): string {
  return withoutControls(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n?|\n/g, '\\n');
}

/** Dobla una línea a 75 octetos, como pide el formato, sin partir un carácter de varios bytes */
function fold(line: string): string[] {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
      // Las líneas siguientes empiezan con un espacio que también cuenta
      limit = 74;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`));
}

function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** El archivo .ics de unos eventos de día completo. Termina con salto de línea CRLF */
export function icsOf(events: readonly CalendarEvent[], now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studiare//Plan de estudio//ES',
    'CALSCALE:GREGORIAN',
  ];
  events.forEach((event, index) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid ?? `${compactDay(event.day)}-${String(index)}`}@studiare`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDay(event.day)}`,
      `DTEND;VALUE=DATE:${compactDay(addDays(event.day, Math.max(1, event.days ?? 1)))}`,
      `SUMMARY:${escapeText(event.title)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return `${lines.flatMap(fold).join('\r\n')}\r\n`;
}

/*
 * Lo que el mes del Calendario rediseñado necesita además (D-150). Mover el mes, resumirlo, agrupar las
 * sesiones hechas por día de estudio, encontrar el siguiente día cargado, poner los retos de Party en
 * el día en que terminan y recorrer la rejilla con el teclado. Todo puro, sin fechas del sistema.
 */

export interface YearMonth {
  year: number;
  /** 1 a 12 */
  month: number;
}

/** El mes que queda delta meses después, con el año corregido. delta negativo retrocede */
export function shiftMonth(year: number, month: number, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** El mes de un AAAA-MM-DD */
export function yearMonthOf(day: string): YearMonth {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/** Primer y último día del mes, AAAA-MM-DD */
export function monthBounds(year: number, month: number): { first: string; last: string } {
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    first: `${pad(year, 4)}-${pad(month)}-01`,
    last: `${pad(year, 4)}-${pad(month)}-${pad(length)}`,
  };
}

/** Una sesión que terminó, de session_ended, con el día de estudio en que cayó */
export interface SessionDone {
  day: string;
  kind: 'review' | 'practice' | 'exam' | 'challenge';
  items: number;
  correct: number | null;
  durationMs: number;
  reason: 'completed' | 'abandoned';
}

/**
 * Las sesiones terminadas agrupadas por su día de estudio, en el orden en que pasaron. Las de repaso
 * también entran, quien pinta decide si las muestra, porque las tarjetas hechas ya las cuentan
 */
export function sessionsByDay(events: readonly AppEvent[]): Map<string, SessionDone[]> {
  const byDay = new Map<string, SessionDone[]>();
  for (const event of events) {
    if (event.type !== 'session_ended') continue;
    const day = studyDayOf(new Date(event.at), event.tz);
    const list = byDay.get(day) ?? [];
    list.push({
      day,
      kind: event.payload.kind,
      items: event.payload.items,
      correct: event.payload.correct,
      durationMs: event.payload.durationMs,
      reason: event.payload.reason,
    });
    byDay.set(day, list);
  }
  return byDay;
}

export interface MonthSummary {
  /** Repasos y nuevas proyectados de hoy al fin del mes, hasta donde llega la proyección */
  scheduled: number;
  /** El día del mes con más carga proyectada desde hoy, o null si no hay carga */
  busiest: { day: string; count: number } | null;
  /** Sesiones terminadas en el mes hasta hoy, sin las de repaso */
  sessionsDone: number;
  /** false cuando la proyección no alcanza el fin del mes y por eso lo programado se queda corto */
  forecastCovers: boolean;
}

/**
 * Las cifras de la tarjeta Este mes. La proyección manda en lo programado y las sesiones en lo hecho.
 * forecastEnd es el último día que la proyección alcanza, o null sin proyección
 */
export function monthSummary(input: {
  year: number;
  month: number;
  today: string;
  forecast: ReadonlyMap<string, number>;
  forecastEnd: string | null;
  sessions: ReadonlyMap<string, readonly SessionDone[]>;
}): MonthSummary {
  const { first, last } = monthBounds(input.year, input.month);
  let scheduled = 0;
  let busiest: MonthSummary['busiest'] = null;
  for (const [day, count] of input.forecast) {
    if (day < first || day > last || day < input.today || count <= 0) continue;
    scheduled += count;
    if (busiest === null || count > busiest.count) busiest = { day, count };
  }
  let sessionsDone = 0;
  for (const [day, list] of input.sessions) {
    if (day < first || day > last || day > input.today) continue;
    sessionsDone += list.filter((session) => session.kind !== 'review').length;
  }
  // Un mes ya pasado no necesita proyección. Uno que sigue la necesita hasta su último día
  const forecastCovers =
    last < input.today || (input.forecastEnd !== null && input.forecastEnd >= last);
  return { scheduled, busiest, sessionsDone, forecastCovers };
}

/** El día después de hoy con más carga proyectada. Con empate gana el más cercano. null sin carga */
export function nextBusyDay(
  forecast: ReadonlyMap<string, number>,
  today: string,
): { day: string; count: number } | null {
  let best: { day: string; count: number } | null = null;
  const days = [...forecast.keys()].sort();
  for (const day of days) {
    const count = forecast.get(day) ?? 0;
    if (day <= today || count <= 0) continue;
    if (best === null || count > best.count) best = { day, count };
  }
  return best;
}

/** Los retos agrupados por el día de estudio en que terminan, que es cuando cuentan en el mes */
export function challengesByDay<T extends { endsAt: string }>(
  challenges: readonly T[],
  timeZone: string,
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const challenge of challenges) {
    const day = studyDayOf(new Date(challenge.endsAt), timeZone);
    const list = byDay.get(day) ?? [];
    list.push(challenge);
    byDay.set(day, list);
  }
  return byDay;
}

/**
 * A qué día pasa el foco con una tecla en la rejilla del mes. Flechas un día o una semana, Inicio y
 * Fin al lunes y al domingo de la misma semana. null con cualquier otra tecla
 */
export function moveDayByKey(day: string, key: string): string | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(day, -1);
    case 'ArrowRight':
      return addDays(day, 1);
    case 'ArrowUp':
      return addDays(day, -7);
    case 'ArrowDown':
      return addDays(day, 7);
    case 'Home':
      return addDays(day, -weekdayIndex(day));
    case 'End':
      return addDays(day, 6 - weekdayIndex(day));
    default:
      return null;
  }
}
