// Ajustes de cada widget de Inicio (9.1). Cada tipo con ajustes tiene su formulario y el tablero solo
// sabe cuáles widgets los tienen y qué hacer con lo que cambia.
import { topicTaxonomy } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { SelectField } from '@/ui/components/field';
import { LOAD_HORIZONS } from '../../progress/futureLoad';
import type { WidgetType } from '../layouts';
import {
  ALL_BRANCHES,
  readFutureLoadSettings,
  readWeakTopicsSettings,
  WEAK_TOPIC_COUNTS,
  type FutureLoadSettings,
  type WeakTopicsSettings,
} from './analysisSettings';
import { DEFAULT_HEATMAP, type HeatmapSettings } from './heatmapSettings';

export function WidgetSettingsForm({
  type,
  settings,
  onChange,
}: {
  type: WidgetType;
  /** Lo guardado, sin validar */
  settings: Readonly<Record<string, unknown>>;
  /** Solo los ajustes que cambiaron. El tablero los mezcla con los demás */
  onChange: (next: Record<string, string | number>) => void;
}) {
  switch (type) {
    case 'heatmap':
      return (
        <HeatmapSettingsForm
          value={{ ...DEFAULT_HEATMAP, ...(settings as Partial<HeatmapSettings>) }}
          onChange={(next) => {
            onChange({ range: next.range, metric: next.metric });
          }}
        />
      );
    case 'weak_topics':
      return (
        <WeakTopicsSettingsForm
          value={readWeakTopicsSettings(settings)}
          onChange={(next) => {
            onChange({ count: next.count, branch: next.branch });
          }}
        />
      );
    case 'future_load':
      return (
        <FutureLoadSettingsForm
          value={readFutureLoadSettings(settings)}
          onChange={(next) => {
            onChange({ days: next.days });
          }}
        />
      );
    default:
      return null;
  }
}

function HeatmapSettingsForm({
  value,
  onChange,
}: {
  value: HeatmapSettings;
  onChange: (next: HeatmapSettings) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label={t.widgets.heatmap.range}
        value={String(value.range)}
        options={[
          { value: 'auto', label: t.widgets.heatmap.auto },
          ...[90, 180, 365].map((n) => ({ value: String(n), label: t.widgets.heatmap.days(n) })),
        ]}
        onChange={(event) => {
          const raw = event.target.value;
          onChange({
            ...value,
            range: raw === 'auto' ? 'auto' : (Number(raw) as HeatmapSettings['range']),
          });
        }}
      />
      <SelectField
        label={t.widgets.heatmap.metric}
        value={value.metric}
        options={(['cards', 'questions', 'focusMinutes'] as const).map((metric) => ({
          value: metric,
          label: t.widgets.heatmap.metrics[metric],
        }))}
        onChange={(event) => {
          onChange({ ...value, metric: event.target.value as HeatmapSettings['metric'] });
        }}
      />
    </div>
  );
}

function WeakTopicsSettingsForm({
  value,
  onChange,
}: {
  value: WeakTopicsSettings;
  onChange: (next: WeakTopicsSettings) => void;
}) {
  const text = t.widgets.weakTopics.settings;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label={text.count}
        value={String(value.count)}
        options={WEAK_TOPIC_COUNTS.map((count) => ({
          value: String(count),
          label: text.countOption(count),
        }))}
        onChange={(event) => {
          // El lector descarta lo que no sea uno de los valores permitidos
          onChange(readWeakTopicsSettings({ ...value, count: Number(event.target.value) }));
        }}
      />
      <SelectField
        label={text.branch}
        value={value.branch}
        options={[
          { value: ALL_BRANCHES, label: text.allBranches },
          ...topicTaxonomy.branches.map((branch) => ({ value: branch.key, label: branch.name })),
        ]}
        onChange={(event) => {
          onChange(readWeakTopicsSettings({ ...value, branch: event.target.value }));
        }}
      />
    </div>
  );
}

function FutureLoadSettingsForm({
  value,
  onChange,
}: {
  value: FutureLoadSettings;
  onChange: (next: FutureLoadSettings) => void;
}) {
  const text = t.widgets.futureLoad.settings;
  return (
    <SelectField
      label={text.days}
      value={String(value.days)}
      options={LOAD_HORIZONS.map((days) => ({
        value: String(days),
        label: text.daysOption(days),
      }))}
      onChange={(event) => {
        onChange(readFutureLoadSettings({ days: Number(event.target.value) }));
      }}
    />
  );
}
