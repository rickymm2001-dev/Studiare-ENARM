// La tarjeta de una pregunta armada con el texto del banco, sin IA (B5, comentario 1). Al frente va
// el caso en corto y la pregunta, y atrás la respuesta correcta, la explicación y la referencia. No
// escribe medicina nueva. Todo sale del banco tal cual, recortado si no cabe, y solo las etiquetas
// son de la interfaz. El alumno la puede cambiar antes de guardarla.
import { FIELD_MAX, type NoteDraft } from '@/data/usecases/manualDecks';
import { t } from '@/i18n/es-MX';
import type { QuestionBundle } from '../simulator/useQuestion';

/** Largo del caso en corto. Unas dos o tres oraciones */
export const CASE_SHORT_MAX = 320;

const ELLIPSIS = '…';

/** Corta en el último espacio antes del máximo y avisa con puntos suspensivos que hay más */
function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = text.slice(0, Math.max(0, max - ELLIPSIS.length));
  const space = room.lastIndexOf(' ');
  return `${(space > room.length / 2 ? room.slice(0, space) : room).trimEnd()}${ELLIPSIS}`;
}

/**
 * El caso en corto. Las primeras oraciones completas que caben en el máximo, que es donde el caso
 * presenta al paciente. Si la primera ya no cabe se corta en una palabra. Un caso que cabe entero
 * queda igual
 */
export function shortenCase(text: string, max: number = CASE_SHORT_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let kept = '';
  for (const sentence of sentences) {
    const next = kept === '' ? sentence : `${kept} ${sentence}`;
    if (next.length + ELLIPSIS.length > max) break;
    kept = next;
  }
  return kept === '' ? cutAtWord(clean, max) : `${kept} ${ELLIPSIS}`;
}

/** Frase del banco que respalda la tarjeta. La explicación, o el porqué de la clave si no hay */
export function questionExplanation(bundle: Pick<QuestionBundle, 'question' | 'options'>): string {
  const explanation = bundle.question.explanation.trim();
  if (explanation !== '') return explanation;
  return bundle.options.find((option) => option.isCorrect)?.rationale.trim() ?? '';
}

/**
 * La tarjeta básica de una pregunta. null si la pregunta no tiene clave, que no debería pasar con un
 * banco validado. El reverso cabe en un campo de tarjeta, y si no cabe se recorta la explicación
 */
export function questionCardDraft(
  bundle: Pick<QuestionBundle, 'question' | 'options' | 'vignette'>,
): Extract<NoteDraft, { kind: 'basic' }> | null {
  const { question, options, vignette } = bundle;
  const correct = options.find((option) => option.isCorrect);
  if (!correct) return null;
  const text = t.examReview.createCard;

  const front = [vignette.trim() === '' ? '' : shortenCase(vignette), question.prompt.trim()]
    .filter(Boolean)
    .join('\n\n');

  const answer = `${text.correctAnswer}. ${correct.text.trim()}`;
  const refs = question.gpcRefs.map((ref) => ref.title.trim()).filter(Boolean);
  const reference = refs.length > 0 ? `${text.references}. ${refs.join('; ')}` : '';
  const why = questionExplanation(bundle);
  // Lo que queda del campo, contando los saltos de párrafo entre las partes
  const room = FIELD_MAX - answer.length - (reference ? reference.length + 2 : 0) - 2;
  const back = [answer, why === '' ? '' : cutAtWord(why, room), reference]
    .filter(Boolean)
    .join('\n\n');
  return { kind: 'basic', front: cutAtWord(front, FIELD_MAX), back: cutAtWord(back, FIELD_MAX) };
}
