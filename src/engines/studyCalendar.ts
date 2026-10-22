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
 * Lo que no hace. No cambia lo que le toca repasar a nadie. Es un mapa, no una cola
 */
import { addDays, daysBetween } from './studyDay';

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
  // los simuladores se quedan en la mitad final y la otra mitad es de temas
  const candidates = weeks.filter((week) => !week.examWeek && daysBetween(week.end, examDate) > 0);
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
  /** Día completo, AAAA-MM-DD */
  day: string;
  /** Días que dura, 1 por omisión */
  days?: number;
  title: string;
  description?: string;
}

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
      events.push({
        day: week.start,
        days: daysBetween(week.start, week.end) + 1,
        title: labels.week(week.branch),
      });
    }
    if (week.simulatorSunday !== null && week.simulatorNumber !== null) {
      events.push({
        day: week.simulatorSunday,
        title: labels.simulator(week.simulatorNumber, total),
      });
    }
  }
  events.push({ day: examDate, title: labels.exam });
  return events.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
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

const compactDay = (day: string) => day.replace(/-/g, '');

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
      `UID:${compactDay(event.day)}-${String(index)}@studiare`,
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
