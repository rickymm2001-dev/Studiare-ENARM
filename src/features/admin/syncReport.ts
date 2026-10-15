// El reporte de renglones de una corrida de la sincronización (B11, 3.9 del plan de B11). Traduce cada
// código de rechazo y de aviso a una frase en español con su acción, por ejemplo "Renglón 45. El
// subtema Control prenatal es una subespecialidad. Elige el subtema en la lista", y arma el CSV con la
// misma tabla. Los valores que repite son solo de listas cerradas, así que nunca hay texto de una
// pregunta. Sin React ni Dexie.
import type { SyncNoticeCode, SyncProblemCode, SyncRowResult } from '@/data/bank/contracts';
import { bankAdminText } from '@/i18n/bankAdmin';
import { BOM } from '../physician/bankTemplates';

const text = bankAdminText.sync;

/** Todos los motivos de rechazo del contrato. Una prueba revisa que cada uno tenga su frase */
export const SYNC_PROBLEM_CODES = [
  'id_missing',
  'id_format',
  'id_duplicate',
  'branch_unknown',
  'topic_unknown',
  'subtopic_unknown',
  'subtopic_is_topic',
  'difficulty_invalid',
  'kind_unknown',
  'task_unknown',
  'task_undetected',
  'polarity_invalid',
  'text_too_long',
  'prompt_missing',
  'correct_invalid',
  'options_few',
  'option_gap',
  'option_orphan',
  'canonical_invalid',
  'template_placeholder',
  'case_inconsistent',
] as const satisfies readonly SyncProblemCode[];

/** Todos los avisos del contrato */
export const SYNC_NOTICE_CODES = [
  'topic_inferred',
  'kind_control_check',
  'structure_auto',
  'status_approved_ignored',
  'status_unknown',
  'bias_none_on_correct',
  'author_unknown',
  'reviewer_unknown',
  'author_is_reviewer',
  'case_rows_apart',
  'language_unknown',
  'not_ready',
] as const satisfies readonly SyncNoticeCode[];

// Si el contrato suma un código y esta lista no, esto deja de compilar
type OnlyNever<T extends never> = T;
export type SyncCodesListed = [
  OnlyNever<Exclude<SyncProblemCode, (typeof SYNC_PROBLEM_CODES)[number]>>,
  OnlyNever<Exclude<SyncNoticeCode, (typeof SYNC_NOTICE_CODES)[number]>>,
];

const isProblemCode = (code: string): code is SyncProblemCode =>
  (SYNC_PROBLEM_CODES as readonly string[]).includes(code);
const isNoticeCode = (code: string): code is SyncNoticeCode =>
  (SYNC_NOTICE_CODES as readonly string[]).includes(code);

/** La frase de un motivo de rechazo */
export function problemMessage(problem: SyncRowResult['problems'][number]): string {
  return isProblemCode(problem.code)
    ? text.problems[problem.code](problem.column, problem.value)
    : text.problemOther(problem.code, problem.column);
}

/** La frase de un aviso */
export const noticeMessage = (code: string): string =>
  isNoticeCode(code) ? text.notices[code] : text.noticeOther(code);

/** Lo que hay que hacer con un renglón, una frase por problema, pendiente y aviso */
export function rowMessages(
  row: SyncRowResult,
  incompleteText: (code: string) => string,
): string[] {
  if (row.outcome === 'missing') return [text.rows.missing];
  return [
    ...row.problems.map(problemMessage),
    ...(row.outcome === 'conflict' ? [text.rows.conflict] : []),
    ...row.incomplete.map(incompleteText),
    ...row.notices.map(noticeMessage),
  ];
}

/** Renglón 45, o Ya no está para los que desaparecieron */
export const rowLabel = (row: Pick<SyncRowResult, 'rowNumber'>) => text.rows.row(row.rowNumber);

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * El CSV del reporte de renglones, en UTF-8 con BOM para Excel. Un renglón del CSV por cada frase,
 * así cada acción se puede filtrar
 */
export function syncRowsCsv(
  rows: readonly SyncRowResult[],
  incompleteText: (code: string) => string,
): string {
  const lines = [text.rows.csvColumns.map(csvCell).join(',')];
  for (const row of rows) {
    const outcome = text.rows.outcomes[row.outcome] ?? row.outcome;
    const messages = rowMessages(row, incompleteText);
    for (const message of messages.length > 0 ? messages : ['']) {
      lines.push([rowLabel(row), row.sheetKey ?? '', outcome, message].map(csvCell).join(','));
    }
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
