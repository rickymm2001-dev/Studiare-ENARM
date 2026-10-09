// El vocabulario que usa la interfaz del alumno, sesgos o trampas (4.4, 7.11). Sale del acuerdo entre
// los médicos que etiquetaron los distractores. Mientras carga o no haya acuerdo medido, trampas.
import { useMemo } from 'react';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { computeAgreement } from '@/engines/agreement';
import type { Vocabulary } from '@/i18n/vocabulary';

export function useBiasVocabulary(): Vocabulary {
  const api = useDataApi();
  const labels = useLiveData(() => api.repos.biasLabels.list(), [api.repos]);
  return useMemo(
    () =>
      labels
        ? computeAgreement(
            labels.map((label) => ({
              optionId: label.optionId,
              physicianId: label.physicianId,
              tag: label.biasTag,
            })),
            DEFAULT_THRESHOLDS.bias,
          ).vocabulary
        : 'trap',
    [labels],
  );
}
