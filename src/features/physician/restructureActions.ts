// Pedir y decidir propuestas de preguntas reestructuradas (8.6, pantalla 20). Cada propuesta entra a
// la cola del médico como borrador con el original al lado y no llega a ningún alumno hasta que la
// aprueba. Aprobar crea la variante, que se queda fuera del examen hasta su umbral.
import type { AiStatus } from '@/ai/client';
import { callEngine } from '@/ai/engines';
import type { DataApi } from '@/data/context';
import { newId } from '@/data/ids';
import type { AiArtifact } from '@/data/schemas/activity';
import type { Option, Question } from '@/data/schemas/bank';
import type { User } from '@/data/schemas/people';
import { logAiCall } from '@/data/usecases/aiTutor';
import type { RestructureOutput } from '@/engines/aiContracts';
import { InvalidDraftError } from './editorActions';
import { validateDraft, type QuestionDraft, type TaxonomyView } from './editorDraft';
import {
  buildRestructureInput,
  buildVariant,
  contentFor,
  RestructureContentSchema,
  stemOf,
  type RestructureContent,
  type Transform,
} from './restructure';

type Api = Pick<DataApi, 'repos'>;
type Person = Pick<User, 'id' | 'alias'>;

export type RequestResult =
  | { ok: true; artifact: AiArtifact; reused: boolean }
  | { ok: false; reason: string; message: string };

/** El contenido de un artefacto de pregunta reestructurada, o null si no se puede leer */
export function readContent(artifact: AiArtifact): RestructureContent | null {
  const parsed = RestructureContentSchema.safeParse(artifact.content);
  return parsed.success ? parsed.data : null;
}

export async function requestRestructure(
  api: Api,
  physician: Person,
  args: {
    question: Question;
    options: readonly Option[];
    transform: Transform;
    status: AiStatus;
    fetchImpl?: typeof fetch;
    now?: Date;
  },
): Promise<RequestResult> {
  const built = buildRestructureInput(args.question, args.options, args.transform);
  if (!built.ok) return { ok: false, reason: built.reason, message: built.reason };

  // Una propuesta pendiente de la misma pregunta y la misma transformación no se pide dos veces
  const pending = (await api.repos.aiArtifacts.list()).find((artifact) => {
    if (artifact.kind !== 'restructured_question' || artifact.status !== 'draft') return false;
    const content = readContent(artifact);
    return content?.questionVersionId === args.question.id && content.transform === args.transform;
  });
  if (pending) return { ok: true, artifact: pending, reused: true };

  const call = await callEngine('restructure', built.input, {
    status: args.status,
    studentRef: physician.id,
    names: [physician.alias],
    ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
  });
  if (call.meta) await logAiCall(api, physician, call.meta, args.now);
  if (!call.ok) return { ok: false, reason: call.reason, message: call.message };

  const artifact: AiArtifact = {
    id: newId(),
    userId: null,
    kind: 'restructured_question',
    status: 'draft',
    mode: call.meta.mode,
    model: call.meta.model,
    promptVersion: call.meta.promptVersion,
    content: contentFor(args.question, built.input, call.output),
    validatorResult: {
      passed: call.meta.validator.passed,
      issues: call.meta.validator.issues.slice(0, 50),
    },
    sourceIds: [args.question.id],
    createdAt: (args.now ?? new Date()).toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  await api.repos.aiArtifacts.put(artifact);
  return { ok: true, artifact, reused: false };
}

/** Si el médico cambió el texto que propuso la IA. Etiquetas y razones que completa no cuentan */
export function editedFromProposal(draft: QuestionDraft, proposal: RestructureOutput): boolean {
  const same = (a: string, b: string) =>
    a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
  if (!same(stemOf(draft), proposal.stem) || !same(draft.explanation, proposal.explanation))
    return true;
  if (draft.options.length !== proposal.options.length) return true;
  return draft.options.some((option, index) => {
    const proposed = proposal.options[index];
    return !proposed || !same(option.text, proposed.text) || option.isCorrect !== proposed.isKey;
  });
}

export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionError';
  }
}

export type Decision =
  { kind: 'reject' } | { kind: 'approve'; draft: QuestionDraft; taxonomy: TaxonomyView };

export async function decideRestructure(
  api: Api,
  physician: Pick<User, 'id'>,
  artifactId: string,
  decision: Decision,
  now: Date = new Date(),
): Promise<AiArtifact> {
  const artifact = await api.repos.aiArtifacts.get(artifactId);
  if (artifact?.kind !== 'restructured_question')
    throw new DecisionError('No existe esa propuesta');
  if (artifact.status !== 'draft') throw new DecisionError('Esa propuesta ya tiene una decisión');
  const content = readContent(artifact);
  if (!content) throw new DecisionError('La propuesta no se puede leer');
  const decided = { decidedAt: now.toISOString(), decidedBy: physician.id };

  if (decision.kind === 'reject') {
    const rejected: AiArtifact = { ...artifact, status: 'rejected', ...decided };
    await api.repos.aiArtifacts.put(rejected);
    return rejected;
  }

  const issues = validateDraft(decision.draft, decision.taxonomy);
  if (issues.length > 0) throw new InvalidDraftError(issues);
  const original = await api.repos.questions.get(content.questionVersionId);
  if (!original) throw new DecisionError('La pregunta original ya no está en el banco');
  const variant = buildVariant({ original, draft: decision.draft, now });
  await api.repos.questions.addVersion(variant.question, variant.options);
  const approved: AiArtifact = {
    ...artifact,
    status: editedFromProposal(decision.draft, content.proposal) ? 'edited' : 'approved',
    content: { ...artifact.content, variantQuestionId: variant.question.questionId },
    ...decided,
  };
  await api.repos.aiArtifacts.put(approved);
  return approved;
}
