// Textos cortos de cada tarjeta de Buscar tarjetas, para nombrar sus botones y mostrar sus fechas.
import type { CardSearchRow } from '@/engines/cardSearch';
import { t } from '@/i18n/es-MX';

/** Fecha corta en la zona del alumno, como 12 oct 2026 */
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
}

/** El texto de la tarjeta, o un aviso si no tiene, para nombrarla */
export function frontOf(row: Pick<CardSearchRow, 'front'>): string {
  return row.front === '' ? t.cardSearch.emptyFront : row.front;
}

/** Las primeras letras del frente, para nombrar botones y casillas sin leer la tarjeta entera */
export function shortFront(row: Pick<CardSearchRow, 'front'>): string {
  const text = frontOf(row);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}
