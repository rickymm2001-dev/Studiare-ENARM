// Guardar desde el editor de pregunta (pantalla 18). Una versión nueva por cada guardado y el cambio
// de estado de la versión más reciente. Una versión que ya no es la última no se toca (6.1).
import type { DataApi } from '@/data/context';
import { newId } from '@/data/ids';
import type { Option, Question } from '@/data/schemas/bank';
import {
  buildNextVersion,
  canMoveTo,
  type QuestionDraft,
  type TaxonomyView,
  validateDraft,
  type DraftIssue,
} from './editorDraft';

type Api = Pick<DataApi, 'repos'>;

/** Alguien guardó otra versión mientras este médico editaba la que tenía abierta */
export class StaleVersionError extends Error {
  constructor() {
    super('Hay una versión más nueva de la pregunta');
    this.name = 'StaleVersionError';
  }
}

/** El borrador no cumple las reglas. Trae los motivos para mostrarlos */
export class InvalidDraftError extends Error {
  readonly issues: readonly DraftIssue[];
  constructor(issues: readonly DraftIssue[]) {
    super('El borrador no se puede guardar');
    this.name = 'InvalidDraftError';
    this.issues = issues;
  }
}

export async function saveQuestionVersion(
  api: Api,
  input: {
    current: Question;
    draft: QuestionDraft;
    taxonomy: TaxonomyView;
    now?: Date;
  },
): Promise<{ question: Question; options: Option[] }> {
  const issues = validateDraft(input.draft, input.taxonomy);
  if (issues.length > 0) throw new InvalidDraftError(issues);
  const latest = await api.repos.questions.latest(input.current.questionId);
  if (latest?.id !== input.current.id) throw new StaleVersionError();
  const next = buildNextVersion({
    current: input.current,
    draft: input.draft,
    newId,
    now: input.now ?? new Date(),
  });
  await api.repos.questions.addVersion(next.question, next.options);
  return next;
}

/** Cambia el estado de la versión más reciente siguiendo el flujo editorial */
export async function moveQuestionStatus(
  api: Api,
  question: Question,
  to: Question['editorialStatus'],
): Promise<void> {
  const latest = await api.repos.questions.latest(question.questionId);
  if (latest?.id !== question.id) throw new StaleVersionError();
  if (!canMoveTo(latest.editorialStatus, to)) {
    throw new Error(`No se puede pasar de ${latest.editorialStatus} a ${to}`);
  }
  await api.repos.questions.setEditorialStatus(latest.id, to);
}
