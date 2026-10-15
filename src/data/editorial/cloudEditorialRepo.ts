// Versión de la nube del repositorio editorial (B11, 5.7 del plan de B11). Llama las funciones editor_*
// de Supabase, que revisan rol, segundo factor (B9) y asignación por dentro, y valida cada respuesta.
// Los ids quedan en uuid. Lo único que se convierte es lo que nace en la app. Una opción nueva del
// editor trae un ULID de emptyOption, que la base no conoce, y viaja sin id para que la base le dé uno.
// La pregunta original de una variante puede venir del catálogo del alumno en ULID y viaja en uuid.
import { z } from 'zod';
import { ulidToUuid } from '../cloud/cloudIds';
import {
  callBankRpc,
  DecideResultSchema,
  DistractorFlagSchema,
  EditorListSchema,
  EditorQuestionSchema,
  LabelPairRowSchema,
  LabelResultSchema,
  MyReviewsSchema,
  ReportRowSchema,
  SaveResultSchema,
  SubmitResultSchema,
  type ForbiddenHandler,
  type Rpc,
} from '../cloud/editorial';
import type { QuestionDraft } from '@/features/physician/editorDraft';
import { EditorialError, type EditorialRepo, type EditorReportQuestion } from './editorialRepo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El id en uuid. Acepta uno de la nube o un ULID de la app. null si no es ninguno */
export function cloudIdOf(id: string): string | null {
  return UUID.test(id) ? id.toLowerCase() : ulidToUuid(id);
}

const requireCloudId = (id: string): string => {
  const cloud = cloudIdOf(id);
  if (cloud === null) throw new EditorialError('not_found');
  return cloud;
};

/** Reportes y preguntas de una página de editor_list, de lo más que deja pedir la función */
const LIST_LIMIT = 500;

/**
 * El borrador del editor como lo recibe la base (QuestionDraft con ids uuid). Solo conservan su id las
 * opciones que ya existían en la nube. Las nuevas van con optionId null
 */
export function draftForCloud(draft: QuestionDraft): Record<string, unknown> {
  return {
    ...draft,
    options: draft.options.map((option) => ({
      ...option,
      optionId: UUID.test(option.optionId) ? option.optionId.toLowerCase() : null,
      biasTag: option.isCorrect ? null : option.biasTag,
    })),
  };
}

export interface CloudEditorialOptions {
  /** Se llama con cada 42501. Con B9 lleva a la pantalla del código del segundo factor */
  onForbidden?: ForbiddenHandler;
}

export function createCloudEditorialRepo(
  cloud: Rpc,
  options: CloudEditorialOptions = {},
): EditorialRepo {
  const call = <T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>) =>
    callBankRpc(cloud, name, args, schema, options.onForbidden);

  return {
    kind: 'cloud',

    async list(filter, page) {
      return call(
        'editor_list',
        {
          p_filter: Object.fromEntries(
            Object.entries(filter).filter(([, value]) => value !== undefined && value !== ''),
          ),
          p_limit: page.limit,
          p_offset: page.offset,
        },
        EditorListSchema,
      );
    },

    async question(questionId) {
      return call(
        'editor_question',
        { p_question_id: requireCloudId(questionId) },
        EditorQuestionSchema,
      );
    },

    async createQuestion(draft, variantOf) {
      return call(
        'editor_create_question',
        {
          p_draft: draftForCloud(draft),
          p_variant_of: variantOf === undefined ? null : requireCloudId(variantOf),
        },
        SaveResultSchema,
      );
    },

    async saveVersion(questionId, baseVersionId, draft) {
      return call(
        'editor_save_version',
        {
          p_question_id: requireCloudId(questionId),
          p_base_version_id: requireCloudId(baseVersionId),
          p_draft: draftForCloud(draft),
        },
        SaveResultSchema,
      );
    },

    async submit(versionId) {
      return call('editor_submit', { p_version_id: requireCloudId(versionId) }, SubmitResultSchema);
    },

    async label(versionId, optionId, tag) {
      return call(
        'editor_label_option',
        {
          p_version_id: requireCloudId(versionId),
          p_option_id: requireCloudId(optionId),
          p_tag: tag,
        },
        LabelResultSchema,
      );
    },

    async decide(versionId, decision, comment, checks) {
      return call(
        'editor_decide',
        {
          p_version_id: requireCloudId(versionId),
          p_decision: decision,
          p_comment: comment.trim() === '' ? null : comment.trim(),
          p_checks: [...checks],
        },
        DecideResultSchema,
      );
    },

    async reports() {
      const rows = await call(
        'editor_reports',
        { p_status: 'all', p_limit: LIST_LIMIT, p_offset: 0 },
        z.array(ReportRowSchema),
      );
      // Lo que se muestra de cada pregunta sale de editor_list, que no trae texto más allá del inicio
      const list =
        rows.length === 0
          ? { total: 0, items: [] }
          : await call(
              'editor_list',
              { p_filter: {}, p_limit: LIST_LIMIT, p_offset: 0 },
              EditorListSchema,
            );
      const byId = new Map(list.items.map((item) => [item.questionId, item]));
      const questions = new Map<string, EditorReportQuestion>();
      for (const row of rows) {
        if (questions.has(row.questionId)) continue;
        const item = byId.get(row.questionId);
        questions.set(row.questionId, {
          questionId: row.questionId,
          questionKey: row.questionKey,
          promptPreview: item?.promptPreview ?? null,
          branch: item?.branch ?? null,
          topic: item?.topic ?? null,
          latestVersion: item?.version ?? null,
        });
      }
      return { rows, questions: [...questions.values()], notes: 0 };
    },

    async setReportsStatus(ids, status) {
      return call(
        'editor_set_report_status',
        { p_report_ids: ids.map(requireCloudId), p_status: status },
        z.coerce.number().int().nonnegative(),
      );
    },

    async distractorQueue(status) {
      return call('editor_distractor_queue', { p_status: status }, z.array(DistractorFlagSchema));
    },

    async resolveDistractor(id, resolution, note) {
      await call(
        'editor_resolve_distractor',
        {
          p_flag_id: requireCloudId(id),
          p_resolution: resolution,
          p_note: note === undefined || note.trim() === '' ? null : note.trim(),
        },
        z.string(),
      );
    },

    async labelPairs() {
      return call('editor_label_pairs', {}, z.array(LabelPairRowSchema));
    },

    async myReviews(from, to) {
      return call('editor_my_reviews', { p_from: from, p_to: to }, MyReviewsSchema);
    },

    async resolveSyncConflict(questionId, choice) {
      await call(
        'editor_resolve_sync_conflict',
        { p_question_id: requireCloudId(questionId), p_choice: choice },
        z.string(),
      );
    },
  };
}
