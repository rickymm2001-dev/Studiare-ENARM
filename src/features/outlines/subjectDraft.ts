// El tema de un apunte mientras el alumno lo elige (B6 del plan del cambio). Pasa del borrador del
// formulario al tema que se guarda y de vuelta, y dice cómo se lee. Las claves del ENARM se revisan
// contra la taxonomía, así nunca se guarda una rama con un tema de otra.
import { topicTaxonomy } from '@/demo/content';
import { FREE_SUBJECT_MAX_LENGTH, type OutlineSubject } from '@/engines/outline';
import { t } from '@/i18n/es-MX';

export type SubjectKind = 'none' | 'enarm' | 'free';

export interface SubjectDraft {
  kind: SubjectKind;
  branch: string;
  topic: string;
  name: string;
}

export const EMPTY_SUBJECT: SubjectDraft = { kind: 'none', branch: '', topic: '', name: '' };

export function draftOf(subject: OutlineSubject | null | undefined): SubjectDraft {
  if (!subject) return EMPTY_SUBJECT;
  return subject.kind === 'enarm'
    ? { ...EMPTY_SUBJECT, kind: 'enarm', branch: subject.branch, topic: subject.topic }
    : { ...EMPTY_SUBJECT, kind: 'free', name: subject.name };
}

/** El tema listo para guardar, o el aviso de lo que falta */
export function subjectOf(
  draft: SubjectDraft,
): { ok: true; subject: OutlineSubject | null } | { ok: false; error: string } {
  const text = t.outlines.subject;
  switch (draft.kind) {
    case 'none':
      return { ok: true, subject: null };
    case 'free': {
      const name = draft.name.trim().slice(0, FREE_SUBJECT_MAX_LENGTH);
      return name === ''
        ? { ok: false, error: text.freeRequired }
        : { ok: true, subject: { kind: 'free', name } };
    }
    case 'enarm': {
      const branch = topicTaxonomy.branches.find((entry) => entry.key === draft.branch);
      const topic = branch?.topics.find((entry) => entry.key === draft.topic);
      return branch && topic
        ? { ok: true, subject: { kind: 'enarm', branch: branch.key, topic: topic.key } }
        : { ok: false, error: text.enarmRequired };
    }
  }
}

/** Cómo se lee el tema, por ejemplo Cardiología o Materia libre, Anatomía */
export function subjectLabel(subject: OutlineSubject | null | undefined): string {
  const text = t.outlines.subject;
  if (!subject) return text.shownNone;
  if (subject.kind === 'free') return text.shownFree(subject.name);
  const branch = topicTaxonomy.branches.find((entry) => entry.key === subject.branch);
  return branch?.topics.find((entry) => entry.key === subject.topic)?.name ?? subject.topic;
}

/** Las ramas del ENARM para elegir */
export const BRANCH_OPTIONS = topicTaxonomy.branches.map((branch) => ({
  value: branch.key,
  label: branch.name,
}));

/** Los temas de una rama, en el orden de la taxonomía */
export function topicOptions(branchKey: string): { value: string; label: string }[] {
  return (
    topicTaxonomy.branches
      .find((branch) => branch.key === branchKey)
      ?.topics.map((topic) => ({ value: topic.key, label: topic.name })) ?? []
  );
}
