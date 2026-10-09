// Los umbrales que el admin puede cambiar desde la pantalla 25. Son los de la sección 12 de la
// especificación, más la retención deseada. El resto de los números de configuración de los motores
// no se editan desde la interfaz.
import type { Thresholds } from '@/config/thresholds';

export interface ThresholdField {
  group: keyof Thresholds;
  key: string;
  kind: 'int' | 'float';
  step: number;
}

export const THRESHOLD_FIELDS: readonly ThresholdField[] = [
  { group: 'difficulty', key: 'provisionalResponses', kind: 'int', step: 1 },
  { group: 'difficulty', key: 'calibratedResponses', kind: 'int', step: 1 },
  { group: 'sampling', key: 'variantExposuresForExam', kind: 'int', step: 1 },
  { group: 'sampling', key: 'nonFunctionalRate', kind: 'float', step: 0.01 },
  { group: 'sampling', key: 'nonFunctionalExposures', kind: 'int', step: 1 },
  { group: 'bias', key: 'minTaggedErrors', kind: 'int', step: 1 },
  { group: 'bias', key: 'minKappaForBiasLanguage', kind: 'float', step: 0.05 },
  { group: 'bias', key: 'doubleLabelShare', kind: 'float', step: 0.05 },
  { group: 'topics', key: 'maxIntervalWidth', kind: 'float', step: 0.01 },
  { group: 'structure', key: 'minResponsesPerCategory', kind: 'int', step: 1 },
  { group: 'forgetting', key: 'findingsForPattern', kind: 'int', step: 1 },
  { group: 'forgetting', key: 'patternWindowDays', kind: 'int', step: 1 },
  { group: 'fsrs', key: 'optimizeAfterReviews', kind: 'int', step: 1 },
  { group: 'fsrs', key: 'desiredRetention', kind: 'float', step: 0.01 },
];

export const fieldId = (field: Pick<ThresholdField, 'group' | 'key'>) =>
  `${field.group}.${field.key}`;

export function readThreshold(thresholds: Thresholds, field: ThresholdField): number {
  const group = thresholds[field.group] as Record<string, number>;
  return group[field.key] ?? Number.NaN;
}
