// Sanguijuelas (D-085, fila 8). Una tarjeta que se olvida una y otra vez gasta tiempo sin enseñar.
// Anki la marca al llegar al umbral de olvidos y de nuevo cada medio umbral después. Aquí además se
// sugiere qué hacer con ella según lo que revela su calidad, dividirla, acortarla o darle contexto.
// Entradas, los olvidos de antes y de después y los avisos de calidad de la tarjeta. Salidas, si hay
// que avisar ahora y las sugerencias. Nunca cambia el texto por su cuenta.
import type { CardQualityIssue } from './cardQuality';

/**
 * Si este repaso acaba de volver sanguijuela a la tarjeta. Pasa al llegar al umbral y de nuevo cada
 * medio umbral de olvidos, así una tarjeta que sigue fallando vuelve a avisar sin hacerlo a diario
 */
export function leechHit(lapsesBefore: number, lapsesAfter: number, threshold: number): boolean {
  if (lapsesAfter <= lapsesBefore || lapsesAfter < threshold) return false;
  const every = Math.max(1, Math.ceil(threshold / 2));
  return (lapsesAfter - threshold) % every === 0;
}

export type LeechSuggestion = 'split' | 'shorten' | 'context' | 'rewrite';

/** Qué conviene hacer con la tarjeta. Sin pistas claras queda la sugerencia general de reescribirla */
export function leechSuggestions(issues: readonly CardQualityIssue[]): LeechSuggestion[] {
  const found = new Set<LeechSuggestion>();
  for (const issue of issues) {
    switch (issue.code) {
      case 'multiple_ideas':
      case 'list_too_long':
      case 'multiple_questions':
      case 'too_many_holes':
        found.add('split');
        break;
      case 'front_too_long':
      case 'back_too_long':
      case 'text_too_long':
      case 'hole_answer_too_long':
        found.add('shorten');
        break;
      case 'hole_without_context':
        found.add('context');
        break;
      case 'answer_in_question':
      case 'answer_in_cloze_text':
        break;
    }
  }
  return found.size > 0 ? [...found] : ['rewrite'];
}
