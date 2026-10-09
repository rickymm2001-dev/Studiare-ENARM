// Formato de cifras de las pantallas de admin.

/** Dólares. Con menos de un dólar se muestran cuatro decimales, que es donde viven las llamadas */
export function formatUsd(value: number): string {
  return (
    value
      .toLocaleString('es-MX', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: value < 1 ? 4 : 2,
        maximumFractionDigits: value < 1 ? 4 : 2,
      })
      // El espacio que pone Intl no se rompe, y así el texto no se puede buscar ni copiar igual
      .replace(/\u00a0/g, ' ')
  );
}

export const formatInt = (value: number) => value.toLocaleString('es-MX');

/** Un ID de alumno acortado. Es seudónimo y basta para distinguirlo en la bitácora */
export const shortId = (id: string | null | undefined) => (id ? id.slice(-6) : '—');

const dateTime = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Merida',
});

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
