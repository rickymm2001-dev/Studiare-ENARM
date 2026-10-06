// Contenido de la tarjeta de una pregunta fallada (7.1). No escribe medicina nueva. Todo el texto
// sale del banco tal cual, la viñeta y la frase al frente y la clave con su explicación atrás, y las
// etiquetas que lo acompañan son de la interfaz. Por eso la tarjeta hereda el estado editorial de
// la pregunta y no pasa por la revisión de contenido generado.
import { t } from '@/i18n/es-MX';
import type { QuestionBundle } from '../simulator/useQuestion';

export interface ErrorCardContent {
  /** HTML con etiquetas de la lista corta de CardHtml */
  front: string;
  back: string;
  /** Frase del banco que respalda la tarjeta. Es la explicación, o el porqué de la clave */
  quote: string;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** El banco es texto plano. Se escapa antes de meterlo a una tarjeta, que es HTML */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Texto plano a párrafos. Una línea en blanco separa párrafos y un salto simple es un br */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const QUOTE_MAX = 2000;

/**
 * Tarjeta de una pregunta fallada. chosenOptionId es la opción que eligió, o null si la dejó en
 * blanco. Devuelve null si la pregunta no tiene clave, que no debería pasar con un banco validado
 */
export function errorCardContent(
  bundle: Pick<QuestionBundle, 'question' | 'options' | 'vignette'>,
  chosenOptionId: string | null,
): ErrorCardContent | null {
  const { question, options, vignette } = bundle;
  const correct = options.find((option) => option.isCorrect);
  if (!correct) return null;
  const chosen = chosenOptionId
    ? options.find((option) => option.id === chosenOptionId)
    : undefined;
  const why = question.explanation.trim() || correct.rationale;

  const front = `${vignette ? paragraphs(vignette) : ''}<p><strong>${escapeHtml(question.prompt)}</strong></p>`;
  const lines = [
    `<p><strong>${t.errorCards.correctAnswer}.</strong> ${escapeHtml(correct.text)}</p>`,
    paragraphs(why),
  ];
  if (chosenOptionId === null) {
    lines.push(`<p>${t.errorCards.leftBlank}</p>`);
  } else if (chosen && !chosen.isCorrect) {
    lines.push(
      `<p><strong>${t.errorCards.yourChoice}.</strong> ${escapeHtml(chosen.text)}</p>`,
      `<p><em>${t.errorCards.whyAttracts}.</em> ${escapeHtml(chosen.rationale)}</p>`,
    );
  }
  return { front, back: lines.join(''), quote: why.slice(0, QUOTE_MAX) };
}
