// Revisión médica de los textos base de los consejos por sesgo (8.5, pantalla 20). Cada texto es un
// borrador hasta que un médico lo aprueba, lo edita o lo rechaza. La decisión vive en un artefacto
// sin alumno por cada consejo. Lo aprobado o editado sale en el Tutor sin la marca de borrador, y lo
// rechazado no se muestra.
import { z } from 'zod';
import type { AiArtifact } from '@/data/schemas/activity';
import { stableUlid } from '@/demo/stableId';

export const TIP_MIN_CHARS = 20;
export const TIP_MAX_CHARS = 500;
const ID_TIME = Date.UTC(2026, 0, 1);

/** Un artefacto por consejo. Decidir otra vez lo reemplaza */
export const tipReviewId = (biasKey: string) => stableUlid(`bias-tip-review|${biasKey}`, ID_TIME);

export const TipReviewContentSchema = z.strictObject({
  biasKey: z.string().min(1).max(60),
  /** El texto que quedó después de la revisión */
  tip: z.string().trim().min(TIP_MIN_CHARS).max(TIP_MAX_CHARS),
  /** El texto base que se revisó */
  baseTip: z.string().min(1).max(TIP_MAX_CHARS),
});
export type TipReviewContent = z.infer<typeof TipReviewContentSchema>;

export interface TipReview {
  biasKey: string;
  status: AiArtifact['status'];
  tip: string;
}

/** Las revisiones guardadas, por clave de sesgo. Solo cuentan las que no son de un alumno */
export function tipReviewsFrom(artifacts: readonly AiArtifact[]): Map<string, TipReview> {
  const reviews = new Map<string, TipReview>();
  for (const artifact of artifacts) {
    if (artifact.kind !== 'bias_tip' || artifact.userId !== null) continue;
    const content = TipReviewContentSchema.safeParse(artifact.content);
    if (!content.success) continue;
    reviews.set(content.data.biasKey, {
      biasKey: content.data.biasKey,
      status: artifact.status,
      tip: content.data.tip,
    });
  }
  return reviews;
}

/** Aprobado o editado cambia el texto y quita la marca. Rechazado se quita. Lo demás sigue borrador */
export function applyTipReviews<T extends { tag: string; tip: string }>(
  tips: readonly T[],
  reviews: ReadonlyMap<string, TipReview>,
): (T & { reviewed: boolean })[] {
  const result: (T & { reviewed: boolean })[] = [];
  for (const tip of tips) {
    const review = reviews.get(tip.tag);
    if (review?.status === 'rejected') continue;
    const decided = review?.status === 'approved' || review?.status === 'edited';
    result.push({ ...tip, tip: decided ? review.tip : tip.tip, reviewed: decided });
  }
  return result;
}
