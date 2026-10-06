// Tarjeta de contraste entre dos preguntas que el alumno confunde (7.9, interferencia). Pone lado a
// lado las dos respuestas con la frase de su pregunta, y atrás la explicación de cada una. Todo el
// texto sale del banco sin cambios, así que la tarjeta hereda su estado editorial y cita la
// explicación, igual que las de Mis errores. La IA de la Fase D podrá redactarla mejor.
import { escapeHtml, textToHtml } from '@/data/content/plainText';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { queueErrorCards, type ErrorCardInput } from '@/data/usecases/errorCards';
import { t } from '@/i18n/es-MX';
import type { ErrorCardContent } from '../review/errorCardContent';
import type { QuestionBundle } from '../simulator/useQuestion';

type Bundle = Pick<QuestionBundle, 'question' | 'options'>;

const QUOTE_MAX = 2000;

/** null si a alguna de las dos le falta su clave, que no pasa con un banco validado */
export function contrastCardContent(a: Bundle, b: Bundle): ErrorCardContent | null {
  const correctA = a.options.find((option) => option.isCorrect);
  const correctB = b.options.find((option) => option.isCorrect);
  if (!correctA || !correctB) return null;
  const whyA = a.question.explanation.trim() || correctA.rationale;
  const whyB = b.question.explanation.trim() || correctB.rationale;
  const side = (bundle: Bundle, answer: string) =>
    `<p>${escapeHtml(bundle.question.prompt)}<br><strong>${escapeHtml(answer)}</strong></p>`;
  return {
    front: `<p><strong>${t.errorCards.contrastTitle}</strong></p>${side(a, correctA.text)}${side(b, correctB.text)}<p>${t.errorCards.contrastAsk}</p>`,
    back: `<p><strong>${escapeHtml(correctA.text)}</strong></p>${textToHtml(whyA)}<p><strong>${escapeHtml(correctB.text)}</strong></p>${textToHtml(whyB)}`,
    quote: whyA.slice(0, QUOTE_MAX),
  };
}

/** La clave estable de un par, sin importar en qué orden se confundieron */
export const contrastKey = (failedId: string, chosenId: string) =>
  `contraste|${[failedId, chosenId].sort().join('|')}`;

/** Crea las tarjetas de contraste que faltan en Mis errores y devuelve cuántas quedaron nuevas */
export async function createContrastCards(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  pairs: readonly { failedId: string; chosenId: string }[],
  bundles: ReadonlyMap<string, Bundle>,
): Promise<number> {
  const inputs: ErrorCardInput[] = [];
  for (const pair of pairs) {
    const a = bundles.get(pair.failedId);
    const b = bundles.get(pair.chosenId);
    const content = a && b ? contrastCardContent(a, b) : null;
    if (!a || !b || !content) continue;
    inputs.push({
      questionVersionId: a.question.id,
      key: contrastKey(pair.failedId, pair.chosenId),
      topic: a.question.topic,
      // Una tarjeta es tan revisada como la menos revisada de sus dos preguntas
      editorialStatus:
        a.question.editorialStatus === 'approved' && b.question.editorialStatus === 'approved'
          ? 'approved'
          : 'draft',
      isDemo: a.question.isDemo || b.question.isDemo,
      ...content,
    });
  }
  return queueErrorCards(api, user, inputs, {
    name: t.errorCards.deckName,
    description: t.errorCards.deckDescription,
  });
}
