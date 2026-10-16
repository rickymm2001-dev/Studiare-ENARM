// Contenido de la tarjeta de una pregunta fallada (7.1). No escribe medicina nueva. Todo el texto
// sale del banco tal cual, la viñeta y la frase al frente y la clave con su explicación atrás, y las
// etiquetas que lo acompañan son de la interfaz. Por eso la tarjeta hereda el estado editorial de
// la pregunta y no pasa por la revisión de contenido generado.
// Una pregunta de Inglés médico (B13) lleva distinto el texto. Al frente va el fragmento corto del
// texto y no el texto entero, que puede pasar de 8,000 caracteres, como en las tarjetas que arma el
// alumno. El inglés va en un span con lang="en" para que el lector de pantalla lo diga en inglés. Atrás
// va la fuente del texto con su licencia, porque la licencia pide atribuir el texto donde se use.
import { LICENSE_LABELS, parsePassageSource } from '@/data/content/passageSource';
import { escapeHtml, textToHtml } from '@/data/content/plainText';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { shortenCase } from '../questionCards/questionCardDraft';
import type { QuestionBundle } from '../simulator/useQuestion';

export interface ErrorCardContent {
  /** HTML con etiquetas de la lista corta de CardHtml */
  front: string;
  back: string;
  /** Frase del banco que respalda la tarjeta. Es la explicación, o el porqué de la clave */
  quote: string;
}

const QUOTE_MAX = 2000;

/** Un pedazo de HTML ya escapado que el lector de pantalla dice en inglés */
const inEnglish = (escaped: string) => `<span lang="en">${escaped}</span>`;

/**
 * La línea de la fuente del texto, con las mismas partes que se ven bajo el texto en la pantalla. Si la
 * fuente no es válida deja la primera referencia tal cual, para no perder la atribución que haya. Vacía
 * si la pregunta no trae referencias
 */
function sourceLineHtml(refs: readonly { title: string }[]): string {
  const parsed = parsePassageSource(refs);
  if (!parsed.ok) {
    const first = refs[0]?.title.trim() ?? '';
    return first === '' ? '' : `<p>${escapeHtml(first)}</p>`;
  }
  const { title, license, url } = parsed.source;
  const pieces = [
    ...(title === '' ? [] : [`${inEnglish(escapeHtml(title))}.`]),
    `${escapeHtml(LICENSE_LABELS[license])}.`,
    ...(url === null ? [] : [escapeHtml(url)]),
  ];
  return `<p><strong>${englishText.reading.sourceLabel}.</strong> ${pieces.join(' ')}</p>`;
}

/** La viñeta del frente. En inglés va el fragmento corto del texto y no el texto entero */
function vignetteHtml(vignette: string, english: boolean): string {
  if (!english) return vignette ? textToHtml(vignette) : '';
  const short = shortenCase(vignette);
  return short === '' ? '' : `<p>${inEnglish(escapeHtml(short))}</p>`;
}

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
  // Solo el texto, la pregunta y las opciones van en inglés. La explicación y las justificaciones del
  // banco van en español
  const english = question.language === 'en';
  const bankText = (text: string) => (english ? inEnglish(escapeHtml(text)) : escapeHtml(text));

  const front = `${vignetteHtml(vignette, english)}<p><strong>${bankText(question.prompt)}</strong></p>`;
  const lines = [
    `<p><strong>${t.errorCards.correctAnswer}.</strong> ${bankText(correct.text)}</p>`,
    textToHtml(why),
  ];
  if (chosenOptionId === null) {
    lines.push(`<p>${t.errorCards.leftBlank}</p>`);
  } else if (chosen && !chosen.isCorrect) {
    lines.push(
      `<p><strong>${t.errorCards.yourChoice}.</strong> ${bankText(chosen.text)}</p>`,
      `<p><em>${t.errorCards.whyAttracts}.</em> ${escapeHtml(chosen.rationale)}</p>`,
    );
  }
  if (english) lines.push(sourceLineHtml(question.gpcRefs));
  return { front, back: lines.join(''), quote: why.slice(0, QUOTE_MAX) };
}
