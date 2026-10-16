// Los números de model_settings que el admin cambia en Plataforma (B14, 1.5 y 7.2 del plan de B14), con su
// rango, y el borrador de la sección Modelo del alumno y calibración. Aparte del formulario para probarlo sin
// pintar nada. Los rangos son los de src/config/modelSettings.ts, que es el esquema con el que la app lee
// los ajustes, y una prueba revisa que coincidan. minGroupSize y populationMinStudents no bajan de 30:
// son la promesa de privacidad de la comparación, y la base lo hace cumplir también.
import {
  FACTORY_MODEL_SETTINGS,
  MIN_PRIVACY_GROUP,
  type ModelSettings,
} from '@/config/modelSettings';
import type { ModelSettingsPatch } from '@/data/cloud/calibrationAdmin';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';

export type ModelFieldGroup = 'difficulty' | 'comparison' | 'population' | 'adaptive' | 'fatigue';

export interface ModelField {
  /** La ruta dentro de thresholds. fatigue.minStudents baja un nivel */
  id: string;
  group: ModelFieldGroup;
  kind: 'int' | 'float';
  step: number;
  min: number;
  max: number;
  /** Nunca por debajo de 30, aunque el rango lo permitiera */
  privacyFloor?: boolean;
}

export const MODEL_FIELDS: readonly ModelField[] = [
  { id: 'provisionalMaxSe', group: 'difficulty', kind: 'float', step: 0.05, min: 0.05, max: 2 },
  { id: 'calibratedMaxSe', group: 'difficulty', kind: 'float', step: 0.05, min: 0.05, max: 2 },
  { id: 'maxDailyFirstAttempts', group: 'difficulty', kind: 'int', step: 10, min: 10, max: 5000 },
  {
    id: 'minGroupSize',
    group: 'comparison',
    kind: 'int',
    step: 1,
    min: MIN_PRIVACY_GROUP,
    max: 100_000,
    privacyFloor: true,
  },
  { id: 'comparisonWindowDays', group: 'comparison', kind: 'int', step: 1, min: 7, max: 90 },
  { id: 'minBranchAnswers', group: 'comparison', kind: 'int', step: 1, min: 1, max: 500 },
  {
    id: 'populationMinStudents',
    group: 'population',
    kind: 'int',
    step: 1,
    min: MIN_PRIVACY_GROUP,
    max: 100_000,
    privacyFloor: true,
  },
  { id: 'adaptiveMinItems', group: 'adaptive', kind: 'int', step: 1, min: 5, max: 5000 },
  { id: 'adaptiveTargetOffset', group: 'adaptive', kind: 'float', step: 0.1, min: -2, max: 2 },
  { id: 'adaptiveExploreShare', group: 'adaptive', kind: 'float', step: 0.05, min: 0, max: 0.5 },
  { id: 'fatigue.minStudents', group: 'fatigue', kind: 'int', step: 1, min: 2, max: 100_000 },
  { id: 'fatigue.minSplitHalfKappa', group: 'fatigue', kind: 'float', step: 0.05, min: -1, max: 1 },
  { id: 'fatigue.minMotiveReports', group: 'fatigue', kind: 'int', step: 1, min: 2, max: 100_000 },
];

export const MODEL_GROUPS: readonly ModelFieldGroup[] = [
  'difficulty',
  'comparison',
  'population',
  'adaptive',
  'fatigue',
];

/** El valor de un campo en los ajustes que la app entiende */
export function thresholdValue(settings: ModelSettings, id: string): number {
  const [first = '', second] = id.split('.');
  const group = settings.thresholds as unknown as Record<string, unknown>;
  const node =
    second === undefined ? group[first] : (group[first] as Record<string, unknown>)[second];
  return typeof node === 'number' ? node : Number.NaN;
}

export interface ModelDraft {
  comparison: boolean;
  adaptive: boolean;
  /** Lo que escribió el admin en cada campo, tal cual, por id */
  values: Record<string, string>;
}

export function draftFrom(settings: ModelSettings): ModelDraft {
  return {
    comparison: settings.features.comparison,
    adaptive: settings.features.adaptive,
    values: Object.fromEntries(
      MODEL_FIELDS.map((field) => [field.id, String(thresholdValue(settings, field.id))]),
    ),
  };
}

/** El borrador con los valores de fábrica, para volver a ellos */
export const factoryDraft = (): ModelDraft => draftFrom(FACTORY_MODEL_SETTINGS);

/** El error de cada campo, o vacío si el borrador se puede guardar. calibratedMaxSe también dice si rompe el orden */
export function validateModelDraft(draft: ModelDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const messages = calibrationAdminTexts.settings.errors;
  for (const field of MODEL_FIELDS) {
    const raw = draft.values[field.id] ?? '';
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value)) errors[field.id] = messages.notNumber;
    else if (field.kind === 'int' && !Number.isInteger(value))
      errors[field.id] = messages.notInteger;
    else if (field.privacyFloor === true && value < MIN_PRIVACY_GROUP)
      errors[field.id] = messages.floor;
    else if (value < field.min || value > field.max) {
      errors[field.id] = messages.range(field.min, field.max);
    }
  }
  const provisional = Number(draft.values.provisionalMaxSe);
  const calibrated = Number(draft.values.calibratedMaxSe);
  if (
    errors.provisionalMaxSe === undefined &&
    errors.calibratedMaxSe === undefined &&
    calibrated >= provisional
  ) {
    errors.calibratedMaxSe = messages.seOrder;
  }
  return errors;
}

/** Solo lo que cambió contra lo guardado, listo para guardar. Vacío si no cambió nada */
export function patchFromDraft(draft: ModelDraft, saved: ModelSettings): ModelSettingsPatch {
  const thresholds: Record<string, unknown> = {};
  const fatigue: Record<string, number> = {};
  for (const field of MODEL_FIELDS) {
    const value = Number(draft.values[field.id]);
    if (value === thresholdValue(saved, field.id)) continue;
    if (field.id.startsWith('fatigue.')) fatigue[field.id.slice('fatigue.'.length)] = value;
    else thresholds[field.id] = value;
  }
  const features: Partial<ModelSettings['features']> = {};
  if (draft.comparison !== saved.features.comparison) features.comparison = draft.comparison;
  if (draft.adaptive !== saved.features.adaptive) features.adaptive = draft.adaptive;
  const patch: ModelSettingsPatch = {};
  if (Object.keys(features).length > 0) patch.features = features;
  if (Object.keys(thresholds).length > 0 || Object.keys(fatigue).length > 0) {
    patch.thresholds = {
      ...thresholds,
      ...(Object.keys(fatigue).length > 0 ? { fatigue } : {}),
    };
  }
  return patch;
}

/** Los valores de fábrica de todo lo que edita este formulario, para volver a ellos de un solo paso */
export function factoryPatch(): ModelSettingsPatch {
  const { thresholds, features } = FACTORY_MODEL_SETTINGS;
  return {
    features: { ...features },
    thresholds: { ...thresholds, fatigue: { ...thresholds.fatigue } },
  };
}
