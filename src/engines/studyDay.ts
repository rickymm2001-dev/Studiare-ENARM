/**
 * Día de estudio.
 *
 * Qué hace. Convierte un instante en el día de estudio del alumno. El día cambia a las 4 a. m. de
 * su zona horaria, America/Merida por defecto (9.4), así que estudiar a la 1 a. m. cuenta para el
 * día anterior. Lo usan la racha, la carga de repasos, los límites diarios y la tabla de Party.
 * Entradas. Un instante (Date) y la zona horaria IANA. Los días son texto AAAA-MM-DD.
 * Salidas. El día de estudio, su inicio y fin como instantes, sumas y diferencias de días.
 * Método. @date-fns/tz para la hora local. La aritmética de días se hace sobre fechas de
 * calendario en UTC, que no tienen horario de verano.
 * Umbrales. Corte a las 4 a. m. (9.4).
 */
import { TZDate } from '@date-fns/tz';

export const DAY_CUTOFF_HOUR = 4;
export const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(day: string): { year: number; month: number; date: number } {
  const match = DATE_PATTERN.exec(day);
  if (!match) throw new RangeError(`Día inválido ${day}. Se espera AAAA-MM-DD`);
  return { year: Number(match[1]), month: Number(match[2]) - 1, date: Number(match[3]) };
}

function formatDay(year: number, month: number, date: number): string {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

/** Día de estudio de un instante. Antes de las 4 a. m. locales cuenta el día anterior */
export function studyDayOf(instant: Date, timeZone: string): string {
  const local = new TZDate(instant.getTime() - DAY_CUTOFF_HOUR * 60 * 60 * 1000, timeZone);
  return formatDay(local.getFullYear(), local.getMonth(), local.getDate());
}

/** Instante en que empieza un día de estudio, a las 4 a. m. locales */
export function studyDayStart(day: string, timeZone: string): Date {
  const { year, month, date } = parseDay(day);
  return new Date(new TZDate(year, month, date, DAY_CUTOFF_HOUR, 0, 0, timeZone).getTime());
}

/** Instante en que termina un día de estudio, que es el inicio del siguiente (no incluido) */
export function studyDayEnd(day: string, timeZone: string): Date {
  return studyDayStart(addDays(day, 1), timeZone);
}

export function addDays(day: string, amount: number): string {
  const { year, month, date } = parseDay(day);
  const shifted = new Date(Date.UTC(year, month, date + amount));
  return formatDay(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

/** Días de b menos a. Positivo si b es después */
export function daysBetween(a: string, b: string): number {
  const first = parseDay(a);
  const second = parseDay(b);
  return Math.round(
    (Date.UTC(second.year, second.month, second.date) -
      Date.UTC(first.year, first.month, first.date)) /
      DAY_MS,
  );
}

/** Lunes de la semana del día dado. La tabla de Party se reinicia el lunes a las 4 a. m. (9.6) */
export function weekStartOf(day: string): string {
  const { year, month, date } = parseDay(day);
  const weekday = new Date(Date.UTC(year, month, date)).getUTCDay();
  // getUTCDay da 0 en domingo. Se lleva a lunes como primer día
  return addDays(day, -((weekday + 6) % 7));
}
