// Textos de la revisión de calidad de tarjetas y de los duplicados (fila 9 de D-085), en español de
// México con trato de tú (4.9). Cada mensaje dice qué pasa y cómo arreglarlo en una frase, sin
// regañar, porque son sugerencias y el alumno decide. Se integran en t desde es-MX.ts.
import type { CardQualityIssue } from '@/engines/cardQuality';
import type { DuplicateMatch } from '@/engines/duplicates';
import { plural } from './features';

const list = new Intl.ListFormat('es-MX', { style: 'long', type: 'conjunction' });

const holeName = (ordinal: number) => `c${ordinal}`;
const words = (n: number) => plural(n, 'palabra', 'palabras');

/** Un casi igual nunca se presenta como 100%, eso es un exacto */
const percent = (similarity: number) => `${Math.min(99, Math.floor(similarity * 100))}%`;

/** Una frase por aviso, con las cifras que trae el motor */
export function qualityIssueMessage(issue: CardQualityIssue): string {
  const strong = issue.severity === 'warning';
  switch (issue.code) {
    case 'front_too_long':
      return strong
        ? `La pregunta tiene ${words(issue.words)} y es muy larga. Quédate con lo esencial o divídela en dos tarjetas.`
        : `La pregunta tiene ${words(issue.words)}. Si la dejas en unas ${issue.limit} o menos se repasa de un vistazo.`;
    case 'back_too_long':
      return strong
        ? `La respuesta tiene ${words(issue.words)} y es muy larga. Divídela en tarjetas más cortas, una idea en cada una.`
        : `La respuesta tiene ${words(issue.words)}. Deja lo esencial, unas ${issue.limit} o menos, y pasa el resto a otra tarjeta.`;
    case 'text_too_long':
      return strong
        ? `El texto tiene ${words(issue.words)} y es muy largo. Divídelo en varias tarjetas, una idea en cada una.`
        : `El texto tiene ${words(issue.words)}. Una frase corta con un solo dato se recuerda mejor, intenta dejarlo en unas ${issue.limit}.`;
    case 'list_too_long':
      return issue.field === 'back'
        ? `La respuesta enumera ${plural(issue.items, 'elemento', 'elementos')}. Divide la lista en tarjetas más pequeñas, de ${issue.limit} elementos o menos.`
        : `El texto o un hueco enumera ${plural(issue.items, 'elemento', 'elementos')}. Haz tarjetas separadas con ${issue.limit} elementos o menos en cada una.`;
    case 'multiple_ideas': {
      const size =
        issue.lines > 1
          ? `${plural(issue.sentences, 'oración', 'oraciones')} en ${plural(issue.lines, 'línea', 'líneas')}`
          : plural(issue.sentences, 'oración', 'oraciones');
      return issue.field === 'back'
        ? `La respuesta parece juntar varias ideas (${size}). Deja una idea por tarjeta y pasa las demás a tarjetas nuevas.`
        : `El texto parece juntar varias ideas (${size}). Deja una idea por tarjeta y pasa las demás a tarjetas nuevas.`;
    }
    case 'multiple_questions':
      return `La pregunta parece preguntar ${issue.questions} cosas a la vez. Deja una por tarjeta y pasa las otras a tarjetas nuevas.`;
    case 'too_many_holes':
      return `El texto tiene ${plural(issue.holes, 'hueco distinto', 'huecos distintos')}. Con más de ${issue.limit} cuesta saber qué te piden, deja uno o dos por tarjeta.`;
    case 'hole_answer_too_long':
      return strong
        ? `El hueco ${holeName(issue.ordinal)} esconde una frase entera, ${words(issue.words)}. Esconde solo el dato clave y deja el resto visible.`
        : `El hueco ${holeName(issue.ordinal)} esconde ${words(issue.words)}. Es más fácil recordar un dato clave, de unas ${issue.limit} palabras o menos.`;
    case 'hole_without_context':
      return issue.contextWords === 0
        ? `Al tapar el hueco ${holeName(issue.ordinal)} no queda contexto. Agrega unas palabras alrededor para que se entienda qué te preguntan.`
        : `Al tapar el hueco ${holeName(issue.ordinal)} quedan solo ${words(issue.contextWords)} de contexto. Agrega unas palabras alrededor, al menos ${issue.minimum}, para que se entienda qué te preguntan.`;
    case 'answer_in_question':
      if (issue.direction === 'forward') {
        return 'La respuesta ya está escrita en la pregunta. Reescribe la pregunta para que no la delate.';
      }
      if (issue.direction === 'reverse') {
        return 'El frente aparece dentro de la respuesta, así que la tarjeta inversa se contesta sola. Reescribe la respuesta para que no lo repita.';
      }
      return 'La pregunta y la respuesta se repiten una en la otra, y las dos tarjetas se contestan solas. Reescribe una de las dos caras.';
    case 'answer_in_cloze_text': {
      const names = list.format(issue.ordinals.map(holeName));
      return issue.ordinals.length === 1
        ? `Lo que esconde el hueco ${names} ya se ve en el resto del texto o en su pista. Quítalo de ahí para que el hueco sea una pregunta de verdad.`
        : `Lo que esconden los huecos ${names} ya se ve en el resto del texto o en sus pistas. Quítalo de ahí para que cada hueco sea una pregunta de verdad.`;
    }
  }
}

const quote = (match: DuplicateMatch) => `“${match.preview}”`;

export const qualityText = {
  cardQuality: {
    title: 'Para que la tarjeta funcione mejor',
    footer: 'Son solo sugerencias. Puedes guardar la tarjeta como está.',
    severity: { warning: 'Aviso', note: 'Sugerencia' },
    more: (n: number) => `Y ${n.toLocaleString('es-MX')} más.`,
    issue: qualityIssueMessage,
    duplicateExact: (total: number, first: DuplicateMatch) =>
      total === 1
        ? `Ya tienes una tarjeta con este mismo texto, ${quote(first)}. Si es la misma, edita esa en lugar de crear otra.`
        : `Ya tienes ${plural(total, 'tarjeta', 'tarjetas')} con este mismo texto, por ejemplo ${quote(first)}. Revisa si de verdad necesitas otra o edita una de esas.`,
    duplicateNear: (total: number, first: DuplicateMatch) =>
      total === 1
        ? `Hay una tarjeta casi igual, con ${percent(first.similarity)} de coincidencia, ${quote(first)}. Revisa que no estés repitiendo la misma idea.`
        : `Hay ${plural(total, 'tarjeta', 'tarjetas')} casi iguales, la más parecida con ${percent(first.similarity)} de coincidencia, ${quote(first)}. Revisa que no estés repitiendo la misma idea.`,
  },
} as const;
