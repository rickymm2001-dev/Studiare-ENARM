// Ajustes del widget de heatmap (9.1)
export type HeatmapMetric = 'cards' | 'questions' | 'focusMinutes';
export interface HeatmapSettings {
  range: 90 | 180 | 365;
  metric: HeatmapMetric;
}

export const DEFAULT_HEATMAP: HeatmapSettings = { range: 90, metric: 'cards' };
