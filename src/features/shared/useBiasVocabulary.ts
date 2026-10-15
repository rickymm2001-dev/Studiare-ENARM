// El vocabulario que usa la interfaz del alumno, sesgos o trampas (4.4, 7.11). Sale del acuerdo entre
// los médicos que etiquetaron los distractores. Con el banco de la nube (B11) lo dice el servidor con
// bias_agreement_summary, igual para todos los alumnos, y la app guarda la última respuesta. En la demo
// sale de las etiquetas locales. Mientras carga o no haya acuerdo medido, trampas.
import { useMemo } from 'react';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { computeAgreement } from '@/engines/agreement';
import type { Vocabulary } from '@/i18n/vocabulary';
import { useQuestionSourceKind } from './questionSourceKind';

export function useBiasVocabulary(): Vocabulary {
  const api = useDataApi();
  const cloud = useQuestionSourceKind() === 'cloud';
  const labels = useLiveData(
    () => (cloud ? Promise.resolve(null) : api.repos.biasLabels.list()),
    [api.repos, cloud],
  );
  const agreement = useLiveData(
    () =>
      cloud
        ? api.repos.bankState.get('agreement').then((state) => state?.summary ?? null)
        : Promise.resolve(null),
    [api.repos, cloud],
  );
  return useMemo(() => {
    if (cloud) return agreement?.vocabulary ?? 'trap';
    return labels
      ? computeAgreement(
          labels.map((label) => ({
            optionId: label.optionId,
            physicianId: label.physicianId,
            tag: label.biasTag,
          })),
          DEFAULT_THRESHOLDS.bias,
        ).vocabulary
      : 'trap';
  }, [cloud, labels, agreement]);
}
