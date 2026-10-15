// Pasos de la revisión de una pregunta en el editor (pantalla 18, 4.1 y 4.4 del plan de B11). Funciones
// puras sobre lo que devuelve editor_question. El revisor primero etiqueta a ciegas los distractores,
// después ve la pregunta completa con lo que cambió, sus pendientes y las casillas por confirmar, y
// decide. El autor escribe y manda a revisión. El admin y el dueño solo leen (1.7). Sin React ni Dexie.
import type { EditorQuestion, EditorVersion } from '@/data/bank/contracts';
import { changedParts, draftFromEditorVersion, type ChangedPart } from './editorDraft';

export type ReviewStepKind =
  /** El revisor etiqueta a ciegas, sin ver lo del autor */
  | 'blind'
  /** El revisor ya etiquetó y decide sobre la versión en revisión */
  | 'decide'
  /** El autor o el revisor trabajan un borrador que se puede mandar a revisión */
  | 'draft'
  /** La versión espera la decisión de otro médico */
  | 'waiting'
  /** La versión más reciente ya se aprobó o se rechazó. Editar abre una versión nueva */
  | 'closed'
  /** El admin, el dueño o quien no tiene la pregunta asignada */
  | 'read_only';

export interface ReviewView {
  step: ReviewStepKind;
  /** La versión más reciente, que es la única que se mueve */
  latest: EditorVersion;
  /** La anterior, para decir qué cambió. null en la primera */
  previous: EditorVersion | null;
  /** Puede guardar versiones nuevas. Nunca durante el paso a ciegas ni siendo admin */
  editable: boolean;
  /**
   * La versión más reciente ya tiene una decisión, como un borrador que regresó con cambios pedidos.
   * No se manda otra vez a revisión (22023). Los cambios van en una versión nueva
   */
  decided: boolean;
  /** Distractores del paso a ciegas, con cuántos ya etiquetó */
  blind: { total: number; done: number; pending: string[] } | null;
  /** Qué cambió contra la versión anterior. null en la primera */
  changes: ChangedPart[] | null;
  /** Lo que le falta para aprobarse (3.4) */
  incomplete: string[];
  /** Avisos con casilla que el revisor confirma al aprobar (3.4) */
  flags: string[];
  /** Viene del Sheet. Conviene corregir allá para no crear un conflicto */
  fromSheet: boolean;
  /** El ID del Sheet sin el prefijo, como GO-0012. null si no viene del Sheet */
  sheetKey: string | null;
  conflict: boolean;
}

/** El ID del Sheet o de la importación sin su prefijo. sheet:GO-0012 da GO-0012 */
export const sourceKeyLabel = (sourceKey: string | null): string | null =>
  sourceKey === null ? null : sourceKey.replace(/^[a-z_]+:/, '');

export function reviewViewOf(question: EditorQuestion): ReviewView | null {
  const [latest, previous] = question.versions;
  if (!latest) return null;
  const { role, state } = question.review;
  const writer = role === 'author' || role === 'reviewer';
  const distractors = latest.options.filter((option) => !option.isCorrect);
  let step: ReviewStepKind;
  if (!writer) step = 'read_only';
  else if (role === 'reviewer' && state === 'blind_pending') step = 'blind';
  else if (role === 'reviewer' && state === 'ready' && latest.status === 'in_review') {
    step = 'decide';
  } else if (latest.status === 'draft') step = 'draft';
  else if (latest.status === 'in_review') step = 'waiting';
  else step = 'closed';
  const pending = step === 'blind' ? [...question.review.pendingOptionIds] : [];
  return {
    step,
    latest,
    previous: previous ?? null,
    editable: writer && step !== 'blind',
    decided: latest.decisions.length > 0,
    blind:
      step === 'blind'
        ? { total: distractors.length, done: distractors.length - pending.length, pending }
        : null,
    changes: previous
      ? changedParts(draftFromEditorVersion(previous), draftFromEditorVersion(latest))
      : null,
    incomplete: [...latest.incomplete],
    flags: [...latest.flags],
    fromSheet: question.sync.origin === 'sheet',
    sheetKey: question.sync.origin === 'sheet' ? sourceKeyLabel(question.sync.sourceKey) : null,
    conflict: question.sync.conflictSince !== null,
  };
}

export type ApprovalBlocker = 'incomplete' | 'flags';

/**
 * Lo que le falta al revisor para poder aprobar, en el orden en que la base lo revisa. Pedir cambios y
 * rechazar no tienen esto, solo piden comentario
 */
export function approvalBlockers(
  view: Pick<ReviewView, 'incomplete' | 'flags'>,
  checked: ReadonlySet<string>,
): ApprovalBlocker[] {
  const blockers: ApprovalBlocker[] = [];
  if (view.incomplete.length > 0) blockers.push('incomplete');
  if (view.flags.some((flag) => !checked.has(flag))) blockers.push('flags');
  return blockers;
}

/** Pedir cambios y rechazar llevan comentario. Aprobar no */
export const needsComment = (decision: 'approve' | 'request_changes' | 'reject') =>
  decision !== 'approve';

/** El pendiente separado en su código y la letra de la opción, como rationale_missing:B */
export function splitIncomplete(code: string): { code: string; letter: string | null } {
  const [base, letter] = code.split(':');
  return { code: base ?? code, letter: letter ?? null };
}
