// Manda las preguntas falladas al repaso (7.1). La comparten la práctica, que manda cada fallo al
// momento, y el examen, que manda todos al terminar. Respeta el ajuste del alumno.
import type { DataApi } from '@/data/context';
import type { User, UserSettings } from '@/data/schemas/people';
import { queueErrorCards, type ErrorCardInput } from '@/data/usecases/errorCards';
import { t } from '@/i18n/es-MX';
import type { QuestionBundle } from '../simulator/useQuestion';
import { errorCardContent } from './errorCardContent';

export interface FailedQuestion {
  bundle: Pick<QuestionBundle, 'question' | 'options' | 'vignette'>;
  /** Opción que eligió. null si la dejó en blanco */
  chosenOptionId: string | null;
}

/** Devuelve cuántas tarjetas nuevas quedaron. 0 si el alumno apagó el ajuste */
export async function sendErrorsToReview(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  settings: Pick<UserSettings, 'errorsToReview'>,
  failed: readonly FailedQuestion[],
): Promise<number> {
  if (!settings.errorsToReview) return 0;
  const inputs: ErrorCardInput[] = [];
  for (const { bundle, chosenOptionId } of failed) {
    const content = errorCardContent(bundle, chosenOptionId);
    if (!content) continue;
    const { question } = bundle;
    inputs.push({
      questionVersionId: question.id,
      topic: question.topic,
      editorialStatus: question.editorialStatus,
      isDemo: question.isDemo,
      ...content,
    });
  }
  return queueErrorCards(api, user, inputs, {
    name: t.errorCards.deckName,
    description: t.errorCards.deckDescription,
  });
}
