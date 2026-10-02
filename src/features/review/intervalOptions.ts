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
