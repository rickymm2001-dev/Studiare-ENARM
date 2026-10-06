// Cómo se dice la carga futura en texto. Lo usan la tarjeta de Progreso y el widget de Inicio, así
// las dos dicen las mismas cifras y las mismas fechas.
import { t } from '@/i18n/es-MX';
import type { FutureLoad } from './futureLoad';

const dayFormat = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** AAAA-MM-DD a 6 oct. El día es de calendario, así que se formatea en UTC para que no se corra */
export const formatDay = (day: string) => dayFormat.format(new Date(`${day}T12:00:00Z`));

/** Las cifras que acompañan a la gráfica, en texto, para la tarjeta y para el widget */
export function loadSummary(load: FutureLoad) {
  const text = t.progress.futureLoad;
  const peakText = load.peak
    ? text.peakValue(formatDay(load.peak.day), load.peak.reviews + load.peak.newCards)
    : '—';
  const average = Math.round(load.averageReviews);
  return {
    peakText,
    average,
    chartLabel: load.peak
      ? text.chart(load.horizon, average, peakText)
      : text.chartEmpty(load.horizon),
  };
}
