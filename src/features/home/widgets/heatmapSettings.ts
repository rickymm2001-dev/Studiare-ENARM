// Ajustes del widget de heatmap (9.1)
export type HeatmapMetric = 'cards' | 'questions' | 'focusMinutes';
export interface HeatmapSettings {
  /** auto muestra desde el mes en que empezó el alumno y crece con los meses (D-066) */
  range: 'auto' | 90 | 180 | 365;
  metric: HeatmapMetric;
}

export const DEFAULT_HEATMAP: HeatmapSettings = { range: 'auto', metric: 'cards' };
