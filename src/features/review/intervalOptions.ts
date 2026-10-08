// Opciones del intervalo máximo del repaso (D-064). none es sin tope
export const MAX_INTERVAL_OPTIONS = [
  '3',
  '5',
  '7',
  '10',
  '14',
  '21',
  '30',
  '45',
  '60',
  '90',
  '180',
  'none',
] as const;

export const toOption = (days: number | null): string => (days === null ? 'none' : String(days));
export const fromOption = (value: string): number | null =>
  value === 'none' ? null : Number(value);

/**
 * Las opciones de la lista y, si el valor guardado no está en ella, también ese valor. El perfil
 * guía guarda los días que faltan para el examen, que casi nunca coinciden con una opción fija
 */
export function maxIntervalOptions(current: string): string[] {
  if ((MAX_INTERVAL_OPTIONS as readonly string[]).includes(current))
    return [...MAX_INTERVAL_OPTIONS];
  const days = Number(current);
  const fixed = MAX_INTERVAL_OPTIONS.filter((value) => value !== 'none');
  const sorted = [...fixed, current].sort((a, b) => Number(a) - Number(b));
  return Number.isFinite(days) ? [...sorted, 'none'] : [...MAX_INTERVAL_OPTIONS];
}
