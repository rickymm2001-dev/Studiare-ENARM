// Los umbrales que el admin puede cambiar desde la pantalla 25. Son los de la sección 12 de la
// especificación, más la retención deseada. El resto de los números de configuración de los motores
// no se editan desde la interfaz. Desde B11 el doble etiquetado del 20 % ya no existe, porque cada
// revisión etiqueta a ciegas todos sus distractores (8.9 del plan de B11), así que doubleLabelShare
// sigue en el esquema por compatibilidad y ya no se muestra. Los de Inglés médico (B13) son el grupo english.
import type { Thresholds } from '@/config/thresholds';

export interface ThresholdField {
  group: keyof Thresholds;
  key: string;
  kind: 'int' | 'float';
  step: number;
  /** Sin uso: el número existe como punto de extensión, pero ningún código lo lee. Se muestra y no se cambia */
  unused?: boolean;
}

export const THRESHOLD_FIELDS: readonly ThresholdField[] = [
  { group: 'difficulty', key: 'provisionalResponses', kind: 'int', step: 1 },
  { group: 'difficulty', key: 'calibratedResponses', kind: 'int', step: 1 },
  { group: 'sampling', key: 'variantExposuresForExam', kind: 'int', step: 1 },
  { group: 'sampling', key: 'nonFunctionalRate', kind: 'float', step: 0.01 },
  { group: 'sampling', key: 'nonFunctionalExposures', kind: 'int', step: 1 },
  { group: 'bias', key: 'minTaggedErrors', kind: 'int', step: 1 },
  { group: 'bias', key: 'minKappaForBiasLanguage', kind: 'float', step: 0.05 },
  { group: 'bias', key: 'minLabeledPairs', kind: 'int', step: 1 },
  { group: 'topics', key: 'maxIntervalWidth', kind: 'float', step: 0.01 },
  { group: 'structure', key: 'minResponsesPerCategory', kind: 'int', step: 1 },
  { group: 'forgetting', key: 'findingsForPattern', kind: 'int', step: 1 },
  { group: 'forgetting', key: 'patternWindowDays', kind: 'int', step: 1 },
  // Sin uso (B14, 4.6 del plan de B14, respuesta 90): FSRS va de fábrica para todos y la calibración no
  // ajusta parámetros por alumno. Queda como punto de extensión y la pantalla lo dice
  { group: 'fsrs', key: 'optimizeAfterReviews', kind: 'int', step: 1, unused: true },
  { group: 'fsrs', key: 'desiredRetention', kind: 'float', step: 0.01 },
  // Inglés médico (B13, 1.9 del plan de B13). El formulario los junta bajo su propio título
  { group: 'english', key: 'secondsPerItem', kind: 'int', step: 5 },
  { group: 'english', key: 'examMinItems', kind: 'int', step: 1 },
  { group: 'english', key: 'practiceMinCases', kind: 'int', step: 1 },
  { group: 'english', key: 'minAnswersForStats', kind: 'int', step: 1 },
];

export const fieldId = (field: Pick<ThresholdField, 'group' | 'key'>) =>
  `${field.group}.${field.key}`;

export function readThreshold(thresholds: Thresholds, field: ThresholdField): number {
  const group = thresholds[field.group] as Record<string, number>;
  return group[field.key] ?? Number.NaN;
}
