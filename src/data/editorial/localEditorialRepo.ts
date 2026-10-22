// Versión local del repositorio editorial (B11, 5.7 del plan de B11). Trabaja sobre la base de este
// navegador, la de la demo y la de Mi cuenta sin nube, con lo que ya existía (preguntas con versiones,
// labeling.ts y contentReports.ts) y con la misma regla a ciegas que la nube. La etiqueta del autor es
// la que trae el banco y el médico de la demo es el revisor de lo que tiene asignado. Así la demo
// enseña el mismo flujo.
//
// Lo que la base local no guarda y la nube sí, y aquí no se inventa. Las decisiones con su comentario,
// las claves del Sheet, la cola de distractores (llega con B14) y los conflictos con el Sheet. Por eso
// la decisión local solo cambia el estado de la versión y Mis revisiones del mes queda en cero.
import { OPTION_LETTERS } from '../content/bankColumns';
import { versionIssues } from '../content/questionRules';
import type { DataApi } from '../context';
import { newId } from '../ids';
import type { Option, Question } from '../schemas/bank';
import type { Role } from '../schemas/common';
import { saveLabel, TAGGABLE_BIASES } from '../usecases/labeling';
import { setReportsStatus as setLocalReportsStatus } from '../usecases/contentReports';
import type {
  EditorFilter,
  EditorListItem,
  EditorOption,
  EditorPerson,
  EditorQuestion,
  EditorSaveResult,
  EditorVersion,
  LabelPair,
  ReviewState,
} from '../bank/contracts';
import { bankTaxonomy } from '@/features/physician/bankTaxonomy';
import {
  InvalidDraftError,
  saveQuestionVersion,
  StaleVersionError,
} from '@/features/physician/editorActions';
import {
  buildNextVersion,
  checkedStructure,
  validateDraft,
} from '@/features/physician/editorDraft';
import {
  EditorialError,
  type EditorialRepo,
  type EditorReportQuestion,
  type EditorReportRow,
} from './editorialRepo';

type Api = Pick<DataApi, 'repos'>;

export interface LocalViewer {
  /** El perfil con sesión. null sin sesión */
  id: string | null;
  role: Role;
}

const TAGGABLE = new Set(TAGGABLE_BIASES.map((bias) => bias.key));
const PREVIEW = 140;

/**
 * Los pendientes de una versión local, con la misma regla que bank_version_issues. Con el idioma, una
 * pregunta en inglés pide además su fuente del texto con una licencia aceptada (B13, 1.6 del plan de B13),
 * así que sin ella no se manda a revisión ni se aprueba, aunque la demo no traiga textos en inglés
 */
export function localVersionIssues(question: Question, options: readonly Option[]): string[] {
  const positionOf = new Map(options.map((option, index) => [option.id, index]));
  return versionIssues(
    {
      prompt: question.prompt,
      language: question.language,
      explanation: question.explanation,
      refs: question.gpcRefs.map((ref) => ref.title),
      options: options.map((option, index) => ({
        position: index,
        text: option.text,
        isCorrect: option.isCorrect,
        biasTag: option.biasTag,
        rationale: option.rationale,
      })),
      canonicalPositions: question.canonicalOptionIds
        .map((id) => positionOf.get(id))
        .filter((position): position is number => position !== undefined),
    },
    TAGGABLE,
  );
}

const distractorsOf = (options: readonly Option[]) => options.filter((option) => !option.isCorrect);

export function createLocalEditorialRepo(
  api: Api,
  viewer: LocalViewer,
  now: () => Date = () => new Date(),
): EditorialRepo {
  const isPhysician = viewer.role === 'physician';
  /** El médico con sesión. Un médico sin sesión no tiene nada asignado */
  const physician = isPhysician ? viewer.id : null;

  /** Quien llama tiene que ser del equipo. El alumno no ve el banco */
  const requireTeam = () => {
    if (viewer.role === 'student') throw new EditorialError('forbidden');
  };
  /** Solo un médico escribe, etiqueta y decide. El admin y el dueño no editan contenido (1.7) */
  const requirePhysician = (): string => {
    if (physician === null) throw new EditorialError('forbidden');
    return physician;
  };

  const assignedTo = async (questionId: string) =>
    (await api.repos.reviewAssignments.list()).filter(
      (assignment) => assignment.questionId === questionId,
    );

  const requireAssigned = async (questionId: string): Promise<string> => {
    const me = requirePhysician();
    const assignments = await assignedTo(questionId);
    if (!assignments.some((assignment) => assignment.physicianId === me)) {
      throw new EditorialError('not_assigned');
    }
    return me;
  };

  const myLabelsFor = async (me: string | null) =>
    me === null
      ? new Map<string, string>()
      : new Map(
          (await api.repos.biasLabels.list())
            .filter((label) => label.physicianId === me)
            .map((label) => [label.optionId, label.biasTag] as const),
        );

  /** Estado a ciegas de la versión más reciente para quien llama. Solo el médico asignado revisa */
  const reviewStateOf = (
    latest: Question,
    options: readonly Option[],
    assigned: boolean,
    labeled: ReadonlyMap<string, string>,
  ): ReviewState => {
    if (physician === null || !assigned || latest.editorialStatus !== 'in_review') return 'none';
    return distractorsOf(options).every((option) => labeled.has(option.optionId))
      ? 'ready'
      : 'blind_pending';
  };

  /** La versión más reciente de una pregunta, que es la única que se mueve (D-099) */
  const requireLatest = async (versionId: string): Promise<Question> => {
    const version = await api.repos.questions.get(versionId);
    if (!version) throw new EditorialError('not_found');
    const latest = await api.repos.questions.latest(version.questionId);
    if (latest?.id !== version.id) throw new EditorialError('stale');
    return version;
  };

  const personOf = (users: ReadonlyMap<string, string>, id: string): EditorPerson => ({
    id,
    alias: users.get(id) ?? '',
    code: null,
  });

  interface ListContext {
    assigned: ReadonlyMap<string, readonly string[]>;
    aliasOf: ReadonlyMap<string, string>;
    openReports: ReadonlyMap<string, number>;
    labeled: ReadonlyMap<string, string>;
  }

  /** Lo que comparten los renglones de la lista: asignaciones, alias, reportes y mis etiquetas */
  async function listContext(): Promise<ListContext> {
    const [assignments, users, reports, labeled] = await Promise.all([
      api.repos.reviewAssignments.list(),
      api.repos.users.list(),
      api.repos.contentReports.list(),
      myLabelsFor(physician),
    ]);
    const assigned = new Map<string, string[]>();
    for (const assignment of assignments) {
      assigned.set(assignment.questionId, [
        ...(assigned.get(assignment.questionId) ?? []),
        assignment.physicianId,
      ]);
    }
    // Los reportes abiertos por pregunta. Un reporte apunta a una versión
    const openReports = new Map<string, number>();
    const reported = reports.filter(
      (report) => report.targetKind === 'question' && report.status === 'open',
    );
    const owners = await Promise.all(
      reported.map((report) => api.repos.questions.get(report.targetId)),
    );
    for (const version of owners) {
      if (version) {
        openReports.set(version.questionId, (openReports.get(version.questionId) ?? 0) + 1);
      }
    }
    return {
      assigned,
      aliasOf: new Map(users.map((user) => [user.id, user.alias])),
      openReports,
      labeled,
    };
  }

  const visibleTo = (question: Question, context: ListContext) =>
    !isPhysician ||
    (physician !== null && (context.assigned.get(question.questionId) ?? []).includes(physician));

  const itemOf = (
    question: Question,
    options: readonly Option[],
    context: ListContext,
  ): EditorListItem => {
    const physicians = context.assigned.get(question.questionId) ?? [];
    const reviewer = physicians[0];
    return {
      questionId: question.questionId,
      sourceKey: null,
      latestVersionId: question.id,
      version: question.version,
      status: question.editorialStatus,
      publishedVersion: question.editorialStatus === 'approved' ? question.version : null,
      branch: question.branch,
      topic: question.topic,
      subtopic: question.subtopic,
      difficulty: question.physicianDifficulty,
      promptPreview: question.prompt.slice(0, PREVIEW),
      author: null,
      reviewer: reviewer === undefined ? null : personOf(context.aliasOf, reviewer),
      myRole: isPhysician ? 'reviewer' : 'admin',
      reviewState: reviewStateOf(
        question,
        options,
        physician !== null && physicians.includes(physician),
        context.labeled,
      ),
      incomplete: localVersionIssues(question, options),
      flags: [],
      openReports: context.openReports.get(question.questionId) ?? 0,
      openDistractorFlags: 0,
      conflict: false,
      missing: false,
      retireRequested: false,
      retired: false,
      updatedAt: question.createdAt,
    };
  };

  async function listItems(): Promise<EditorListItem[]> {
    requireTeam();
    const [latest, context] = await Promise.all([api.repos.questions.listLatest(), listContext()]);
    return Promise.all(
      latest
        .filter((question) => visibleTo(question, context))
        .map(async (question) =>
          itemOf(question, await api.repos.options.listForQuestionVersion(question.id), context),
        ),
    );
  }

  const matches = (item: EditorListItem, filter: EditorFilter) => {
    if (filter.branch && item.branch !== filter.branch) return false;
    if (filter.topic && item.topic !== filter.topic) return false;
    if (filter.status && item.status !== filter.status) return false;
    switch (filter.view ?? 'all') {
      case 'to_review':
        return item.status === 'in_review' && item.myRole === 'reviewer';
      case 'my_drafts':
        return item.status === 'draft' && item.myRole !== 'admin';
      case 'incomplete':
        return item.incomplete.length > 0;
      case 'reported':
        return item.openReports > 0;
      case 'conflict':
        return item.conflict;
      case 'published':
        return item.publishedVersion !== null;
      case 'all':
        return true;
    }
  };

  const toEditorVersion = (
    question: Question,
    options: readonly Option[],
    hide: boolean,
  ): EditorVersion => ({
    versionId: question.id,
    version: question.version,
    status: question.editorialStatus,
    source: question.variantOf === undefined ? 'app' : 'ai_variant',
    author: null,
    createdAt: question.createdAt,
    submittedAt: null,
    decidedAt: null,
    branch: question.branch,
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: question.physicianDifficulty,
    itemKinds: [...(question.itemKinds ?? [])],
    cognitiveLevel: question.cognitiveLevel ?? null,
    structure: question.structure,
    vignette: question.vignette,
    prompt: question.prompt,
    explanation: question.explanation,
    gpcRefs: question.gpcRefs.map((ref) => ({ ...ref })),
    clues: (question.clues ?? []).map((clue) => ({ ...clue })),
    caseId: question.caseId,
    caseOrder: question.caseOrder,
    variantOf: question.variantOf ?? null,
    canonicalOptionIds: [...question.canonicalOptionIds],
    options: options.map((option, position): EditorOption => {
      const hidden = hide && !option.isCorrect;
      return {
        id: option.id,
        optionId: option.optionId,
        letter: OPTION_LETTERS[position] ?? null,
        position,
        text: option.text,
        isCorrect: option.isCorrect,
        biasTag: hidden ? null : option.biasTag,
        secondaryBiasTags: hidden ? [] : [...option.secondaryBiasTags],
        rationale: hidden ? null : option.rationale,
        hidden,
      };
    }),
    incomplete: localVersionIssues(question, options),
    flags: [],
    decisions: [],
  });

  return {
    kind: 'local',

    async list(filter, page) {
      const items = (await listItems())
        .filter((item) => matches(item, filter))
        .sort(
          (a, b) =>
            b.updatedAt.localeCompare(a.updatedAt) || a.questionId.localeCompare(b.questionId),
        );
      return {
        total: items.length,
        items: items.slice(page.offset, page.offset + page.limit),
      };
    },

    async question(questionId) {
      requireTeam();
      const versions = await api.repos.questions.listVersions(questionId);
      const latest = versions.at(-1);
      if (!latest) throw new EditorialError('not_found');
      const assignments = await assignedTo(questionId);
      const assigned = physician !== null && assignments.some((a) => a.physicianId === physician);
      if (isPhysician && !assigned) throw new EditorialError('not_assigned');
      const optionsByVersion = new Map(
        await Promise.all(
          versions.map(
            async (version) =>
              [version.id, await api.repos.options.listForQuestionVersion(version.id)] as const,
          ),
        ),
      );
      const latestOptions = optionsByVersion.get(latest.id) ?? [];
      const labeled = await myLabelsFor(physician);
      const state = reviewStateOf(latest, latestOptions, assigned, labeled);
      const hide = state === 'blind_pending';
      const item = itemOf(latest, latestOptions, await listContext());
      const reports = (await api.repos.contentReports.list()).filter(
        (report) =>
          report.targetKind === 'question' &&
          report.status === 'open' &&
          versions.some((version) => version.id === report.targetId),
      );
      const byReason: Record<string, number> = {};
      for (const report of reports) byReason[report.reason] = (byReason[report.reason] ?? 0) + 1;
      const linkedCase = latest.caseId ? await api.repos.cases.get(latest.caseId) : undefined;
      const members = linkedCase
        ? (await api.repos.questions.listLatest())
            .filter((entry) => entry.caseId === linkedCase.id)
            .map((entry) => ({
              questionId: entry.questionId,
              caseOrder: entry.caseOrder ?? 0,
              status: entry.editorialStatus,
            }))
            .sort((a, b) => a.caseOrder - b.caseOrder)
        : [];
      const distractors = distractorsOf(latestOptions);
      return {
        question: item,
        versions: [...versions]
          .reverse()
          .map((version) => toEditorVersion(version, optionsByVersion.get(version.id) ?? [], hide)),
        case: linkedCase ? { id: linkedCase.id, vignette: linkedCase.vignette, members } : null,
        review: {
          role: isPhysician ? 'reviewer' : 'admin',
          state,
          myLabels: distractors.flatMap((option) => {
            const tag = labeled.get(option.optionId);
            return tag === undefined
              ? []
              : [{ optionId: option.optionId, tag, locked: state === 'ready' }];
          }),
          pendingOptionIds: hide
            ? distractors
                .filter((option) => !labeled.has(option.optionId))
                .map((option) => option.optionId)
            : [],
        },
        reports: { open: reports.length, byReason },
        distractorFlags: [],
        sync: {
          origin: latest.variantOf === undefined ? 'app' : 'ai_variant',
          sourceKey: null,
          lastRunAt: null,
          conflictSince: null,
          missingSince: null,
        },
      } satisfies EditorQuestion;
    },

    async createQuestion(draft, variantOf) {
      const me = requirePhysician();
      const issues = validateDraft(draft, bankTaxonomy);
      if (issues.length > 0) throw new InvalidDraftError(issues);
      const at = now();
      const questionId = newId();
      const built = buildNextVersion({
        current: {
          id: questionId,
          questionId,
          version: 0,
          caseId: null,
          caseOrder: null,
          vignette: draft.vignette,
          prompt: draft.prompt,
          branch: draft.branch,
          topic: draft.topic,
          subtopic: draft.subtopic,
          structure: { ...checkedStructure(draft), source: 'physician' },
          explanation: draft.explanation,
          gpcRefs: draft.gpcRefs,
          physicianDifficulty: draft.physicianDifficulty,
          canonicalOptionIds: [],
          editorialStatus: 'draft',
          isDemo: false,
          createdAt: at.toISOString(),
        },
        draft,
        newId,
        now: at,
      });
      const question: Question = {
        ...built.question,
        ...(variantOf === undefined ? {} : { variantOf }),
      };
      await api.repos.questions.addVersion(question, built.options);
      await api.repos.reviewAssignments.put({
        id: newId(),
        questionId,
        physicianId: me,
        assignedBy: me,
        assignedAt: at.toISOString(),
      });
      return {
        status: 'saved',
        questionId,
        versionId: question.id,
        version: question.version,
        incomplete: localVersionIssues(question, built.options),
      } satisfies EditorSaveResult;
    },

    async saveVersion(questionId, baseVersionId, draft) {
      await requireAssigned(questionId);
      const base = await api.repos.questions.get(baseVersionId);
      if (base?.questionId !== questionId) throw new EditorialError('not_found');
      try {
        const next = await saveQuestionVersion(api, {
          current: base,
          draft,
          taxonomy: bankTaxonomy,
          now: now(),
        });
        return {
          status: 'saved',
          questionId,
          versionId: next.question.id,
          version: next.question.version,
          incomplete: localVersionIssues(next.question, next.options),
        };
      } catch (error) {
        throw error instanceof StaleVersionError ? new EditorialError('stale') : error;
      }
    },

    async submit(versionId) {
      const version = await requireLatest(versionId);
      const me = await requireAssigned(version.questionId);
      if (version.editorialStatus !== 'draft') throw new EditorialError('invalid');
      const options = await api.repos.options.listForQuestionVersion(version.id);
      const issues = localVersionIssues(version, options);
      if (issues.length > 0) throw new EditorialError('incomplete', issues.join(','));
      await api.repos.questions.setEditorialStatus(version.id, 'in_review');
      return { status: 'in_review', versionId, reviewerId: me };
    },

    async label(versionId, optionId, tag) {
      const version = await requireLatest(versionId);
      const me = await requireAssigned(version.questionId);
      if (version.editorialStatus !== 'in_review') throw new EditorialError('invalid');
      const options = await api.repos.options.listForQuestionVersion(version.id);
      const distractors = distractorsOf(options);
      const option = distractors.find((item) => item.optionId === optionId);
      if (!option) throw new EditorialError('invalid');
      const labeled = await myLabelsFor(me);
      // Al completar los distractores las etiquetas se cierran, como en la nube (1.10)
      if (distractors.every((item) => labeled.has(item.optionId))) {
        throw new EditorialError('blind_labels');
      }
      if (!TAGGABLE.has(tag)) throw new EditorialError('invalid');
      await saveLabel(api, { id: me, role: 'physician' }, option, tag, now());
      labeled.set(optionId, tag);
      const done = distractors.filter((item) => labeled.has(item.optionId)).length;
      return { done, total: distractors.length, revealed: done === distractors.length };
    },

    async decide(versionId, decision, comment, _checks) {
      const version = await requireLatest(versionId);
      const me = await requireAssigned(version.questionId);
      if (version.editorialStatus !== 'in_review') throw new EditorialError('invalid');
      if (decision !== 'approve' && comment.trim() === '') throw new EditorialError('invalid');
      if (decision === 'approve') {
        const options = await api.repos.options.listForQuestionVersion(version.id);
        const labeled = await myLabelsFor(me);
        if (reviewStateOf(version, options, true, labeled) !== 'ready') {
          throw new EditorialError('blind_labels');
        }
        const issues = localVersionIssues(version, options);
        if (issues.length > 0) throw new EditorialError('incomplete', issues.join(','));
      }
      const status =
        decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'draft';
      await api.repos.questions.setEditorialStatus(version.id, status);
      return { status, published: decision === 'approve', waitingCase: false };
    },

    async reports() {
      requireTeam();
      const [reports, assignments] = await Promise.all([
        api.repos.contentReports.list(),
        api.repos.reviewAssignments.list(),
      ]);
      const allowed = !isPhysician
        ? null
        : new Set(
            assignments
              .filter((assignment) => assignment.physicianId === physician)
              .map((assignment) => assignment.questionId),
          );
      const notes = reports.filter((report) => report.targetKind === 'note').length;
      const rows: EditorReportRow[] = [];
      const questions = new Map<string, EditorReportQuestion>();
      for (const report of reports) {
        if (report.targetKind !== 'question') continue;
        const version = await api.repos.questions.get(report.targetId);
        if (!version) continue;
        if (allowed && !allowed.has(version.questionId)) continue;
        if (!questions.has(version.questionId)) {
          const latest = await api.repos.questions.latest(version.questionId);
          if (!latest) continue;
          questions.set(version.questionId, {
            questionId: version.questionId,
            questionKey: version.questionId.slice(0, 8),
            promptPreview: latest.prompt.slice(0, PREVIEW),
            branch: latest.branch,
            topic: latest.topic,
            latestVersion: latest.version,
          });
        }
        rows.push({
          id: report.id,
          questionId: version.questionId,
          questionKey: version.questionId.slice(0, 8),
          versionId: version.id,
          version: version.version,
          reason: report.reason,
          status: report.status,
          createdAt: report.createdAt,
          resolvedAt: report.resolvedAt,
        });
      }
      return { rows, questions: [...questions.values()], notes: isPhysician ? 0 : notes };
    },

    async setReportsStatus(ids, status) {
      requireTeam();
      return setLocalReportsStatus(api, ids, status, now());
    },

    distractorQueue() {
      requireTeam();
      return Promise.resolve([]);
    },

    resolveDistractor() {
      return Promise.reject(new EditorialError('not_found'));
    },

    async labelPairs() {
      requireTeam();
      const [labels, latest] = await Promise.all([
        api.repos.biasLabels.list(),
        api.repos.questions.listLatest(),
      ]);
      // La etiqueta del autor es la que trae la versión más reciente del banco
      const authorTag = new Map<string, string>();
      for (const question of latest) {
        for (const option of await api.repos.options.listForQuestionVersion(question.id)) {
          if (option.biasTag !== null) authorTag.set(option.optionId, option.biasTag);
        }
      }
      return labels
        .flatMap((label): LabelPair[] => {
          const tag = authorTag.get(label.optionId);
          return tag === undefined
            ? []
            : [
                {
                  optionId: label.optionId,
                  authorTag: tag,
                  reviewerTag: label.biasTag,
                  labeledAt: label.labeledAt,
                },
              ];
        })
        .sort((a, b) => a.labeledAt.localeCompare(b.labeledAt));
    },

    myReviews(from, to) {
      requireTeam();
      return Promise.resolve({
        from,
        to,
        approved: 0,
        changesRequested: 0,
        rejected: 0,
        reviewed: 0,
        distractorsResolved: 0,
      });
    },

    resolveSyncConflict() {
      return Promise.reject(new EditorialError('invalid'));
    },
  };
}
