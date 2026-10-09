// Borrador de los umbrales de la pantalla 25 y sus validaciones. Aparte del formulario para poder
// probarlo sin pintar nada.
import {
  DEFAULT_THRESHOLDS,
  FACTORY_THRESHOLDS,
  mergeThresholds,
  type ThresholdsPatch,
} from '@/config/thresholds';
import { adminText } from '@/i18n/admin';
import { THRESHOLD_FIELDS, fieldId, readThreshold } from './thresholdFields';

export type ThresholdDraft = Record<string, string>;

export const initialDraft = (): ThresholdDraft =>
  Object.fromEntries(
    THRESHOLD_FIELDS.map((field) => [
      fieldId(field),
      String(readThreshold(DEFAULT_THRESHOLDS, field)),
    ]),
  );

/** Lo que cambió contra los valores de fábrica, listo para guardar o para validar */
export function patchFromDraft(draft: ThresholdDraft): ThresholdsPatch {
  const patch: Record<string, Record<string, number>> = {};
  for (const field of THRESHOLD_FIELDS) {
    const value = Number(draft[fieldId(field)]);
    if (readThreshold(FACTORY_THRESHOLDS, field) === value) continue;
    patch[field.group] = { ...patch[field.group], [field.key]: value };
  }
  return patch;
}

/** El error de cada campo a partir de las reglas de los umbrales, o vacío si el conjunto es válido */
export function validateDraft(draft: ThresholdDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of THRESHOLD_FIELDS) {
    const raw = draft[fieldId(field)] ?? '';
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value)) {
      errors[fieldId(field)] = adminText.adminConfig.thresholdsForm.notNumber;
    } else if (field.kind === 'int' && !Number.isInteger(value)) {
      errors[fieldId(field)] = adminText.adminConfig.thresholdsForm.notInteger;
    }
  }
  if (Object.keys(errors).length > 0) return errors;
  const merged = mergeThresholds(FACTORY_THRESHOLDS, patchFromDraft(draft));
  if (!merged.ok) {
    for (const issue of merged.issues) {
      const [path = ''] = issue.split(':');
      errors[path] = issue.slice(path.length + 1).trim();
    }
  }
  return errors;
}
