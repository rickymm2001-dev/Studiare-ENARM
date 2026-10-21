// Fechas de la calibración nocturna con palabras (B14). La noche de una corrida es el día de estudio de su
// corte menos uno: una corrida que empieza a las 4 con 23 de la mañana de Mérida del día 16 cuenta los
// datos hasta la noche del 15. Funciones puras, sin reloj. Las usan la tarjeta de comparación, la pantalla
// Calibración, el historial del acuerdo y la cola de distractores.
import { addDays, studyDayOf } from '@/engines/studyDay';

/** La zona de la calibración y del corte del día de estudio. Mérida no cambia de horario */
export const CALIBRATION_TIME_ZONE = 'America/Merida';

const DAY_IN_WORDS = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** 2026-10-14 se dice 14 de octubre. El mediodía en UTC evita que la zona del navegador cambie el día */
export function dayInWords(day: string): string {
  return DAY_IN_WORDS.format(new Date(`${day}T12:00:00Z`));
}

/** La noche a la que pertenece un día de estudio de corte, en AAAA-MM-DD */
export function nightOfStudyDay(studyDay: string): string {
  return addDays(studyDay, -1);
}

/** La noche de un instante, como la de una marca que creó la calibración: su día de estudio en Mérida menos uno */
export function nightOfInstant(instant: string): string | null {
  const time = Date.parse(instant);
  return Number.isNaN(time)
    ? null
    : nightOfStudyDay(studyDayOf(new Date(time), CALIBRATION_TIME_ZONE));
}
