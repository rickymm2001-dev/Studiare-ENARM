// Días fáciles (D-085, fila 7). El alumno marca qué días de la semana quiere con menos repasos. Este
// archivo guarda los tipos y las constantes. El cálculo vive en applyEasyDays, abajo, y lo usa
// scheduleReview de fsrs.ts al fijar el siguiente vencimiento de una tarjeta.

/** Qué tanta carga acepta un día. normal sin cambios, reduced la mitad y minimum casi nada */
export const EASY_DAY_LEVELS = ['normal', 'reduced', 'minimum'] as const;
export type EasyDayLevel = (typeof EASY_DAY_LEVELS)[number];

/** Días de la semana de lunes a domingo, en el orden en que se muestran */
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
