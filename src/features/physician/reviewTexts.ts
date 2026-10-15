// Frases de los pendientes y de los avisos con casilla de una versión del banco (B11, 3.4 del plan de
// B11). Las usan el editor del médico, el banco y el reporte de renglones de la sincronización.
import { physicianText } from '@/i18n/physician';
import { splitIncomplete } from './reviewSteps';

/**
 * El texto de un pendiente, con la letra de la opción cuando aplica. passage_source_missing,
 * license_not_allowed y language_branch_mismatch son de Inglés médico (B13)
 */
export function incompleteText(code: string): string {
  const text = physicianText.incomplete;
  const { code: base, letter } = splitIncomplete(code);
  switch (base) {
    case 'rationale_missing':
      return text.rationale_missing(letter ?? '');
    case 'bias_missing':
      return text.bias_missing(letter ?? '');
    case 'bias_unknown':
      return text.bias_unknown(letter ?? '');
    case 'task_undetected':
    case 'explanation_missing':
    case 'references_missing':
    case 'prompt_missing':
    case 'options_count':
    case 'correct_count':
    case 'canonical_invalid':
    case 'passage_source_missing':
    case 'license_not_allowed':
    case 'language_branch_mismatch':
      return text[base];
    default:
      return text.other(code);
  }
}

/** El texto de un aviso con casilla */
export function flagText(code: string): string {
  const text = physicianText.flags;
  return code === 'topic_inferred' || code === 'kind_control_check' ? text[code] : text.other(code);
}
