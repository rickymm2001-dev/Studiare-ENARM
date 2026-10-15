// Qué tipo de fuente de preguntas toca, sin cargar las fuentes (B11, 5.1 del plan de B11). El marco de
// la app lo usa para el aviso Versión de demostración y viaja en el JavaScript inicial, así que no
// importa nada del banco de la nube. Las fuentes viven en useQuestionSource.ts, que solo cargan las
// pantallas que eligen preguntas.
import { useCloud, type CloudState } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { isFeatureEnabled } from '@/config/featureFlags';
import { questionSourceKind, type QuestionSource } from '@/data/bank/questionSource';
import { cloudConfigured } from '@/data/cloud/client';
import type { DatabaseKind } from '@/data/databases';

export type SourceKind = QuestionSource['kind'];

export function sourceKindFor(
  database: DatabaseKind,
  cloudStatus: CloudState['status'],
): SourceKind {
  return questionSourceKind({
    database,
    cloudConfigured: cloudConfigured(),
    cloudBank: isFeatureEnabled('cloudBank'),
    cloudStatus,
  });
}

/** El tipo de fuente que toca ahora en una base, fuera de React */
export function currentSourceKind(database: DatabaseKind): SourceKind {
  return sourceKindFor(database, useCloud.getState().state.status);
}

/** El tipo de fuente de la base activa. Cambia si la cuenta entra o sale de la nube */
export function useQuestionSourceKind(): SourceKind {
  const database = usePreferences((state) => state.database);
  const cloudStatus = useCloud((store) => store.state.status);
  return sourceKindFor(database, cloudStatus);
}
