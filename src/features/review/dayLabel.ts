// Un día de estudio escrito para leerse, por ejemplo mié 9. Hoy se escribe Hoy.
import { t } from '@/i18n/es-MX';

export function dayLabel(day: string, today: string): string {
  if (day === today) return t.overdue.today;
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}
