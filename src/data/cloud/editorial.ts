// Formas de las funciones editor_* del banco en la nube (B11, 7.5 del plan de B11), validadas con zod
// al llegar. Son las de src/data/bank/contracts.ts. Un borrador incompleto no pasa por los esquemas de
// Dexie, que piden etiqueta en cada distractor, así que aquí todo es tolerante como EditorVersion.
// También la llamada única a una rpc con su error traducido, que comparten el repositorio editorial y
// las pantallas del admin.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  EditorListItem,
  EditorQuestion,
  EditorVersion,
  LabelPair,
  MyReviews,
} from '../bank/contracts.ts';
import {
  EditorialError,
  editorialCodeOf,
  type EditorDistractorFlag,
  type EditorReportRow,
} from '../editorial/editorialRepo.ts';

export type Rpc = Pick<SupabaseClient, 'rpc'>;

const count = z.coerce.number().int().nonnegative();
const iso = z.string();
const nullableIso = z.string().nullable();
const status = z.enum(['draft', 'in_review', 'approved', 'rejected']);
const text = z
  .string()
  .nullable()
  .transform((value) => value ?? '');

const PersonSchema = z
  .object({ id: z.string(), alias: z.string(), code: z.string().nullable().optional() })
  .transform((person) => ({ id: person.id, alias: person.alias, code: person.code ?? null }));

export const EditorListItemSchema = z.object({
  questionId: z.string(),
  sourceKey: z.string().nullable(),
  latestVersionId: z.string(),
  version: count,
  status,
  publishedVersion: count.nullable(),
  branch: z.string(),
  topic: z.string(),
  subtopic: z.string(),
  difficulty: count,
  promptPreview: text,
  author: PersonSchema.nullable(),
  reviewer: PersonSchema.nullable(),
  myRole: z.enum(['author', 'reviewer', 'admin']),
  reviewState: z.enum(['none', 'blind_pending', 'ready']),
  incomplete: z.array(z.string()),
  flags: z.array(z.string()),
  openReports: count,
  openDistractorFlags: count,
  conflict: z.boolean(),
  missing: z.boolean(),
  retireRequested: z.boolean(),
  retired: z.boolean(),
  updatedAt: iso,
}) satisfies z.ZodType<EditorListItem>;

export const EditorListSchema = z.object({
  total: count,
  items: z.array(EditorListItemSchema),
});

const OptionSchema = z.object({
  id: z.string(),
  optionId: z.string(),
  letter: z.string().nullable(),
  position: count,
  text: z.string(),
  isCorrect: z.boolean(),
  biasTag: z.string().nullable(),
  secondaryBiasTags: z.array(z.string()),
  rationale: z.string().nullable(),
  hidden: z.boolean(),
});

const structure = z.object({
  polarity: z.enum(['affirmative', 'negative']),
  task: z.string(),
  format: z.enum(['clinical_case', 'direct', 'serial_case']),
  source: z.enum(['auto', 'physician']),
});

export const EditorVersionSchema = z.object({
  versionId: z.string(),
  version: count,
  status,
  source: z.enum(['sheet', 'import', 'app', 'ai_variant']).nullable(),
  author: PersonSchema.nullable(),
  createdAt: iso,
  submittedAt: nullableIso,
  decidedAt: nullableIso,
  branch: z.string(),
  topic: z.string(),
  subtopic: z.string(),
  difficulty: count,
  itemKinds: z.array(z.string()),
  structure,
  vignette: z.string(),
  prompt: z.string(),
  explanation: z.string(),
  gpcRefs: z.array(z.object({ title: z.string(), status: z.enum(['to_verify', 'verified']) })),
  clues: z.array(
    z.object({
      text: z.string(),
      strength: z.enum(['pathognomonic', 'characteristic', 'nonspecific']),
    }),
  ),
  caseId: z.string().nullable(),
  caseOrder: count.nullable(),
  variantOf: z.string().nullable(),
  canonicalOptionIds: z.array(z.string()),
  options: z.array(OptionSchema),
  incomplete: z.array(z.string()),
  flags: z.array(z.string()),
  decisions: z.array(
    z.object({
      physician: z.object({ id: z.string(), alias: z.string() }),
      decision: z.enum(['approve', 'request_changes', 'reject']),
      comment: z.string().nullable(),
      decidedAt: iso,
    }),
  ),
}) satisfies z.ZodType<EditorVersion>;

export const EditorQuestionSchema = z.object({
  question: EditorListItemSchema,
  versions: z.array(EditorVersionSchema),
  case: z
    .object({
      id: z.string(),
      vignette: z.string(),
      members: z.array(z.object({ questionId: z.string(), caseOrder: count, status })),
    })
    .nullable(),
  review: z.object({
    role: z.enum(['author', 'reviewer', 'admin', 'none']),
    state: z.enum(['none', 'blind_pending', 'ready']),
    myLabels: z.array(z.object({ optionId: z.string(), tag: z.string(), locked: z.boolean() })),
    pendingOptionIds: z.array(z.string()),
  }),
  reports: z.object({ open: count, byReason: z.record(z.string(), count) }),
  distractorFlags: z.array(
    z.object({
      id: z.string(),
      optionId: z.string(),
      exposures: count,
      choices: count,
      attraction: z.coerce.number(),
      status: z.enum(['open', 'edited', 'kept', 'dismissed']),
    }),
  ),
  sync: z.object({
    origin: z.enum(['sheet', 'import', 'app', 'ai_variant']),
    sourceKey: z.string().nullable(),
    lastRunAt: nullableIso,
    conflictSince: nullableIso,
    missingSince: nullableIso,
  }),
}) satisfies z.ZodType<EditorQuestion>;

export const SaveResultSchema = z.object({
  status: z.literal('saved'),
  questionId: z.string(),
  versionId: z.string(),
  version: count,
  incomplete: z.array(z.string()),
});

export const SubmitResultSchema = z.object({
  status: z.literal('in_review'),
  versionId: z.string(),
  reviewerId: z.string(),
});

export const LabelResultSchema = z.object({
  done: count,
  total: count,
  revealed: z.boolean(),
});

export const DecideResultSchema = z.object({
  status,
  published: z.boolean(),
  waitingCase: z.boolean(),
});

export const ReportRowSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  questionKey: z.string(),
  versionId: z.string(),
  version: count.nullable(),
  reason: z.enum(['clinical_error', 'wrong_key', 'typo', 'outdated', 'other']),
  status: z.enum(['open', 'resolved', 'dismissed']),
  createdAt: iso,
  resolvedAt: nullableIso,
}) satisfies z.ZodType<EditorReportRow>;

export const DistractorFlagSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  questionKey: z.string(),
  versionId: z.string(),
  optionId: z.string(),
  exposures: count,
  choices: count,
  attraction: z.coerce.number(),
  status: z.enum(['open', 'edited', 'kept', 'dismissed']),
  flaggedAt: iso,
  resolvedAt: nullableIso,
  note: z.string().nullable(),
}) satisfies z.ZodType<EditorDistractorFlag>;

/** editor_label_pairs devuelve una tabla, con nombres de columna de SQL */
export const LabelPairRowSchema = z
  .object({
    option_id: z.string(),
    author_tag: z.string(),
    reviewer_tag: z.string(),
    labeled_at: iso,
  })
  .transform((row): LabelPair => ({
    optionId: row.option_id,
    authorTag: row.author_tag,
    reviewerTag: row.reviewer_tag,
    labeledAt: row.labeled_at,
  }));

export const MyReviewsSchema = z.object({
  from: z.string(),
  to: z.string(),
  approved: count,
  changesRequested: count,
  rejected: count,
  reviewed: count,
  distractorsResolved: count,
}) satisfies z.ZodType<MyReviews>;

/** Lo que se hace cuando una rpc responde 42501. Con B9 lleva a la pantalla del segundo factor */
export type ForbiddenHandler = () => void;

/**
 * Llama una rpc del banco y valida su respuesta. Lanza EditorialError con el código de 2.6, o
 * network si la petición ni llegó. onForbidden avisa del 42501 antes de lanzar
 */
export async function callBankRpc<T>(
  cloud: Rpc,
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
  onForbidden?: ForbiddenHandler,
): Promise<T> {
  let reply: { data: unknown; error: { code?: string; details?: string | null } | null };
  try {
    reply = (await cloud.rpc(name, args)) as typeof reply;
  } catch {
    throw new EditorialError('network');
  }
  if (reply.error) {
    const code = editorialCodeOf(reply.error.code);
    if (code === 'forbidden') onForbidden?.();
    throw new EditorialError(code, reply.error.details ?? null);
  }
  const parsed = schema.safeParse(reply.data);
  if (!parsed.success) throw new EditorialError('unknown');
  return parsed.data;
}
