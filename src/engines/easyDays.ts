/**
 * Días fáciles (D-085, fila 7).
 *
 * Qué hace. El alumno marca cada día de la semana como normal, reduced (la mitad de la carga) o
 * minimum (casi nada). Cuando el programador fija el siguiente vencimiento de una tarjeta, este
 * motor lo mueve unos días, dentro de una ventana pequeña, para esquivar los días fáciles. Solo
 * toca la fecha de vencimiento. La estabilidad y la dificultad de FSRS no se modifican.
 * Entradas. El vencimiento calculado, el instante actual, la zona horaria, los niveles por día de
 * la semana, una semilla de texto y el inicio del día del ENARM o null.
 * Salidas. El vencimiento ya movido, que es el mismo instante si no hubo que moverlo.
 * Método. Todo es determinista, sin azar, porque FSRS corre sin fuzz y todo debe reproducirse.
 *   - Sin cambio si todos los días son normal. El resultado es idéntico al de siempre
 *   - Solo intervalos de 3 días o más, medidos desde now hasta due y redondeados. Los pasos cortos
 *     de aprendizaje y Otra vez nunca se tocan (quien llama los excluye)
 *   - Ventana. Radio r según los días de intervalo d. Menos de 3 sin cambio. De 3 a 6 vale 1,
 *     de 7 a 19 vale 2, de 20 a 59 vale 3 y de 60 en adelante vale 5
 *   - Candidatos. El día objetivo, que es el día de estudio de due, y los días de objetivo menos r
 *     a objetivo más r. Siempre al menos un día después del día de estudio de now y siempre antes
 *     del día del ENARM, porque el día de estudio del examen queda excluido
 *   - Aceptabilidad de un día según su nivel. normal siempre. minimum nunca. reduced solo si
 *     stableHash(seed + '|' + AAAA-MM-DD) es par, así que deja pasar más o menos la mitad de los
 *     días según la semilla
 *   - Elección. Si el día objetivo es aceptable no se mueve. Si no, el candidato aceptable más
 *     cercano al objetivo y, con la misma distancia, el anterior o el posterior según la paridad
 *     del hash de la semilla. Así la carga de un día fácil se reparte a los dos lados y no se
 *     amontona en el día de antes. Si ningún candidato es aceptable no se mueve
 *   - Si el día objetivo ya cae en el día del ENARM o después, no se mueve. Ese vencimiento lo
 *     recorta el programador al inicio del examen y el recorte siempre manda
 *   - El nuevo vencimiento conserva la hora relativa dentro del día de estudio. nuevoDue =
 *     inicio(nuevoDía) + (due - inicio(díaObjetivo)), con studyDayStart y addDays, sin sumar
 *     milisegundos de 24 horas a ciegas. Si el día tiene otra duración por el horario de verano, se
 *     queda dentro del nuevo día. El resultado siempre es posterior a now y anterior al examen
 *   - La semilla la arma el programador (fsrs.ts) con campos que no dependen de la hora exacta de
 *     now, para que la vista previa de los botones y el repaso real den el mismo día
 *   - El hash es FNV-1a de 32 bits seguido de la mezcla final de MurmurHash3. FNV-1a solo, en su
 *     último bit, es la paridad de los bits bajos de los caracteres, y dos fechas seguidas
 *     difieren en un dígito, así que los días seguidos alternarían siempre. La mezcla final
 *     reparte cada bit de la entrada en todos los de la salida
 * Umbrales. Radios 1, 2, 3 y 5 según el intervalo y mínimo de 3 días (D-085). Tope de la ventana
 * de 5 días hacia cada lado.
 */
import { addDays, DAY_MS, studyDayEnd, studyDayOf, studyDayStart } from './studyDay';

export const EASY_DAY_LEVELS = ['normal', 'reduced', 'minimum'] as const;
export type EasyDayLevel = (typeof EASY_DAY_LEVELS)[number];
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
export type EasyDays = Readonly<Record<WeekdayKey, EasyDayLevel>>;
export const NO_EASY_DAYS: EasyDays = {
  mon: 'normal',
  tue: 'normal',
  wed: 'normal',
  thu: 'normal',
  fri: 'normal',
  sat: 'normal',
  sun: 'normal',
};

/** Intervalo mínimo en días desde el cual se mueve un vencimiento */
export const EASY_DAYS_MIN_INTERVAL = 3;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// Date.getUTCDay da 0 en domingo
const WEEKDAY_BY_UTC_DAY: readonly WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Día de la semana de un día AAAA-MM-DD. Usa el mediodía UTC para evitar corrimientos */
export function weekdayOf(day: string): WeekdayKey {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new RangeError(`Día inválido ${day}. Se espera AAAA-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const date = Number(match[3]);
  const noon = new Date(Date.UTC(year, month, date, 12));
  // Date.UTC corre las fechas imposibles (30 de febrero) al mes siguiente. Aquí se rechazan
  if (
    noon.getUTCFullYear() !== year ||
    noon.getUTCMonth() !== month ||
    noon.getUTCDate() !== date
  ) {
    throw new RangeError(`Día inválido ${day}. No existe en el calendario`);
  }
  return WEEKDAY_BY_UTC_DAY[noon.getUTCDay()] as WeekdayKey;
}

const UTF8 = new TextEncoder();

/** FNV-1a de 32 bits sobre los bytes UTF-8 del texto. Sin signo, de 0 a 2^32 - 1 */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of UTF8.encode(text)) {
    hash = Math.imul(hash ^ byte, 0x01000193);
  }
  return hash >>> 0;
}

/** Mezcla final de MurmurHash3 de 32 bits. Reparte cada bit de la entrada en toda la salida */
function mix32(value: number): number {
  let hash = value;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Hash simple, determinista y estable de un texto. FNV-1a más mezcla final, sin signo */
export function stableHash(text: string): number {
  return mix32(fnv1a32(text));
}

/** True si el alumno tiene al menos un día que no es normal. Ausente cuenta como todo normal */
export function hasEasyDays(easyDays: EasyDays | undefined): easyDays is EasyDays {
  return easyDays !== undefined && WEEKDAY_KEYS.some((key) => easyDays[key] !== 'normal');
}

/**
 * Radio de la ventana para un intervalo en días, redondeado al entero más cercano. 0 significa que
 * el vencimiento no se mueve
 */
export function easyDayRadius(intervalDays: number): number {
  const days = Math.round(intervalDays);
  if (!(days >= EASY_DAYS_MIN_INTERVAL)) return 0;
  if (days < 7) return 1;
  if (days < 20) return 2;
  if (days < 60) return 3;
  return 5;
}

/**
 * Si un día de estudio AAAA-MM-DD puede recibir repasos según su nivel. normal siempre, minimum
 * nunca y reduced solo cuando el hash de la semilla con el día cae en par
 */
export function isDayAcceptable(level: EasyDayLevel, day: string, seed: string): boolean {
  switch (level) {
    case 'normal':
      return true;
    case 'minimum':
      return false;
    case 'reduced':
      return stableHash(`${seed}|${day}`) % 2 === 0;
  }
}

export interface EasyDaysInput {
  /** Vencimiento que calculó el programador, ya con el tope y el multiplicador del botón */
  due: Date;
  now: Date;
  timeZone: string;
  easyDays: EasyDays;
  /** Semilla de texto que no depende de la hora exacta de now */
  seed: string;
  /** Inicio del día del ENARM o null si no hay fecha. Ese día y los siguientes quedan excluidos */
  deadline: Date | null;
}

/** Mismo momento relativo dentro del día de estudio, trasladado de un día a otro */
function sameTimeOnDay(due: Date, fromDay: string, toDay: string, timeZone: string): Date {
  const offset = due.getTime() - studyDayStart(fromDay, timeZone).getTime();
  const firstInstant = studyDayStart(toDay, timeZone).getTime();
  const lastInstant = studyDayEnd(toDay, timeZone).getTime() - 1;
  // El horario de verano hace días de 23 o 25 horas, y studyDayOf corta el día una hora distinto
  // de studyDayStart en el día del cambio. Se deja dentro del día de destino en ambos extremos
  return new Date(Math.min(Math.max(firstInstant + offset, firstInstant), lastInstant));
}

/**
 * Mueve un vencimiento para esquivar los días fáciles. Devuelve el mismo due si no hay nada que
 * mover. Nunca devuelve un instante en el día de estudio de now ni antes, ni en el día del ENARM
 * ni después
 */
export function applyEasyDays(input: EasyDaysInput): Date {
  const { due, now, timeZone, easyDays, seed, deadline } = input;
  if (!hasEasyDays(easyDays)) return due;
  const radius = easyDayRadius((due.getTime() - now.getTime()) / DAY_MS);
  if (radius === 0) return due;

  const target = studyDayOf(due, timeZone);
  const deadlineDay = deadline === null ? null : studyDayOf(deadline, timeZone);
  // El recorte al examen manda. Un vencimiento que ya cae en el examen o después no se negocia
  if (deadlineDay !== null && target >= deadlineDay) return due;

  const isAcceptable = (day: string) => isDayAcceptable(easyDays[weekdayOf(day)], day, seed);
  if (isAcceptable(target)) return due;

  // Los días AAAA-MM-DD se comparan bien como texto
  const earliest = addDays(studyDayOf(now, timeZone), 1);
  const isUsable = (day: string) =>
    day >= earliest && (deadlineDay === null || day < deadlineDay) && isAcceptable(day);

  // Último seguro, ya sobre el instante y no sobre el día. Con las entradas del programador no se
  // dispara, pero asegura que nunca se devuelva el pasado ni el examen si studyDayOf y
  // studyDayStart difieren una hora el día del cambio de horario. Ese candidato se descarta
  const isFuture = (moved: Date) =>
    moved.getTime() > now.getTime() && (deadline === null || moved.getTime() < deadline.getTime());

  // Con la misma distancia el desempate lo da la semilla. Si siempre ganara el día anterior, todo el
  // domingo caería en el sábado y ese día quedaría con casi el doble de carga que uno normal
  const laterFirst = stableHash(`${seed}|desempate|${target}`) % 2 === 1;
  for (let distance = 1; distance <= radius; distance += 1) {
    const sides = [addDays(target, -distance), addDays(target, distance)];
    for (const candidate of laterFirst ? sides.reverse() : sides) {
      if (!isUsable(candidate)) continue;
      const moved = sameTimeOnDay(due, target, candidate, timeZone);
      if (isFuture(moved)) return moved;
    }
  }
  return due;
}
