// Una celda de los CSV del admin (B6 de la revisión de B11). Va entre comillas y un texto que empieza
// con = + - @, tabulador o retorno lleva un apóstrofo antes, para que Excel o Sheets no lo corran como
// fórmula. Los números van tal cual. Sin React ni Dexie.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value);
  const safe = typeof value === 'string' && FORMULA_START.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
