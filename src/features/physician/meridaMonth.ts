// Días en hora de Mérida para los reportes del banco (B11, 4.5 del plan de B11). Las revisiones se
// cuentan por mes de Mérida, igual que el día de estudio. Sin React ni Dexie.
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Merida',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El día YYYY-MM-DD en Mérida */
export const meridaDay = (at: Date): string => DAY_FORMAT.format(at);

/** Del primer día del mes en curso de Mérida a hoy, en YYYY-MM-DD */
export function meridaMonthToDate(at: Date): { from: string; to: string } {
  const to = meridaDay(at);
  return { from: `${to.slice(0, 8)}01`, to };
}

/** Del primer día del mes de hace n meses a hoy, en Mérida */
export function meridaMonthsBack(at: Date, months: number): { from: string; to: string } {
  const to = meridaDay(at);
  const year = Number(to.slice(0, 4));
  const month = Number(to.slice(5, 7)) - 1 - months;
  const start = new Date(Date.UTC(year, month, 1));
  return { from: start.toISOString().slice(0, 10), to };
}
