// Acomodos del tablero de Inicio (9.1). Tres predefinidos y uno personalizado que se guarda.
import type { WidgetLayout } from '@/data/schemas/activity';
import { newId } from '@/data/ids';

export type WidgetType = WidgetLayout['widgets'][number]['type'];
export type Preset = WidgetLayout['preset'];

export const PRESETS: Record<Exclude<Preset, 'custom'>, WidgetType[]> = {
  essential: ['today', 'streak', 'daily_goal', 'level_xp', 'heatmap'],
  analytic: ['today', 'heatmap', 'weak_topics', 'bias_pattern', 'future_load'],
  competitive: ['level_xp', 'streak', 'party_challenge', 'daily_goal', 'heatmap'],
};

// El Pomodoro vive en Repasar (D-062) y la cuenta regresiva al ENARM se quitó (D-065)
export const ALL_WIDGETS: WidgetType[] = [
  'today',
  'streak',
  'daily_goal',
  'level_xp',
  'heatmap',
  'weak_topics',
  'bias_pattern',
  'future_load',
  'party_challenge',
  'latest_hypothesis',
];

export function layoutFromPreset(userId: string, preset: Exclude<Preset, 'custom'>): WidgetLayout {
  return {
    userId,
    preset,
    widgets: PRESETS[preset].map((type) => ({ id: newId(), type, settings: {} })),
    updatedAt: new Date().toISOString(),
  };
}

export function moveWidget(layout: WidgetLayout, id: string, delta: -1 | 1): WidgetLayout {
  const widgets = [...layout.widgets];
  const index = widgets.findIndex((widget) => widget.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= widgets.length) return layout;
  [widgets[index], widgets[target]] = [
    widgets[target] as (typeof widgets)[number],
    widgets[index] as (typeof widgets)[number],
  ];
  return { ...layout, preset: 'custom', widgets, updatedAt: new Date().toISOString() };
}

export function removeWidget(layout: WidgetLayout, id: string): WidgetLayout {
  return {
    ...layout,
    preset: 'custom',
    widgets: layout.widgets.filter((widget) => widget.id !== id),
    updatedAt: new Date().toISOString(),
  };
}

export function addWidget(layout: WidgetLayout, type: WidgetType): WidgetLayout {
  return {
    ...layout,
    preset: 'custom',
    widgets: [...layout.widgets, { id: newId(), type, settings: {} }],
    updatedAt: new Date().toISOString(),
  };
}

export function updateWidgetSettings(
  layout: WidgetLayout,
  id: string,
  settings: WidgetLayout['widgets'][number]['settings'],
): WidgetLayout {
  return {
    ...layout,
    widgets: layout.widgets.map((widget) =>
      widget.id === id ? { ...widget, settings: { ...widget.settings, ...settings } } : widget,
    ),
    updatedAt: new Date().toISOString(),
  };
}
