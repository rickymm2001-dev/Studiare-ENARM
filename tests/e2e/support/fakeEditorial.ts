// Las rutas del equipo del banco en la nube para el Supabase simulado de Playwright (B11, paquete C,
// 6.3 del plan de B11). Imita las funciones editor_*, admin_* y owner_* de
// supabase/migrations/20261023000003 a 20261023000005 sobre el modelo en memoria de fakeBankStore.ts,
// con los mismos códigos de error (BK002 a BK011, 42501, 28000 y 22023), la función bank-sync y la subida
// del admin al bucket deck-catalog. fakeSupabase.ts las engancha con attachBank. El alumno vive en
// fakeBank.ts (paquete B).
//
// bank-sync corre de verdad. Contesta 202 con la corrida y sigue en segundo plano con runSync de
// supabase/functions/_shared/bank/sync.ts, el Google de mentira de fakeGoogle.ts y un Sheet de
// tests/fixtures/bank-sheet. Nunca toca Google. En solo reporte guarda los renglones como
// bank_sync_apply sin escribir preguntas, y en apply crea las versiones como bank_apply_row.
//
// Lo que no imita. Los correos al médico (enqueue_email), los candados entre transacciones, la parte del
// banco que lee cada alumno (fakeBank.ts) y el permiso de lectura de Storage (fakeBank.ts). Los alias y los
// roles de las cuentas vienen del directorio que pone la prueba con setEditorialDirectory, porque el
// banco no guarda perfiles. Sin directorio solo conoce a quien llama.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  DeckAdminEntry,
  EditorListItem,
  EditorPerson,
  EditorQuestion,
  EditorVersion,
  ReviewState,
  SyncNoticeCode,
  SyncProblem,
  SyncQuestion,
  SyncRowPayload,
  SyncRowResult,
} from '@/data/bank/contracts';
import type { ServerNoticeCode } from '@/data/cloud/bankAdmin';
import { parsePassageSource } from '@/data/content/passageSource';
import { versionIssues } from '@/data/content/questionRules';
import type { Role } from '@/data/schemas/common';
import { DeckManifestSchema, DECK_PART_MAX_BYTES } from '@/data/schemas/deckCatalog';
import { biasTaxonomy } from '../../../supabase/functions/_shared/bank/generated/biasTaxonomy.ts';
import type { VersionContent } from '../../../supabase/functions/_shared/bank/generated/contentHash.ts';
import {
  createFakeGoogle,
  type FakeSheetFixture,
} from '../../../supabase/functions/_shared/bank/fakeGoogle.ts';
import { createGoogleClient } from '../../../supabase/functions/_shared/bank/google.ts';
import { expectedOutcome } from '../../../supabase/functions/_shared/bank/plan.ts';
import {
  runSync,
  type BankSyncDeps,
  type BeginResult,
  type FinishInput,
} from '../../../supabase/functions/_shared/bank/sync.ts';
import {
  DECK_CATALOG_BUCKET,
  isTeam,
  publishQuestion,
  retireQuestion,
  type BankEditorialRpc,
  type FakeBankCaller,
  type FakeBankOption,
  type FakeBankQuestion,
  type FakeBankReply,
  type FakeBankSettings,
  type FakeBankStore,
  type FakeBankVersion,
  type FakeDeck,
  type FakeDeckSubject,
  type FakeSyncRun,
} from './fakeBankStore';

type Json = Record<string, unknown>;

// ===================================================================== Directorio y estado aparte

/** Una cuenta como la ve el banco. Nunca el correo */
export interface EditorialPerson {
  id: string;
  alias: string;
  role: Role;
}

/** Quién es cada cuenta. La prueba lo arma con cloud.userByEmail, que sigue los cambios de rol */
export type EditorialDirectory = (userId: string) => EditorialPerson | null;

/** Lo que el banco real guarda en bank_questions y aquí no tiene campo en fakeBankStore.ts */
interface SheetTrack {
  rowHash: string | null;
  metaHash: string | null;
  appliedVersionId: string | null;
  forceNext: boolean;
  conflictRowHash: string | null;
  seenAt: string | null;
}

interface EditorialSide {
  directory: EditorialDirectory | null;
  sheet: Map<string, SheetTrack>;
  /** El Sheet de prueba que lee bank-sync, por destino */
  fixtures: { real: FakeSheetFixture; test: FakeSheetFixture };
  /** Las corridas que siguen en segundo plano, para esperarlas desde la prueba */
  pending: Set<Promise<unknown>>;
  sheetHash: Map<string, string>;
}

const FIXTURES = fileURLToPath(new URL('../../fixtures/bank-sheet/', import.meta.url));
const loadFixture = (name: 'antes' | 'despues'): FakeSheetFixture =>
  JSON.parse(readFileSync(`${FIXTURES}${name}.json`, 'utf8')) as FakeSheetFixture;

const sides = new WeakMap<FakeBankStore, EditorialSide>();

function sideOf(store: FakeBankStore): EditorialSide {
  let side = sides.get(store);
  if (!side) {
    const despues = loadFixture('despues');
    side = {
      directory: null,
      sheet: new Map(),
      fixtures: { real: despues, test: despues },
      pending: new Set(),
      sheetHash: new Map(),
    };
    sides.set(store, side);
  }
  return side;
}

/** Pone el directorio de cuentas del banco */
export function setEditorialDirectory(store: FakeBankStore, directory: EditorialDirectory): void {
  sideOf(store).directory = directory;
}

/** Cambia el Sheet que lee bank-sync en un destino. antes y despues son los de tests/fixtures */
export function setSyncSheet(
  store: FakeBankStore,
  target: 'real' | 'test',
  sheet: 'antes' | 'despues',
): void {
  sideOf(store).fixtures[target] = loadFixture(sheet);
}

/** Espera a que terminen las corridas de bank-sync que siguen en segundo plano */
export async function settleSyncRuns(store: FakeBankStore): Promise<void> {
  const side = sideOf(store);
  while (side.pending.size > 0) await Promise.all([...side.pending]);
}

/** Asigna un papel en una pregunta como admin_assign_questions, para sembrar desde la prueba */
export function assignQuestion(
  store: FakeBankStore,
  questionId: string,
  physicianId: string,
  role: 'author' | 'reviewer',
): void {
  const reply = assign(store, questionId, role, physicianId);
  if (reply) throw new Error(`No se pudo asignar ${role}: ${JSON.stringify(replyBody(reply))}`);
}

// ===================================================================== Respuestas

const iso = (store: FakeBankStore) => new Date(store.now()).toISOString();
const ok = (value: unknown): FakeBankReply => ({ status: 200, json: value });

/** Como PostgREST traduce el SQLSTATE a estado HTTP */
function fail(code: string, message: string, details: string | null = null): FakeBankReply {
  const status = code === '42501' || code === '28000' ? 403 : 400;
  return { status, json: { code, message, details, hint: null } };
}

const replyBody = (reply: FakeBankReply): unknown => ('json' in reply ? reply.json : reply.status);

class Raise extends Error {
  readonly reply: FakeBankReply;
  constructor(reply: FakeBankReply) {
    super(JSON.stringify(replyBody(reply)));
    this.reply = reply;
  }
}
const raise = (code: string, message: string, details: string | null = null): never => {
  throw new Raise(fail(code, message, details));
};

const isAdmin = (caller: FakeBankCaller) => caller.role === 'admin' || caller.role === 'owner';

function requireTeam(caller: FakeBankCaller): void {
  if (!isTeam(caller)) raise('42501', 'Solo el equipo médico');
}
function requireAdmin(caller: FakeBankCaller): void {
  if (!isAdmin(caller)) raise('42501', 'Solo un administrador');
}
function requirePhysician(caller: FakeBankCaller, message: string): void {
  requireTeam(caller);
  if (caller.role !== 'physician') raise('42501', message);
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const isRecord = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Un uuid estable para una llave, como stable_bank_uuid */
function stableUuid(namespace: string, key: string): string {
  const hex = createHash('sha256').update(`${namespace}|${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ===================================================================== Personas y asignaciones

function personOf(store: FakeBankStore, caller: FakeBankCaller, id: string): EditorialPerson {
  if (id === caller.userId) return { id, alias: caller.alias, role: caller.role };
  return sideOf(store).directory?.(id) ?? { id, alias: '', role: 'student' };
}

function editorPerson(
  store: FakeBankStore,
  caller: FakeBankCaller,
  id: string | null,
): EditorPerson | null {
  if (id === null) return null;
  return {
    id,
    alias: personOf(store, caller, id).alias,
    code: store.physicianCodes.get(id) ?? null,
  };
}

function assignee(
  store: FakeBankStore,
  questionId: string,
  role: 'author' | 'reviewer',
): string | null {
  return (
    store.assignments.find(
      (item) => item.questionId === questionId && item.role === role && item.revokedAt === null,
    )?.physicianId ?? null
  );
}

const assigned = (store: FakeBankStore, questionId: string, userId: string) =>
  store.assignments.some(
    (item) =>
      item.questionId === questionId && item.physicianId === userId && item.revokedAt === null,
  );

const canSee = (store: FakeBankStore, caller: FakeBankCaller, questionId: string) =>
  isAdmin(caller) || assigned(store, questionId, caller.userId);

/** bank_assign. Devuelve el error BK003 en lugar de lanzarlo, para las siembras */
function assign(
  store: FakeBankStore,
  questionId: string,
  role: 'author' | 'reviewer',
  physicianId: string | null,
  by: string | null = null,
): FakeBankReply | null {
  if (physicianId === null) return null;
  const at = iso(store);
  const current = store.assignments.find(
    (item) => item.questionId === questionId && item.physicianId === physicianId,
  );
  if (current?.revokedAt === null && current.role === role) return null;
  if (current?.revokedAt === null && current.role !== role) {
    return fail('BK003', 'Autor y revisor tienen que ser distintos');
  }
  for (const item of store.assignments) {
    if (item.questionId === questionId && item.role === role && item.revokedAt === null) {
      item.revokedAt = at;
    }
  }
  if (current) {
    current.role = role;
    current.assignedAt = at;
    current.revokedAt = null;
    current.assignedBy = by;
  } else {
    store.assignments.push({
      questionId,
      physicianId,
      role,
      assignedAt: at,
      revokedAt: null,
      assignedBy: by,
    });
  }
  return null;
}

/** El papel vigente lo asignó un admin o el dueño y no es el del Sheet, como bank_admin_assigned_other */
function adminAssignedOther(
  store: FakeBankStore,
  questionId: string,
  role: 'author' | 'reviewer',
  physicianId: string,
): boolean {
  return store.assignments.some(
    (item) =>
      item.questionId === questionId &&
      item.role === role &&
      item.revokedAt === null &&
      item.physicianId !== physicianId &&
      item.assignedBy != null &&
      ['admin', 'owner'].includes(sideOf(store).directory?.(item.assignedBy)?.role ?? ''),
  );
}

function assignOrRaise(
  store: FakeBankStore,
  questionId: string,
  role: 'author' | 'reviewer',
  physicianId: string | null,
  by: string | null = null,
): void {
  const reply = assign(store, questionId, role, physicianId, by);
  if (reply) throw new Raise(reply);
}

// ===================================================================== Versiones

const TAGGABLE: ReadonlySet<string> = new Set(
  biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key),
);

/**
 * bank_version_issues, con la misma regla que la app (questionRules.ts). Una pregunta en inglés pide además
 * su fuente del texto con una licencia aceptada (B13, 1.6 y EN4 a EN6 de la prueba SQL), igual que la
 * función de la migración 20261027000001
 */
function issuesOf(version: FakeBankVersion): string[] {
  const issues = baseIssuesOf(version);
  if (version.language === 'en') {
    const source = parsePassageSource(version.gpcRefs);
    if (!source.ok && !issues.includes(source.issue)) issues.push(source.issue);
  }
  return issues;
}

function baseIssuesOf(version: FakeBankVersion): string[] {
  const position = new Map(version.options.map((option) => [option.id, option.position]));
  return versionIssues(
    {
      prompt: version.prompt,
      task: version.task,
      explanation: version.explanation,
      refs: version.gpcRefs.map((ref) => ref.title),
      options: version.options.map((option) => ({
        position: option.position,
        letter: option.letter,
        text: option.text,
        isCorrect: option.isCorrect,
        biasTag: option.biasTag,
        rationale: option.rationale,
      })),
      canonicalPositions: version.canonicalOptionIds.flatMap((id) => {
        const at = position.get(id);
        return at === undefined ? [] : [at];
      }),
    },
    TAGGABLE,
  );
}

function questionOf(store: FakeBankStore, questionId: string): FakeBankQuestion {
  const question = store.questions.get(questionId);
  if (!question) return raise('22023', 'La pregunta no existe');
  return question;
}

function versionOf(store: FakeBankStore, versionId: string): FakeBankVersion {
  const version = store.versions.get(versionId);
  if (!version) return raise('22023', 'La versión no existe');
  return version;
}

const latestOf = (store: FakeBankStore, question: FakeBankQuestion) =>
  versionOf(store, question.latestVersionId);

const distractors = (version: FakeBankVersion) =>
  version.options.filter((option) => !option.isCorrect);

/** bank_review_state */
function reviewState(store: FakeBankStore, version: FakeBankVersion, userId: string): ReviewState {
  if (
    version.status !== 'in_review' ||
    assignee(store, version.questionId, 'reviewer') !== userId
  ) {
    return 'none';
  }
  const locked = new Set(
    store.labels
      .filter((label) => label.labelerId === userId && label.lockedAt !== null)
      .map((label) => label.optionId),
  );
  return distractors(version).every((option) => locked.has(option.optionId))
    ? 'ready'
    : 'blind_pending';
}

/** bank_reviewer_blind. El revisor activo sin sus etiquetas cerradas en cada distractor de la versión */
function reviewerBlind(store: FakeBankStore, version: FakeBankVersion, userId: string): boolean {
  if (assignee(store, version.questionId, 'reviewer') !== userId) return false;
  const locked = new Set(
    store.labels
      .filter((label) => label.labelerId === userId && label.lockedAt !== null)
      .map((label) => label.optionId),
  );
  return distractors(version).some((option) => !locked.has(option.optionId));
}

/** bank_question_key */
const questionKey = (store: FakeBankStore, questionId: string) =>
  store.questions.get(questionId)?.sourceKey?.replace(/^[a-z_]+:/, '') ?? questionId.slice(0, 8);

const versionNumberOf = (store: FakeBankStore, versionId: string | null) =>
  versionId === null ? null : (store.versions.get(versionId)?.version ?? null);

/** bank_list_item */
function listItem(
  store: FakeBankStore,
  caller: FakeBankCaller,
  question: FakeBankQuestion,
): EditorListItem {
  const latest = latestOf(store, question);
  const reviewer = assignee(store, question.questionId, 'reviewer');
  return {
    questionId: question.questionId,
    sourceKey: question.sourceKey,
    latestVersionId: latest.id,
    version: latest.version,
    status: latest.status,
    publishedVersion: versionNumberOf(store, question.publishedVersionId),
    branch: latest.branch,
    topic: latest.topic,
    subtopic: latest.subtopic,
    difficulty: latest.difficulty,
    promptPreview: latest.prompt.slice(0, 140),
    author: editorPerson(store, caller, assignee(store, question.questionId, 'author')),
    reviewer: editorPerson(store, caller, reviewer),
    myRole: isAdmin(caller) ? 'admin' : reviewer === caller.userId ? 'reviewer' : 'author',
    reviewState: reviewState(store, latest, caller.userId),
    incomplete: [...latest.incomplete],
    flags: [...latest.flags],
    openReports: store.reports.filter(
      (report) => report.questionId === question.questionId && report.status === 'open',
    ).length,
    openDistractorFlags: store.distractorFlags.filter(
      (flag) => flag.questionId === question.questionId && flag.status === 'open',
    ).length,
    conflict: question.conflictSince !== null,
    missing: question.missingSince !== null,
    retireRequested: question.retireRequestedAt !== null,
    retired: question.status === 'retired',
    updatedAt: question.updatedAt,
  };
}

/** bank_version_json */
function versionJson(
  store: FakeBankStore,
  caller: FakeBankCaller,
  version: FakeBankVersion,
  hide: boolean,
): EditorVersion {
  return {
    versionId: version.id,
    version: version.version,
    status: version.status,
    source: version.source,
    author: editorPerson(store, caller, version.authorId),
    createdAt: version.createdAt,
    submittedAt: version.submittedAt,
    decidedAt: version.decidedAt,
    branch: version.branch,
    topic: version.topic,
    subtopic: version.subtopic,
    difficulty: version.difficulty,
    itemKinds: [...version.itemKinds],
    structure: {
      polarity: version.polarity,
      task: version.task,
      format: version.format,
      source: version.structureSource,
    },
    vignette: version.vignette,
    prompt: version.prompt,
    explanation: version.explanation,
    gpcRefs: version.gpcRefs.map((ref) => ({ ...ref })),
    clues: version.clues.map((clue) => ({ ...clue })),
    caseId: version.caseId,
    caseOrder: version.caseOrder,
    variantOf: version.variantOf,
    canonicalOptionIds: [...version.canonicalOptionIds],
    options: [...version.options]
      .sort((a, b) => a.position - b.position)
      .map((option) => {
        const hidden = hide && !option.isCorrect;
        return {
          id: option.id,
          optionId: option.optionId,
          letter: option.letter,
          position: option.position,
          text: option.text,
          isCorrect: option.isCorrect,
          biasTag: hidden ? null : option.biasTag,
          secondaryBiasTags: hidden ? [] : [...option.secondaryBiasTags],
          rationale: hidden ? null : option.rationale,
          hidden,
        };
      }),
    incomplete: [...version.incomplete],
    flags: [...version.flags],
    decisions: store.decisions
      .filter((decision) => decision.versionId === version.id)
      .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
      .map((decision) => ({
        physician: {
          id: decision.physicianId,
          alias: personOf(store, caller, decision.physicianId).alias,
        },
        decision: decision.decision,
        comment: decision.comment,
        decidedAt: decision.decidedAt,
      })),
  };
}

const TASKS = new Set([
  'diagnosis',
  'next_step',
  'initial_study',
  'confirmatory_study',
  'initial_treatment',
  'treatment_of_choice',
  'mechanism',
  'risk_factor',
  'complication_prognosis',
  'prevention_screening',
  'data_interpretation',
]);

interface VersionInput {
  questionId: string;
  content: Json;
  source: FakeBankVersion['source'];
  authorId: string | null;
  caseId: string | null;
  caseOrder: number | null;
  variantOf: string | null;
  flags: string[];
  incomplete: string[] | null;
}

/** bank_check_content y bank_insert_version. Devuelve la versión nueva, ya guardada */
function insertVersion(store: FakeBankStore, input: VersionInput): FakeBankVersion {
  const { content } = input;
  const options = Array.isArray(content.options) ? content.options.filter(isRecord) : [];
  const difficulty = Number(content.difficulty);
  if (
    typeof content.branch !== 'string' ||
    typeof content.topic !== 'string' ||
    typeof content.subtopic !== 'string' ||
    ![1, 2, 3, 4, 5].includes(difficulty) ||
    !['affirmative', 'negative'].includes(String(content.polarity)) ||
    // Sin tarea entra como pendiente task_undetected, como bank_check_content
    !(
      content.task === '' ||
      content.task === null ||
      (typeof content.task === 'string' && TASKS.has(content.task))
    ) ||
    !['clinical_case', 'direct', 'serial_case'].includes(String(content.format)) ||
    options.length < 2 ||
    options.length > 10 ||
    options.some((option) => (str(option.text) ?? '').trim() === '')
  ) {
    raise('22023', 'El borrador no tiene la forma esperada');
  }
  const id = randomUUID();
  const version =
    Math.max(
      0,
      ...[...store.versions.values()]
        .filter((item) => item.questionId === input.questionId)
        .map((item) => item.version),
    ) + 1;
  const built: FakeBankOption[] = options.map((option, position) => {
    const isCorrect = option.isCorrect === true;
    return {
      id: randomUUID(),
      optionId: str(option.optionId) ?? randomUUID(),
      letter: str(option.letter),
      position,
      text: (str(option.text) ?? '').trim(),
      isCorrect,
      biasTag: isCorrect || str(option.biasTag) === '' ? null : str(option.biasTag),
      secondaryBiasTags: isCorrect ? [] : strings(option.secondaryBiasTags),
      rationale: (str(option.rationale) ?? '').trim(),
    };
  });
  const record: FakeBankVersion = {
    id,
    questionId: input.questionId,
    version,
    status: 'draft',
    source: input.source,
    authorId: input.authorId,
    branch: String(content.branch),
    topic: String(content.topic),
    subtopic: String(content.subtopic),
    difficulty,
    itemKinds: strings(content.itemKinds),
    polarity: content.polarity === 'negative' ? 'negative' : 'affirmative',
    task: typeof content.task === 'string' ? content.task : '',
    format:
      content.format === 'serial_case'
        ? 'serial_case'
        : content.format === 'direct'
          ? 'direct'
          : 'clinical_case',
    structureSource: content.structureSource === 'physician' ? 'physician' : 'auto',
    caseId: input.caseId,
    caseOrder: input.caseOrder,
    variantOf: input.variantOf,
    language: content.language === 'en' ? 'en' : 'es',
    vignette: str(content.vignette) ?? '',
    prompt: str(content.prompt) ?? '',
    explanation: str(content.explanation) ?? '',
    gpcRefs: (Array.isArray(content.gpcRefs) ? content.gpcRefs.filter(isRecord) : []).map(
      (ref) => ({
        title: str(ref.title) ?? '',
        status: ref.status === 'verified' ? 'verified' : 'to_verify',
      }),
    ),
    clues: (Array.isArray(content.clues) ? content.clues.filter(isRecord) : []).map((clue) => ({
      text: str(clue.text) ?? '',
      strength:
        clue.strength === 'pathognomonic'
          ? 'pathognomonic'
          : clue.strength === 'characteristic'
            ? 'characteristic'
            : 'nonspecific',
    })),
    canonicalOptionIds: built
      .filter((_, index) => options[index]?.canonical === true)
      .map((option) => option.id),
    options: built,
    incomplete: [],
    flags: [...input.flags],
    createdAt: iso(store),
    submittedAt: null,
    decidedAt: null,
  };
  record.incomplete = input.incomplete ?? issuesOf(record);
  store.versions.set(id, record);
  return record;
}

/** bank_draft_content. Las opciones que ya eran de la pregunta conservan su id estable */
function draftContent(store: FakeBankStore, draft: unknown, questionId: string | null): Json {
  if (!isRecord(draft) || !Array.isArray(draft.options) || !isRecord(draft.structure)) {
    return raise('22023', 'El borrador no tiene la forma esperada');
  }
  const known = new Set(
    questionId === null
      ? []
      : [...store.versions.values()]
          .filter((version) => version.questionId === questionId)
          .flatMap((version) => version.options.map((option) => option.optionId)),
  );
  for (const option of draft.options.filter(isRecord)) {
    const id = str(option.optionId);
    if (id && !known.has(id)) raise('22023', 'Una opción no es de esta pregunta');
  }
  return {
    branch: draft.branch,
    topic: draft.topic,
    subtopic: draft.subtopic,
    difficulty: draft.physicianDifficulty,
    itemKinds: draft.itemKinds ?? [],
    polarity: draft.structure.polarity,
    task: draft.structure.task,
    format: draft.structure.format,
    structureSource: 'physician',
    language: draft.language ?? 'es',
    vignette: draft.vignette ?? '',
    prompt: draft.prompt ?? '',
    explanation: draft.explanation ?? '',
    gpcRefs: draft.gpcRefs ?? [],
    clues: draft.clues ?? [],
    options: draft.options,
  };
}

const saveResult = (version: FakeBankVersion) => ({
  status: 'saved',
  questionId: version.questionId,
  versionId: version.id,
  version: version.version,
  incomplete: [...version.incomplete],
});

/** bank_publish con la espera del caso seriado (1.6) */
function publish(store: FakeBankStore, questionId: string): 'published' | 'waiting_case' {
  const latestApproved = [...store.versions.values()]
    .filter((item) => item.questionId === questionId && item.status === 'approved')
    .sort((a, b) => b.version - a.version)[0];
  if (latestApproved?.caseId) {
    const caseId = latestApproved.caseId;
    const members = [...store.questions.values()].filter(
      (question) =>
        question.status === 'active' &&
        store.versions.get(question.latestVersionId)?.caseId === caseId,
    );
    const waiting = members.some(
      (member) =>
        ![...store.versions.values()].some(
          (item) =>
            item.questionId === member.questionId &&
            item.status === 'approved' &&
            item.caseId === caseId,
        ),
    );
    if (waiting) return 'waiting_case';
    for (const member of members) publishQuestion(store, member.questionId);
    return 'published';
  }
  publishQuestion(store, questionId);
  return 'published';
}

/** bank_send_to_review. Devuelve el revisor */
function sendToReview(store: FakeBankStore, version: FakeBankVersion): string {
  if (store.decisions.some((decision) => decision.versionId === version.id)) {
    raise('22023', 'Ya se decidió sobre esta versión. Los cambios van en una versión nueva');
  }
  const issues = issuesOf(version);
  if (issues.length > 0) raise('BK005', 'La versión tiene pendientes', issues.join(','));
  let reviewer = assignee(store, version.questionId, 'reviewer');
  const author = assignee(store, version.questionId, 'author');
  if (reviewer === null) {
    // Solo si sigue siendo médico, como el join con user_roles de bank_send_to_review
    const saved = store.topicReviewers.get(`${version.branch}/${version.topic}`) ?? null;
    const fallback =
      saved !== null && sideOf(store).directory?.(saved)?.role === 'physician' ? saved : null;
    if (fallback !== null && fallback !== version.authorId && fallback !== author) {
      assignOrRaise(store, version.questionId, 'reviewer', fallback);
      reviewer = fallback;
    }
  }
  if (reviewer !== null && reviewer === version.authorId) {
    // El revisor editó la pregunta. La revisa el autor asignado, que cambia de papel con él
    if (author === null || author === version.authorId) {
      raise('BK003', 'Hace falta otro médico para revisar esta versión');
    }
    for (const item of store.assignments) {
      if (item.questionId !== version.questionId || item.revokedAt !== null) continue;
      if (item.physicianId === reviewer) item.role = 'author';
      else if (item.physicianId === author) item.role = 'reviewer';
    }
    reviewer = author;
  }
  if (reviewer === null) raise('BK003', 'La pregunta no tiene revisor distinto del autor');
  version.status = 'in_review';
  version.submittedAt = iso(store);
  questionOf(store, version.questionId).updatedAt = iso(store);
  return reviewer as string;
}

// ===================================================================== Funciones del editor

type Handler = (store: FakeBankStore, caller: FakeBankCaller, args: Json) => unknown;

const VIEWS = new Set([
  'to_review',
  'my_drafts',
  'incomplete',
  'reported',
  'conflict',
  'published',
  'all',
]);

const pageOf = (args: Json, fallback: number, max: number) => ({
  limit: Math.min(Math.max(Number(args.p_limit ?? fallback) || fallback, 1), max),
  offset: Math.max(Number(args.p_offset ?? 0) || 0, 0),
});

const editorList: Handler = (store, caller, args) => {
  requireTeam(caller);
  const filter = isRecord(args.p_filter) ? args.p_filter : {};
  const view = str(filter.view) ?? 'all';
  if (!VIEWS.has(view)) raise('22023', 'Filtro desconocido');
  const visible = [...store.questions.values()].filter((question) => {
    const latest = store.versions.get(question.latestVersionId);
    if (!latest || !canSee(store, caller, question.questionId)) return false;
    if (filter.branch && latest.branch !== filter.branch) return false;
    if (filter.topic && latest.topic !== filter.topic) return false;
    if (filter.status && latest.status !== filter.status) return false;
    switch (view) {
      case 'to_review':
        return (
          latest.status === 'in_review' &&
          assignee(store, question.questionId, 'reviewer') === caller.userId
        );
      case 'my_drafts':
        return (
          latest.status === 'draft' &&
          assignee(store, question.questionId, 'author') === caller.userId
        );
      case 'incomplete':
        return latest.incomplete.length > 0;
      case 'reported':
        return store.reports.some(
          (report) => report.questionId === question.questionId && report.status === 'open',
        );
      case 'conflict':
        return question.conflictSince !== null;
      case 'published':
        return question.publishedVersionId !== null;
      default:
        return true;
    }
  });
  visible.sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.questionId.localeCompare(b.questionId),
  );
  const { limit, offset } = pageOf(args, 50, 500);
  return {
    total: visible.length,
    items: visible
      .slice(offset, offset + limit)
      .map((question) => listItem(store, caller, question)),
  };
};

const editorQuestion: Handler = (store, caller, args) => {
  requireTeam(caller);
  const questionId = str(args.p_question_id) ?? '';
  const question = questionOf(store, questionId);
  if (!canSee(store, caller, questionId)) raise('BK007', 'No tienes asignada esta pregunta');
  const latest = latestOf(store, question);
  const reviewer = assignee(store, questionId, 'reviewer');
  const myRole = isAdmin(caller)
    ? 'admin'
    : reviewer === caller.userId
      ? 'reviewer'
      : assignee(store, questionId, 'author') === caller.userId
        ? 'author'
        : 'none';
  const state = reviewState(store, latest, caller.userId);
  const hide = myRole === 'reviewer' && reviewerBlind(store, latest, caller.userId);
  const mine = new Map(
    store.labels
      .filter((label) => label.labelerId === caller.userId)
      .map((label) => [label.optionId, label] as const),
  );
  const caseRow = latest.caseId ? store.cases.get(latest.caseId) : undefined;
  const openReports = store.reports.filter(
    (report) => report.questionId === questionId && report.status === 'open',
  );
  const byReason: Record<string, number> = {};
  for (const report of openReports) byReason[report.reason] = (byReason[report.reason] ?? 0) + 1;
  const ordered = [...latest.options].sort((a, b) => a.position - b.position);
  const result: EditorQuestion = {
    question: listItem(store, caller, question),
    versions: [...store.versions.values()]
      .filter((version) => version.questionId === questionId)
      .sort((a, b) => b.version - a.version)
      .map((version) => versionJson(store, caller, version, hide)),
    case: caseRow
      ? {
          id: caseRow.id,
          vignette: caseRow.vignette,
          members: [...store.questions.values()]
            .flatMap((member) => {
              const version = store.versions.get(member.latestVersionId);
              return version?.caseId === caseRow.id
                ? [
                    {
                      questionId: member.questionId,
                      caseOrder: version.caseOrder ?? 0,
                      status: version.status,
                    },
                  ]
                : [];
            })
            .sort((a, b) => a.caseOrder - b.caseOrder),
        }
      : null,
    review: {
      role: myRole,
      state,
      myLabels: ordered.flatMap((option) => {
        const label = mine.get(option.optionId);
        return label
          ? [{ optionId: option.optionId, tag: label.tag, locked: label.lockedAt !== null }]
          : [];
      }),
      // Los distractores sin etiqueta del revisor, cerrada o no, como editor_question
      pendingOptionIds: hide
        ? ordered
            .filter((option) => !option.isCorrect && !mine.has(option.optionId))
            .map((option) => option.optionId)
        : [],
    },
    reports: { open: openReports.length, byReason },
    distractorFlags: store.distractorFlags
      .filter((flag) => flag.questionId === questionId)
      .map((flag) => ({
        id: flag.id,
        optionId: flag.optionId,
        exposures: flag.exposures,
        choices: flag.choices,
        attraction: flag.attraction,
        status: flag.status,
      })),
    sync: {
      origin: question.origin,
      sourceKey: question.sourceKey,
      lastRunAt: sideOf(store).sheet.get(questionId)?.seenAt ?? null,
      conflictSince: question.conflictSince,
      missingSince: question.missingSince,
    },
  };
  return result;
};

const editorCreateQuestion: Handler = (store, caller, args) => {
  requirePhysician(caller, 'Solo un médico escribe preguntas');
  const variantOf = str(args.p_variant_of);
  if (variantOf !== null && !store.questions.has(variantOf)) {
    raise('22023', 'La pregunta original no existe');
  }
  const questionId = randomUUID();
  const origin = variantOf === null ? 'app' : 'ai_variant';
  const version = insertVersion(store, {
    questionId,
    content: draftContent(store, args.p_draft, null),
    source: origin,
    authorId: caller.userId,
    caseId: null,
    caseOrder: null,
    variantOf,
    flags: [],
    incomplete: null,
  });
  const at = iso(store);
  store.questions.set(questionId, {
    questionId,
    origin,
    sourceKey: null,
    latestVersionId: version.id,
    publishedVersionId: null,
    status: 'active',
    retireRequestedAt: null,
    conflictSince: null,
    missingSince: null,
    createdAt: at,
    updatedAt: at,
  });
  assignOrRaise(store, questionId, 'author', caller.userId);
  return saveResult(version);
};

const editorSaveVersion: Handler = (store, caller, args) => {
  requirePhysician(caller, 'Solo un médico escribe preguntas');
  const questionId = str(args.p_question_id) ?? '';
  const question = questionOf(store, questionId);
  if (!assigned(store, questionId, caller.userId)) {
    raise('BK007', 'No tienes asignada esta pregunta');
  }
  if (question.latestVersionId !== str(args.p_base_version_id)) {
    raise('BK002', 'Alguien más guardó o sincronizó una versión nueva');
  }
  if (reviewerBlind(store, latestOf(store, question), caller.userId)) {
    raise('BK004', 'Etiqueta a ciegas antes de editar');
  }
  const base = latestOf(store, question);
  const version = insertVersion(store, {
    questionId,
    content: draftContent(store, args.p_draft, questionId),
    source: 'app',
    authorId: caller.userId,
    caseId: base.caseId,
    caseOrder: base.caseOrder,
    variantOf: base.variantOf,
    flags: [],
    incomplete: null,
  });
  question.latestVersionId = version.id;
  question.updatedAt = iso(store);
  return saveResult(version);
};

const editorSubmit: Handler = (store, caller, args) => {
  requirePhysician(caller, 'Solo un médico manda preguntas a revisión');
  const version = versionOf(store, str(args.p_version_id) ?? '');
  if (!assigned(store, version.questionId, caller.userId)) {
    raise('BK007', 'No tienes asignada esta pregunta');
  }
  if (questionOf(store, version.questionId).latestVersionId !== version.id) {
    raise('BK002', 'Solo se manda la versión más reciente');
  }
  if (version.status !== 'draft') raise('22023', 'Solo un borrador va a revisión');
  const reviewerId = sendToReview(store, version);
  return { status: 'in_review', versionId: version.id, reviewerId };
};

const editorLabelOption: Handler = (store, caller, args) => {
  requirePhysician(caller, 'Solo un médico etiqueta');
  const version = store.versions.get(str(args.p_version_id) ?? '');
  if (version?.status !== 'in_review') raise('22023', 'La versión no está en revisión');
  const current = version as FakeBankVersion;
  if (assignee(store, current.questionId, 'reviewer') !== caller.userId) {
    raise('BK007', 'No eres el revisor de esta pregunta');
  }
  if (current.authorId === caller.userId)
    raise('BK003', 'Autor y revisor tienen que ser distintos');
  const optionId = str(args.p_option_id) ?? '';
  const option = distractors(current).find((item) => item.optionId === optionId);
  if (!option) raise('22023', 'La opción no es un distractor de esta versión');
  const tag = str(args.p_tag) ?? '';
  if (!TAGGABLE.has(tag)) raise('22023', 'Etiqueta desconocida');
  const existing = store.labels.find(
    (label) => label.optionId === optionId && label.labelerId === caller.userId,
  );
  if (existing?.lockedAt) raise('BK004', 'La etiqueta ya está cerrada');
  const at = iso(store);
  if (existing) {
    existing.tag = tag;
    existing.authorTag = option?.biasTag ?? null;
    existing.versionId = current.id;
    existing.labeledAt = at;
  } else {
    store.labels.push({
      optionId,
      labelerId: caller.userId,
      versionId: current.id,
      tag,
      authorTag: option?.biasTag ?? null,
      labeledAt: at,
      lockedAt: null,
    });
  }
  const ids = new Set(distractors(current).map((item) => item.optionId));
  const mine = store.labels.filter(
    (label) => label.labelerId === caller.userId && ids.has(label.optionId),
  );
  const done = mine.length;
  const total = ids.size;
  if (done === total) {
    for (const label of mine) label.lockedAt ??= at;
  }
  return { done, total, revealed: done === total };
};

const editorDecide: Handler = (store, caller, args) => {
  requirePhysician(caller, 'Solo un médico revisor decide');
  const decision = str(args.p_decision);
  if (decision !== 'approve' && decision !== 'request_changes' && decision !== 'reject') {
    return raise('22023', 'Decisión desconocida');
  }
  const version = versionOf(store, str(args.p_version_id) ?? '');
  if (assignee(store, version.questionId, 'reviewer') !== caller.userId) {
    raise('BK007', 'No eres el revisor de esta pregunta');
  }
  if (version.status !== 'in_review') raise('22023', 'La versión no está en revisión');
  const question = questionOf(store, version.questionId);
  if (question.latestVersionId !== version.id) raise('BK002', 'Ya hay una versión más reciente');
  if (version.authorId === caller.userId)
    raise('BK003', 'Autor y revisor tienen que ser distintos');
  const comment = (str(args.p_comment) ?? '').trim();
  if (decision !== 'approve' && comment === '') {
    raise('22023', 'Pedir cambios o rechazar lleva comentario');
  }
  if (comment.length > 2000) raise('22023', 'El comentario es muy largo');
  const checks = strings(args.p_checks);
  if (decision === 'approve') {
    if (reviewState(store, version, caller.userId) !== 'ready') {
      raise('BK004', 'Falta etiquetar a ciegas');
    }
    if (issuesOf(version).length > 0) raise('BK005', 'La versión tiene pendientes');
    const missing = version.flags.find((flag) => !checks.includes(flag));
    if (missing !== undefined) raise('BK008', 'Faltan casillas por confirmar', missing);
  }
  const at = iso(store);
  store.decisions.push({
    id: randomUUID(),
    versionId: version.id,
    questionId: version.questionId,
    version: version.version,
    physicianId: caller.userId,
    decision,
    comment: comment === '' ? null : comment,
    checks,
    decidedAt: at,
  });
  version.status =
    decision === 'approve' ? 'approved' : decision === 'request_changes' ? 'draft' : 'rejected';
  version.decidedAt = at;
  question.updatedAt = at;
  const published = decision === 'approve' ? publish(store, version.questionId) : null;
  return {
    status: version.status,
    published: published === 'published',
    waitingCase: published === 'waiting_case',
  };
};

const editorReports: Handler = (store, caller, args) => {
  requireTeam(caller);
  const status = str(args.p_status) ?? 'open';
  if (!['open', 'resolved', 'dismissed', 'all'].includes(status)) {
    raise('22023', 'Estado desconocido');
  }
  const { limit, offset } = pageOf(args, 50, 500);
  return store.reports
    .filter(
      (report) =>
        report.questionId !== null &&
        canSee(store, caller, report.questionId) &&
        (status === 'all' || report.status === status),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .slice(offset, offset + limit)
    .map((report) => ({
      id: report.id,
      questionId: report.questionId,
      versionId: report.versionId,
      version: versionNumberOf(store, report.versionId),
      questionKey: questionKey(store, report.questionId ?? ''),
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
    }));
};

const editorSetReportStatus: Handler = (store, caller, args) => {
  requireTeam(caller);
  const status = str(args.p_status);
  if (status !== 'open' && status !== 'resolved' && status !== 'dismissed') {
    return raise('22023', 'Estado desconocido');
  }
  const ids = new Set(strings(args.p_report_ids));
  let changed = 0;
  for (const report of store.reports) {
    if (
      !ids.has(report.id) ||
      report.questionId === null ||
      !canSee(store, caller, report.questionId) ||
      report.status === status
    ) {
      continue;
    }
    report.status = status;
    report.resolvedAt = status === 'open' ? null : iso(store);
    report.resolvedBy = status === 'open' ? null : caller.userId;
    changed += 1;
  }
  return changed;
};

const editorDistractorQueue: Handler = (store, caller, args) => {
  requireTeam(caller);
  const status = str(args.p_status) ?? 'open';
  if (!['open', 'edited', 'kept', 'dismissed', 'all'].includes(status)) {
    raise('22023', 'Estado desconocido');
  }
  return store.distractorFlags
    .filter(
      (flag) =>
        canSee(store, caller, flag.questionId) && (status === 'all' || flag.status === status),
    )
    .sort((a, b) => a.flaggedAt.localeCompare(b.flaggedAt) || a.id.localeCompare(b.id))
    .map((flag) => ({
      id: flag.id,
      questionId: flag.questionId,
      questionKey: questionKey(store, flag.questionId),
      versionId: flag.versionId,
      optionId: flag.optionId,
      exposures: flag.exposures,
      choices: flag.choices,
      attraction: flag.attraction,
      status: flag.status,
      flaggedAt: flag.flaggedAt,
      resolvedAt: flag.resolvedAt,
      note: flag.note,
    }));
};

const editorResolveDistractor: Handler = (store, caller, args) => {
  requireTeam(caller);
  const resolution = str(args.p_resolution);
  if (resolution !== 'edited' && resolution !== 'kept' && resolution !== 'dismissed') {
    return raise('22023', 'Resolución desconocida');
  }
  const note = (str(args.p_note) ?? '').trim();
  if (note.length > 500) raise('22023', 'La nota es muy larga');
  const flag = store.distractorFlags.find((item) => item.id === str(args.p_flag_id));
  if (!flag) return raise('22023', 'La marca no existe');
  if (!canSee(store, caller, flag.questionId)) raise('BK007', 'No tienes asignada esta pregunta');
  flag.status = resolution;
  flag.resolvedAt = iso(store);
  flag.resolvedBy = caller.userId;
  flag.note = note === '' ? null : note;
  return resolution;
};

/** editor_label_pairs devuelve una tabla, con nombres de columna de SQL */
const editorLabelPairs: Handler = (store, caller) => {
  requireTeam(caller);
  return store.labels
    .filter(
      (label) =>
        label.authorTag !== null &&
        label.lockedAt !== null &&
        store.versions.get(label.versionId)?.authorId !== label.labelerId,
    )
    .sort((a, b) => a.labeledAt.localeCompare(b.labeledAt) || a.optionId.localeCompare(b.optionId))
    .map((label) => ({
      option_id: label.optionId,
      author_tag: label.authorTag,
      reviewer_tag: label.tag,
      labeled_at: label.labeledAt,
    }));
};

/** El día de Mérida (UTC-6, sin horario de verano) de una hora */
const meridaDay = (at: string) =>
  new Date(Date.parse(at) - 6 * 3_600_000).toISOString().slice(0, 10);

const editorMyReviews: Handler = (store, caller, args) => {
  requireTeam(caller);
  const from = str(args.p_from);
  const to = str(args.p_to);
  if (!from || !to || to < from) return raise('22023', 'Rango de fechas inválido');
  const inRange = (at: string) => meridaDay(at) >= from && meridaDay(at) <= to;
  const mine = store.decisions.filter(
    (decision) => decision.physicianId === caller.userId && inRange(decision.decidedAt),
  );
  return {
    from,
    to,
    approved: mine.filter((decision) => decision.decision === 'approve').length,
    changesRequested: mine.filter((decision) => decision.decision === 'request_changes').length,
    rejected: mine.filter((decision) => decision.decision === 'reject').length,
    // Preguntas por mes, como admin_review_report (pago por pregunta revisada)
    reviewed: new Set(
      mine.map((decision) => `${meridaMonth(decision.decidedAt)}|${decision.questionId}`),
    ).size,
    distractorsResolved: store.distractorFlags.filter(
      (flag) =>
        flag.resolvedBy === caller.userId &&
        flag.status !== 'open' &&
        flag.resolvedAt !== null &&
        inRange(flag.resolvedAt),
    ).length,
  };
};

const editorResolveSyncConflict: Handler = (store, caller, args) => {
  requireTeam(caller);
  const choice = str(args.p_choice);
  if (choice !== 'keep_app' && choice !== 'take_sheet') {
    return raise('22023', 'Opción desconocida');
  }
  const questionId = str(args.p_question_id) ?? '';
  if (!canSee(store, caller, questionId)) raise('BK007', 'No tienes asignada esta pregunta');
  const question = store.questions.get(questionId);
  if (!question?.conflictSince) {
    return raise('22023', 'La pregunta no tiene conflicto');
  }
  const track = trackOf(store, questionId);
  if (choice === 'keep_app') {
    track.rowHash = track.conflictRowHash;
    track.forceNext = false;
  } else {
    track.forceNext = true;
  }
  track.conflictRowHash = null;
  question.conflictSince = null;
  question.updatedAt = iso(store);
  return choice;
};

// ===================================================================== Funciones del admin

const adminBankOverview: Handler = (store, caller) => {
  requireAdmin(caller);
  const active = [...store.questions.values()].filter((question) => question.status === 'active');
  const latest = active.flatMap((question) => {
    const version = store.versions.get(question.latestVersionId);
    return version ? [version] : [];
  });
  const published = [...store.catalog.values()].filter((row) => row.status === 'published');
  const byBranch = new Map<string, number>();
  for (const row of published) byBranch.set(row.branch, (byBranch.get(row.branch) ?? 0) + 1);
  return {
    goal: store.settings.bankGoal.approvedToOpen,
    published: published.filter((row) => row.language !== 'en').length,
    englishPublished: published.filter((row) => row.language === 'en').length,
    byBranch: [...byBranch.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([branch, count]) => ({ branch, published: count })),
    drafts: latest.filter((version) => version.status === 'draft').length,
    incomplete: latest.filter((version) => version.incomplete.length > 0).length,
    inReview: latest.filter((version) => version.status === 'in_review').length,
    conflicts: [...store.questions.values()].filter((question) => question.conflictSince !== null)
      .length,
    missing: active.filter((question) => question.missingSince !== null).length,
    retireRequested: active.filter((question) => question.retireRequestedAt !== null).length,
    retired: [...store.questions.values()].filter((question) => question.status === 'retired')
      .length,
    open: caller.flags.cloudBank === true,
  };
};

const isPhysicianId = (store: FakeBankStore, caller: FakeBankCaller, id: string) =>
  personOf(store, caller, id).role === 'physician';

const adminAssignQuestions: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const author = str(args.p_author);
  const reviewer = str(args.p_reviewer);
  if (author !== null && author === reviewer)
    raise('BK003', 'Autor y revisor tienen que ser distintos');
  if (
    (author !== null && !isPhysicianId(store, caller, author)) ||
    (reviewer !== null && !isPhysicianId(store, caller, reviewer))
  ) {
    raise('22023', 'Solo una cuenta de médico puede ser autor o revisor');
  }
  let changed = 0;
  for (const questionId of strings(args.p_question_ids)) {
    const question = store.questions.get(questionId);
    if (!question) continue;
    const at = iso(store);
    for (const item of store.assignments) {
      if (item.questionId !== questionId || item.revokedAt !== null) continue;
      if (author !== null && item.role === 'reviewer' && item.physicianId === author) {
        item.revokedAt = at;
      }
      if (reviewer !== null && item.role === 'author' && item.physicianId === reviewer) {
        item.revokedAt = at;
      }
    }
    assignOrRaise(store, questionId, 'author', author, caller.userId);
    assignOrRaise(store, questionId, 'reviewer', reviewer, caller.userId);
    question.updatedAt = at;
    changed += 1;
  }
  return changed;
};

const adminSetTopicReviewer: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const branch = str(args.p_branch);
  const topic = str(args.p_topic);
  const physician = str(args.p_physician) ?? '';
  if (!branch || !topic) raise('22023', 'Subespecialidad fuera de la taxonomía');
  if (!isPhysicianId(store, caller, physician)) raise('22023', 'Solo una cuenta de médico revisa');
  store.topicReviewers.set(`${branch ?? ''}/${topic ?? ''}`, physician);
  return null;
};

const adminSetPhysicianCode: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const code = (str(args.p_code) ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(code)) {
    raise('22023', 'La clave lleva de 2 a 8 letras o números y empieza con letra');
  }
  const user = str(args.p_user) ?? '';
  if (!isPhysicianId(store, caller, user)) return 'not_physician';
  for (const [owner, taken] of store.physicianCodes) {
    if (taken === code && owner !== user) return 'taken';
  }
  store.physicianCodes.set(user, code);
  return 'ok';
};

/** admin_bank_team. Las claves del Sheet y los revisores por omisión, solo con alias */
const adminBankTeam: Handler = (store, caller) => {
  requireAdmin(caller);
  const codes = [...store.physicianCodes]
    .map(([userId, code]) => ({ userId, alias: personOf(store, caller, userId).alias, code }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const topicReviewers = [...store.topicReviewers]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, physicianId]) => {
      const [branch = '', topic = ''] = key.split('/');
      const person = personOf(store, caller, physicianId);
      return {
        branch,
        topic,
        physicianId,
        alias: person.alias,
        active: person.role === 'physician',
      };
    });
  return { codes, topicReviewers };
};

/** admin_bank_settings. Los topes completos y la tarifa, que no se leen sin sesión (B5) */
const adminBankSettings: Handler = (store, caller) => {
  requireAdmin(caller);
  return {
    limits: { ...store.settings.bankLimits },
    pay: { perReviewMxn: store.settings.physicianPay.perReviewMxn },
  };
};

/** admin_save_bank_settings. La app ya valida los rangos, aquí solo se guardan */
const adminSaveBankSettings: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const limits = isRecord(args.p_limits) ? args.p_limits : {};
  for (const field of Object.keys(
    store.settings.bankLimits,
  ) as (keyof FakeBankSettings['bankLimits'])[]) {
    const value = limits[field];
    if (typeof value !== 'number') return raise('22023', `Falta ${field} o no es número`);
    store.settings.bankLimits[field] = value;
  }
  const pay = isRecord(args.p_pay) ? args.p_pay.perReviewMxn : null;
  store.settings.physicianPay.perReviewMxn = typeof pay === 'number' ? pay : null;
  return null;
};

const adminRetireQuestion: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const question = store.questions.get(str(args.p_question_id) ?? '');
  if (question?.status !== 'active') raise('22023', 'La pregunta no existe o ya está retirada');
  const current = question as FakeBankQuestion;
  if (store.catalog.has(current.questionId)) retireQuestion(store, current.questionId);
  current.status = 'retired';
  current.retireRequestedAt = null;
  current.missingSince = null;
  current.updatedAt = iso(store);
  return 'retired';
};

const adminRestoreQuestion: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const question = store.questions.get(str(args.p_question_id) ?? '');
  if (question?.status !== 'retired') raise('22023', 'La pregunta no está retirada');
  const current = question as FakeBankQuestion;
  current.status = 'active';
  current.updatedAt = iso(store);
  const approved = [...store.versions.values()].some(
    (version) => version.questionId === current.questionId && version.status === 'approved',
  );
  if (approved) publish(store, current.questionId);
  return 'restored';
};

const adminConfirmMissing: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const action = str(args.p_action);
  if (action !== 'retire' && action !== 'keep') return raise('22023', 'Acción desconocida');
  let changed = 0;
  for (const questionId of strings(args.p_question_ids)) {
    const question = store.questions.get(questionId);
    if (
      question?.status !== 'active' ||
      (question.missingSince === null && question.retireRequestedAt === null)
    ) {
      continue;
    }
    if (action === 'retire') {
      adminRetireQuestion(store, caller, { p_question_id: questionId, p_reason: null });
    } else {
      question.missingSince = null;
      question.retireRequestedAt = null;
      question.updatedAt = iso(store);
    }
    changed += 1;
  }
  return changed;
};

const adminBankReadAlerts: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const limit = Math.min(Math.max(Number(args.p_limit ?? 50) || 50, 1), 500);
  return store.readAlerts
    .map((alert, index) => ({ alert, id: index + 1 }))
    .sort((a, b) => b.alert.createdAt.localeCompare(a.alert.createdAt) || b.id - a.id)
    .slice(0, limit)
    .map(({ alert, id }) => ({
      id,
      userId: alert.userId,
      alias: personOf(store, caller, alert.userId).alias,
      day: alert.day,
      kind: alert.kind,
      value: alert.value,
      createdAt: alert.createdAt,
      seenAt: null,
    }));
};

/** Mes de Mérida como fecha, el primer día del mes */
const meridaMonth = (at: string) => `${meridaDay(at).slice(0, 7)}-01`;

function decisionsIn(store: FakeBankStore, args: Json) {
  const from = str(args.p_from);
  const to = str(args.p_to);
  if (!from || !to || to < from) return raise('22023', 'Rango de fechas inválido');
  return store.decisions.filter(
    (decision) => meridaDay(decision.decidedAt) >= from && meridaDay(decision.decidedAt) <= to,
  );
}

/**
 * Las decisiones que pagan. La primera de cada médico sobre cada pregunta en el mes de Mérida, así varias
 * rondas sobre la misma pregunta cuentan una vez (pago por pregunta revisada)
 */
function paidDecisions<T extends { physicianId: string; questionId: string; decidedAt: string }>(
  decisions: readonly T[],
): Set<T> {
  const first = new Map<string, T>();
  for (const decision of [...decisions].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))) {
    const key = `${decision.physicianId}|${decision.questionId}|${meridaMonth(decision.decidedAt)}`;
    if (!first.has(key)) first.set(key, decision);
  }
  return new Set(first.values());
}

/** admin_review_report, una fila por médico y mes con nombres de columna de SQL */
const adminReviewReport: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const rate = store.settings.physicianPay.perReviewMxn;
  const rows = new Map<string, Json & { reviewed: number }>();
  const paid = paidDecisions(decisionsIn(store, args));
  for (const decision of decisionsIn(store, args)) {
    const month = meridaMonth(decision.decidedAt);
    const key = `${month}|${decision.physicianId}`;
    const row = rows.get(key) ?? {
      month,
      physician_id: decision.physicianId,
      alias: personOf(store, caller, decision.physicianId).alias,
      code: store.physicianCodes.get(decision.physicianId) ?? null,
      approved: 0,
      changes_requested: 0,
      rejected: 0,
      reviewed: 0,
      distractors_resolved: 0,
      amount_mxn: null,
    };
    const field =
      decision.decision === 'approve'
        ? 'approved'
        : decision.decision === 'request_changes'
          ? 'changes_requested'
          : 'rejected';
    row[field] = Number(row[field]) + 1;
    if (paid.has(decision)) row.reviewed += 1;
    row.amount_mxn = rate === null ? null : row.reviewed * rate;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      String(a.month).localeCompare(String(b.month)) ||
      String(a.alias).localeCompare(String(b.alias)),
  );
};

const adminReviewReportDetail: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const physician = str(args.p_physician);
  const paid = paidDecisions(decisionsIn(store, args));
  return decisionsIn(store, args)
    .filter((decision) => physician === null || decision.physicianId === physician)
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
    .map((decision) => ({
      decided_at: decision.decidedAt,
      month: meridaMonth(decision.decidedAt),
      physician_id: decision.physicianId,
      alias: personOf(store, caller, decision.physicianId).alias,
      code: store.physicianCodes.get(decision.physicianId) ?? null,
      question_key: questionKey(store, decision.questionId),
      version: decision.version,
      decision: decision.decision,
      counts: paid.has(decision),
    }));
};

// ===================================================================== Sincronización

function trackOf(store: FakeBankStore, questionId: string): SheetTrack {
  const side = sideOf(store);
  let track = side.sheet.get(questionId);
  if (!track) {
    track = {
      rowHash: null,
      metaHash: null,
      appliedVersionId: null,
      forceNext: false,
      conflictRowHash: null,
      seenAt: null,
    };
    side.sheet.set(questionId, track);
  }
  return track;
}

const runSummary = (run: FakeSyncRun) => ({
  id: run.id,
  trigger: run.trigger,
  target: run.target,
  mode: run.mode,
  status: run.status,
  reason: run.reason,
  counts: { ...run.counts },
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
});

/** bank_sync_begin */
function beginRun(
  store: FakeBankStore,
  trigger: 'cron' | 'manual' | 'import',
  target: 'real' | 'test' | 'file',
  actorId: string | null,
): BeginResult {
  const settings = store.settings.bankSync;
  const mode =
    target === 'test'
      ? 'dry_run'
      : trigger === 'import'
        ? 'apply'
        : settings.mode === 'apply'
          ? 'apply'
          : 'dry_run';
  const now = store.now();
  let reason: string | null = null;
  if (trigger !== 'import' && !settings.enabled) reason = 'disabled';
  else if (store.syncRuns.some((run) => run.status === 'running')) reason = 'running';
  else if (
    trigger === 'manual' &&
    store.syncRuns.some(
      (run) =>
        run.status !== 'skipped' &&
        Date.parse(run.startedAt) > now - settings.minIntervalSeconds * 1000,
    )
  ) {
    reason = 'too_soon';
  }
  const run: FakeSyncRun = {
    id: randomUUID(),
    trigger,
    target,
    mode,
    status: reason === null ? 'running' : 'skipped',
    reason,
    counts: {},
    startedAt: iso(store),
    finishedAt: reason === null ? null : iso(store),
    actorId,
    rows: [],
  };
  store.syncRuns.push(run);
  const origin = trigger === 'import' ? 'import' : 'sheet';
  return {
    runId: run.id,
    status: reason === null ? 'running' : 'skipped',
    reason,
    mode,
    target,
    settings: { tab: settings.tab, maxRows: settings.maxRows, idPattern: settings.idPattern },
    lastSheetHash: sideOf(store).sheetHash.get(target) ?? null,
    known: [...store.questions.values()].flatMap((question) => {
      if (!question.sourceKey?.startsWith(`${origin}:`)) return [];
      const track = trackOf(store, question.questionId);
      return [
        {
          key: question.sourceKey.slice(origin.length + 1),
          questionId: question.questionId,
          rowHash: track.rowHash,
          metaHash: track.metaHash,
          latestVersionId: question.latestVersionId,
          latestSource: store.versions.get(question.latestVersionId)?.source ?? null,
          appliedVersionId: track.appliedVersionId,
          forceNext: track.forceNext,
          conflictRowHash: track.conflictRowHash,
          status: question.status,
        },
      ];
    }),
  };
}

/** bank_sync_versions_content */
function versionsContent(
  store: FakeBankStore,
  ids: readonly string[],
): Map<string, VersionContent> {
  const contents = new Map<string, VersionContent>();
  for (const id of ids) {
    const version = store.versions.get(id);
    if (!version) continue;
    const ordered = [...version.options].sort((a, b) => a.position - b.position);
    const caseRow = version.caseId ? store.cases.get(version.caseId) : undefined;
    contents.set(id, {
      branch: version.branch,
      topic: version.topic,
      subtopic: version.subtopic,
      difficulty: version.difficulty,
      itemKinds: [...version.itemKinds],
      task: version.task,
      polarity: version.polarity,
      language: version.language,
      vignette: version.vignette,
      prompt: version.prompt,
      explanation: version.explanation,
      refs: version.gpcRefs.map((ref) => ref.title),
      options: ordered.map((option) => ({
        letter: option.letter,
        position: option.position,
        text: option.text,
        isCorrect: option.isCorrect,
        biasTag: option.biasTag,
        rationale: option.rationale,
      })),
      canonical: ordered
        .filter((option) => version.canonicalOptionIds.includes(option.id))
        .map((option) => option.letter ?? String.fromCharCode(65 + option.position)),
      caseKey: caseRow ? (caseRow.caseKey ?? null) : null,
      caseOrder: version.caseOrder,
      caseVignette: caseRow ? caseRow.vignette : null,
    });
  }
  return contents;
}

/** bank_sheet_content. Las opciones toman un id estable por su letra */
function sheetContent(origin: string, key: string, question: SyncQuestion): Json {
  return {
    branch: question.branch,
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: question.difficulty,
    itemKinds: question.itemKinds,
    polarity: question.polarity,
    task: question.task,
    format:
      question.caseKey !== null
        ? 'serial_case'
        : question.vignette.trim() === ''
          ? 'direct'
          : 'clinical_case',
    structureSource: question.structureDeclared ? 'physician' : 'auto',
    language: question.language,
    vignette: question.vignette,
    prompt: question.prompt,
    explanation: question.explanation,
    gpcRefs: question.refs.map((title) => ({ title, status: 'to_verify' })),
    clues: [],
    options: question.options.map((option) => ({
      optionId: stableUuid(`${origin}-opt`, `${key}|${option.letter}`),
      letter: option.letter,
      text: option.text,
      isCorrect: option.correct,
      biasTag: option.bias,
      secondaryBiasTags: [],
      rationale: option.rationale,
      canonical: question.canonical.includes(option.letter),
    })),
  };
}

function physicianByCode(store: FakeBankStore, code: string | null): string | null {
  if (code === null) return null;
  for (const [userId, taken] of store.physicianCodes) {
    if (taken === code) return userId;
  }
  return null;
}

/** bank_apply_row. Guarda el renglón en la corrida y devuelve su resultado */
function applyRow(
  store: FakeBankStore,
  run: FakeSyncRun,
  origin: 'sheet' | 'import',
  row: SyncRowPayload,
  apply: boolean,
): { rowNumber: number; outcome: SyncRowResult['outcome']; questionId: string | null } {
  const key = row.key.trim();
  let decision = key === '' ? 'rejected' : row.decision;
  const questionId = decision === 'rejected' ? null : stableUuid(`${origin}-q`, key);
  const notices: (SyncNoticeCode | ServerNoticeCode)[] = [...row.notices];
  const notice = (code: SyncNoticeCode | ServerNoticeCode) => {
    if (!notices.includes(code)) notices.push(code);
  };
  let author: string | null = null;
  let reviewer: string | null = null;
  if (decision !== 'rejected') {
    author = physicianByCode(store, row.meta.authorCode);
    if (row.meta.authorCode !== null && author === null) notice('author_unknown');
    reviewer = physicianByCode(store, row.meta.reviewerCode);
    if (row.meta.reviewerCode !== null && reviewer === null) notice('reviewer_unknown');
    if (author !== null && author === reviewer) {
      reviewer = null;
      notice('author_is_reviewer');
    }
  }
  const existing = questionId === null ? undefined : store.questions.get(questionId);
  if (decision !== 'rejected' && apply) {
    if (
      (decision === 'create' && existing) ||
      (decision !== 'create' && existing?.latestVersionId !== row.expectLatestVersionId)
    ) {
      decision = existing ? 'conflict' : 'create';
    }
    if ((decision === 'create' || decision === 'version') && !row.question) decision = 'rejected';
  }
  const outcome = expectedOutcome(decision);
  const at = iso(store);
  if (apply && questionId !== null && (decision === 'create' || decision === 'version')) {
    const question = row.question as SyncQuestion;
    let caseId: string | null = null;
    if (question.caseKey !== null) {
      const vignette = question.caseVignette ?? '';
      caseId = stableUuid(
        `${origin}-case`,
        `${question.caseKey.toUpperCase()}|${createHash('md5').update(vignette).digest('hex')}`,
      );
      if (!store.cases.has(caseId)) {
        store.cases.set(caseId, {
          id: caseId,
          caseKey: question.caseKey.toUpperCase(),
          vignette,
          createdAt: at,
        });
      }
    }
    const version = insertVersion(store, {
      questionId,
      content: sheetContent(origin, key, question),
      source: origin,
      authorId: author,
      caseId,
      caseOrder: question.caseOrder,
      variantOf: null,
      flags: notices.filter((code) => code === 'topic_inferred' || code === 'kind_control_check'),
      incomplete: [...row.incomplete],
    });
    const track = trackOf(store, questionId);
    if (decision === 'create') {
      store.questions.set(questionId, {
        questionId,
        origin,
        sourceKey: `${origin}:${key}`,
        latestVersionId: version.id,
        publishedVersionId: null,
        status: 'active',
        retireRequestedAt: null,
        conflictSince: null,
        missingSince: null,
        createdAt: at,
        updatedAt: at,
      });
      track.metaHash = row.metaHash;
    } else if (existing) {
      existing.latestVersionId = version.id;
      existing.conflictSince = null;
      existing.updatedAt = at;
    }
    track.rowHash = row.rowHash;
    track.appliedVersionId = version.id;
    track.forceNext = false;
    track.conflictRowHash = null;
    track.seenAt = at;
  } else if (apply && questionId !== null && existing && decision === 'converged') {
    const track = trackOf(store, questionId);
    track.rowHash = row.rowHash;
    track.appliedVersionId = existing.latestVersionId;
    track.conflictRowHash = null;
    track.forceNext = false;
    track.seenAt = at;
    existing.conflictSince = null;
    existing.updatedAt = at;
  } else if (apply && questionId !== null && existing && decision === 'conflict') {
    existing.conflictSince ??= at;
    existing.updatedAt = at;
    const track = trackOf(store, questionId);
    track.conflictRowHash = row.rowHash;
    track.seenAt = at;
  }
  if (
    apply &&
    questionId !== null &&
    ['create', 'version', 'converged', 'meta_only'].includes(decision)
  ) {
    for (const [role, physician] of [
      ['author', author],
      ['reviewer', reviewer],
    ] as const) {
      // El autor o el revisor que reasignó el admin en la app no lo pisa el Sheet (B7 de la revisión)
      if (physician !== null && adminAssignedOther(store, questionId, role, physician)) {
        notice(role === 'author' ? 'author_differs' : 'reviewer_differs');
        continue;
      }
      if (assign(store, questionId, role, physician)) notice('author_is_reviewer');
    }
    const question = store.questions.get(questionId);
    if (question) {
      const track = trackOf(store, questionId);
      track.metaHash = row.metaHash;
      if (row.meta.sheetStatus === 'retire') question.retireRequestedAt ??= at;
      question.missingSince = null;
      question.updatedAt = at;
      const latest = store.versions.get(question.latestVersionId);
      if (row.meta.sheetStatus === 'ready' && latest?.status === 'draft') {
        try {
          sendToReview(store, latest);
        } catch (error) {
          if (!(error instanceof Raise)) throw error;
          notices.push('not_ready');
        }
      }
    }
  } else if (
    !apply &&
    row.meta.sheetStatus === 'ready' &&
    (decision === 'create' || decision === 'version') &&
    row.incomplete.length > 0
  ) {
    notices.push('not_ready');
  }
  run.rows.push({
    rowNumber: row.rowNumber,
    sheetKey: key === '' ? null : key.slice(0, 60),
    outcome,
    incomplete: [...row.incomplete],
    // La base guarda text[] y la app lo lee igual, con los avisos que solo pone la base
    notices: notices as SyncNoticeCode[],
    problems: row.problems.map((problem): SyncProblem => ({ ...problem })),
    questionId,
  });
  return { rowNumber: row.rowNumber, outcome, questionId };
}

/** bank_sync_finish */
function finishRun(store: FakeBankStore, run: FakeSyncRun, input: FinishInput): void {
  if (run.status !== 'running') return;
  let missing = 0;
  if (
    run.target === 'real' &&
    run.trigger !== 'import' &&
    ['ok', 'partial'].includes(input.status)
  ) {
    const seen = new Set(input.seenKeys ?? []);
    for (const question of store.questions.values()) {
      if (!question.sourceKey?.startsWith('sheet:') || question.status !== 'active') continue;
      const key = question.sourceKey.slice(6);
      if (seen.has(key)) {
        if (run.mode === 'apply') question.missingSince = null;
        continue;
      }
      run.rows.push({
        rowNumber: null,
        sheetKey: key.slice(0, 60),
        outcome: 'missing',
        incomplete: [],
        notices: [],
        problems: [],
        questionId: question.questionId,
      });
      missing += 1;
      if (run.mode === 'apply') question.missingSince ??= iso(store);
    }
  }
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.summary)) {
    if (typeof value === 'number') counts[key] = value;
  }
  counts.missing = missing;
  const hash = input.summary.sheetHash;
  if (typeof hash === 'string' && ['ok', 'partial'].includes(input.status)) {
    sideOf(store).sheetHash.set(run.target, hash);
  }
  run.status = input.status;
  run.reason = input.reason;
  run.counts = counts;
  run.finishedAt = iso(store);
}

const runOf = (store: FakeBankStore, runId: string): FakeSyncRun => {
  const run = store.syncRuns.find((item) => item.id === runId);
  if (!run) throw new Error(`No existe la corrida ${runId}`);
  return run;
};

/** Corre runSync contra el Sheet de prueba del destino, en segundo plano */
function startBackgroundSync(store: FakeBankStore, begin: BeginResult): void {
  const side = sideOf(store);
  const target = begin.target === 'test' ? 'test' : 'real';
  const fixture = side.fixtures[target];
  const work = (async () => {
    const google = await createFakeGoogle([fixture], { now: () => Date.now() });
    const deps: BankSyncDeps = {
      env: { serviceAccountKey: JSON.stringify(google.key) },
      log: () => undefined,
      authorizeAdmin: () => Promise.resolve(null),
      cronOk: () => Promise.resolve(false),
      store: {
        begin: () => Promise.reject(new Error('La corrida ya empezó')),
        versionsContent: (ids) => Promise.resolve(versionsContent(store, ids)),
        apply: (runId, rows, forceDryRun) => {
          const run = runOf(store, runId);
          if (run.status !== 'running') {
            return Promise.reject(new Error('La corrida no está corriendo'));
          }
          if (forceDryRun && run.mode === 'apply') run.mode = 'dry_run';
          return Promise.resolve(
            rows.map((row) => applyRow(store, run, 'sheet', row, run.mode === 'apply')),
          );
        },
        finish: (runId, input) => {
          finishRun(store, runOf(store, runId), input);
          return Promise.resolve();
        },
      },
      google: (key) =>
        createGoogleClient(key, {
          fetch: google.fetch,
          now: () => Date.now(),
          sleep: () => Promise.resolve(),
        }),
      waitUntil: () => undefined,
    };
    await runSync(
      deps,
      begin,
      deps.google(google.key),
      fixture.spreadsheet.spreadsheetId,
      'manual',
    );
  })();
  side.pending.add(work);
  void work.finally(() => side.pending.delete(work));
}

/**
 * La función bank-sync con la sesión del admin. 401 sin sesión de admin, como admin_bank_sync_authorize.
 * La corrida sigue en segundo plano y la prueba la espera con settleSyncRuns
 */
export function editorialFunction(
  store: FakeBankStore,
  caller: FakeBankCaller | null,
  body: unknown,
): FakeBankReply {
  if (!caller || !isAdmin(caller)) return { status: 401, json: { error: 'unauthorized' } };
  const target = isRecord(body) && body.target === 'test' ? 'test' : 'real';
  const begin = beginRun(store, 'manual', target, caller.userId);
  if (begin.status === 'skipped') {
    return { status: 200, json: { runId: begin.runId, status: 'skipped', reason: begin.reason } };
  }
  startBackgroundSync(store, begin);
  return { status: 202, json: { runId: begin.runId, status: 'running', mode: begin.mode } };
}

const adminBankSyncRuns: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const limit = Math.min(Math.max(Number(args.p_limit ?? 20) || 20, 1), 200);
  return [...store.syncRuns]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map(runSummary);
};

const adminBankSyncRows: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const run = store.syncRuns.find((item) => item.id === str(args.p_run));
  const outcome = str(args.p_outcome);
  const { limit, offset } = pageOf(args, 200, 5000);
  return (run?.rows ?? [])
    .filter((row) => outcome === null || row.outcome === outcome)
    .sort(
      (a, b) => (a.rowNumber ?? Number.MAX_SAFE_INTEGER) - (b.rowNumber ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(offset, offset + limit);
};

const adminBankImport: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const rows = Array.isArray(args.p_rows) ? (args.p_rows as SyncRowPayload[]) : null;
  if (rows === null || rows.length > 500)
    raise('22023', 'Se esperaba una lista de hasta 500 renglones');
  const begin = beginRun(store, 'import', 'file', caller.userId);
  if (begin.status !== 'running') raise('BK009', 'Hay una sincronización en curso');
  const run = runOf(store, begin.runId);
  let unchanged = 0;
  const results: ReturnType<typeof applyRow>[] = [];
  for (const row of rows ?? []) {
    const key = row.key.trim();
    const existing = key === '' ? undefined : store.questions.get(stableUuid('import-q', key));
    const track = existing ? trackOf(store, existing.questionId) : null;
    const decision =
      row.decision === 'rejected' || !row.question
        ? 'rejected'
        : !existing || !track
          ? 'create'
          : track.rowHash === row.rowHash && track.metaHash === row.metaHash
            ? 'unchanged'
            : track.rowHash === row.rowHash
              ? 'meta_only'
              : existing.latestVersionId === track.appliedVersionId
                ? 'version'
                : 'conflict';
    if (decision === 'unchanged') {
      unchanged += 1;
      continue;
    }
    results.push(
      applyRow(
        store,
        run,
        'import',
        { ...row, decision, expectLatestVersionId: existing?.latestVersionId ?? null },
        true,
      ),
    );
  }
  const countOf = (outcome: string) => results.filter((item) => item.outcome === outcome).length;
  const status = results.some((item) => item.outcome === 'rejected' || item.outcome === 'conflict')
    ? 'partial'
    : 'ok';
  finishRun(store, run, {
    seenKeys: null,
    summary: {
      read: rows?.length ?? 0,
      unchanged,
      created: countOf('created'),
      versioned: countOf('versioned'),
      meta: countOf('meta'),
      conflict: countOf('conflict'),
      rejected: countOf('rejected'),
    },
    status,
    reason: null,
  });
  return { runId: run.id, status, reason: null, counts: run.counts, rows: results };
};

// ===================================================================== Catálogo de mazos

/** deck_catalog_expected */
function expectedFiles(deckKey: string, version: number, subjects: readonly FakeDeckSubject[]) {
  return subjects
    .flatMap((subject) => {
      const base = `${deckKey}/v${version}/${subject.subjectKey}`;
      const json =
        subject.jsonBytes <= DECK_PART_MAX_BYTES
          ? [
              {
                subjectKey: subject.subjectKey,
                path: `${base}.json`,
                contentType: 'application/json',
              },
            ]
          : Array.from({ length: Math.ceil(subject.jsonBytes / DECK_PART_MAX_BYTES) }, (_, k) => ({
              subjectKey: subject.subjectKey,
              path: `${base}.part-${k + 1}.json`,
              contentType: 'application/json',
            }));
      const media = Array.from({ length: subject.mediaParts }, (_, k) => ({
        subjectKey: subject.subjectKey,
        path: `${base}.media-${k + 1}.zip`,
        contentType: 'application/zip',
      }));
      return [...json, ...media];
    })
    .sort((a, b) => a.subjectKey.localeCompare(b.subjectKey) || a.path.localeCompare(b.path));
}

function deckOf(store: FakeBankStore, deckKey: string): FakeDeck {
  const deck = store.decks.get(deckKey);
  if (!deck) return raise('22023', 'Ese mazo no existe');
  return deck;
}

const adminDeckCatalogRegister: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const parsed = DeckManifestSchema.safeParse(args.p_manifest);
  if (!parsed.success) return raise('22023', 'El manifiesto del mazo no es válido');
  const manifest = parsed.data;
  const trimmed = manifest.authorizationNote?.trim() ?? '';
  const note = trimmed === '' ? null : trimmed;
  const existing = store.decks.get(manifest.deckKey);
  // Solo el dueño pasa un mazo de terceros a propio, como admin_deck_catalog_register
  if (
    existing?.license === 'third_party' &&
    manifest.license === 'own' &&
    caller.role !== 'owner'
  ) {
    raise('42501', 'Solo el dueño pasa un mazo de terceros a propio', 'license_owner_only');
  }
  const sameAuthorization =
    existing?.license === manifest.license && existing.authorizationNote === note;
  const deck: FakeDeck = existing ?? {
    deckKey: manifest.deckKey,
    name: manifest.name,
    description: manifest.description,
    author: manifest.author,
    license: manifest.license,
    authorizationNote: note,
    authorizationConfirmedAt: null,
    status: 'draft',
    publishedVersion: null,
    preview: [],
    versions: [],
  };
  deck.name = manifest.name;
  deck.description = manifest.description;
  deck.author = manifest.author;
  deck.license = manifest.license;
  deck.authorizationNote = note;
  if (!sameAuthorization) deck.authorizationConfirmedAt = null;
  for (const version of deck.versions) {
    if (version.status === 'uploading') version.status = 'retired';
  }
  const number = Math.max(0, ...deck.versions.map((version) => version.version)) + 1;
  const subjects: FakeDeckSubject[] = manifest.subjects.map((subject) => ({
    subjectKey: subject.subjectKey,
    name: subject.name,
    branch: subject.branch,
    topic: subject.topic,
    notes: subject.notes,
    cards: subject.cards,
    jsonBytes: subject.jsonBytes,
    mediaBytes: subject.mediaBytes,
    mediaParts: subject.mediaParts,
    sha256: subject.sha256,
  }));
  deck.versions.push({
    version: number,
    status: 'uploading',
    subjects,
    preview: manifest.preview,
    createdAt: iso(store),
    publishedAt: null,
  });
  store.decks.set(deck.deckKey, deck);
  return {
    deckKey: deck.deckKey,
    version: number,
    status: 'uploading',
    files: expectedFiles(deck.deckKey, number, subjects),
  };
};

const sizeOf = (store: FakeBankStore, path: string) =>
  store.objects.get(path)?.bytes.length ?? null;

const adminDeckCatalogPublish: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const deck = store.decks.get(str(args.p_deck_key) ?? '');
  const number = Number(args.p_version);
  const version = deck?.versions.find((item) => item.version === number);
  if (!deck || !version) return raise('22023', 'Esa versión del mazo no existe');
  if (version.status === 'published') return 'already_published';
  if (version.status !== 'uploading') raise('22023', 'Esa versión ya no está en subida');
  const files = expectedFiles(deck.deckKey, number, version.subjects);
  const complete = version.subjects.every((subject) => {
    const own = files.filter((file) => file.subjectKey === subject.subjectKey);
    const total = (type: string) =>
      own
        .filter((file) => file.contentType === type)
        .reduce<number | null>((sum, file) => {
          const size = sizeOf(store, file.path);
          return sum === null || size === null ? null : sum + size;
        }, 0);
    return (
      total('application/json') === subject.jsonBytes &&
      (subject.mediaParts === 0 || total('application/zip') === subject.mediaBytes)
    );
  });
  if (!complete) {
    raise('BK011', 'Faltan archivos de la versión del mazo o no tienen el tamaño esperado');
  }
  if (
    deck.license === 'third_party' &&
    (deck.authorizationNote === null || deck.authorizationConfirmedAt === null)
  ) {
    raise('BK010', 'El dueño no ha confirmado la autorización del mazo');
  }
  for (const item of deck.versions) {
    if (item.status === 'published') item.status = 'retired';
  }
  version.status = 'published';
  version.publishedAt = iso(store);
  deck.status = 'published';
  deck.publishedVersion = number;
  deck.preview = version.preview ?? [];
  return 'published';
};

const adminDeckCatalogRetire: Handler = (store, caller, args) => {
  requireAdmin(caller);
  const deck = deckOf(store, str(args.p_deck_key) ?? '');
  if (deck.status === 'retired') return 'already_retired';
  for (const version of deck.versions) {
    if (version.status === 'published' || version.status === 'uploading') {
      version.status = 'retired';
    }
  }
  deck.status = 'retired';
  return 'retired';
};

const ownerConfirmDeckAuthorization: Handler = (store, caller, args) => {
  if (caller.role !== 'owner') raise('42501', 'Solo el dueño confirma autorizaciones');
  const note = (str(args.p_note) ?? '').trim();
  if (note === '' || note.length > 500) {
    raise('22023', 'La nota de la autorización es obligatoria y de hasta 500 caracteres');
  }
  const deck = store.decks.get(str(args.p_deck_key) ?? '');
  if (deck?.license !== 'third_party') raise('22023', 'Ese mazo no existe o no es de terceros');
  const current = deck as FakeDeck;
  current.authorizationNote = note;
  current.authorizationConfirmedAt = iso(store);
  return null;
};

const adminDeckCatalogOverview: Handler = (store, caller) => {
  requireAdmin(caller);
  return [...store.decks.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.deckKey.localeCompare(b.deckKey))
    .map((deck): DeckAdminEntry => ({
      deckKey: deck.deckKey,
      name: deck.name,
      author: deck.author,
      description: deck.description,
      license: deck.license,
      authorizationNote: deck.authorizationNote,
      authorizationConfirmedAt: deck.authorizationConfirmedAt,
      status: deck.status,
      publishedVersion: deck.publishedVersion,
      versions: [...deck.versions]
        .sort((a, b) => b.version - a.version)
        .map((version) => {
          const files = expectedFiles(deck.deckKey, version.version, version.subjects);
          return {
            version: version.version,
            status: version.status,
            createdAt: version.createdAt,
            publishedAt: version.publishedAt,
            files: files.length,
            uploaded: files.filter((file) => store.objects.has(file.path)).length,
          };
        }),
      downloads: store.deckDownloads.filter((download) => download.deckKey === deck.deckKey).length,
    }));
};

/**
 * Lo que el admin sube al bucket deck-catalog. Solo el admin, a un archivo esperado de una versión en
 * subida (deck_catalog_can_write) y sin upsert, porque solo existe la política de insert. Un archivo
 * que ya estaba responde Duplicate como Storage. Leer es de fakeBank.ts
 */
export function editorialStorage(
  store: FakeBankStore,
  caller: FakeBankCaller | null,
  method: string,
  objectName: string,
  file: Buffer | null,
  upsert = false,
): FakeBankReply {
  const reply = (statusCode: string, error: string, message: string): FakeBankReply => ({
    status: Number(statusCode),
    json: { statusCode, error, message },
  });
  const denied = () => reply('403', 'Unauthorized', 'new row violates row-level security policy');
  if (!caller) return reply('400', 'Unauthorized', 'new row violates row-level security policy');
  if (method !== 'POST' || upsert || file === null) return denied();
  const match = /^([a-z0-9-]{3,48})\/v([1-9][0-9]{0,5})\//.exec(objectName);
  const deck = match ? store.decks.get(match[1] ?? '') : undefined;
  const version = deck?.versions.find((item) => item.version === Number(match?.[2]));
  const expected =
    deck && version?.status === 'uploading'
      ? expectedFiles(deck.deckKey, version.version, version.subjects).find(
          (item) => item.path === objectName,
        )
      : undefined;
  if (!isAdmin(caller) || !expected) return denied();
  if (store.objects.has(objectName)) {
    return reply('409', 'Duplicate', 'The resource already exists');
  }
  store.objects.set(objectName, {
    bucket: DECK_CATALOG_BUCKET,
    name: objectName,
    bytes: file,
    contentType: expected.contentType,
    createdAt: iso(store),
  });
  return { status: 200, json: { Key: `${DECK_CATALOG_BUCKET}/${objectName}`, Id: randomUUID() } };
}

// ===================================================================== Entrada

const HANDLERS: Readonly<Record<BankEditorialRpc, Handler>> = {
  editor_list: editorList,
  editor_question: editorQuestion,
  editor_create_question: editorCreateQuestion,
  editor_save_version: editorSaveVersion,
  editor_submit: editorSubmit,
  editor_label_option: editorLabelOption,
  editor_decide: editorDecide,
  editor_reports: editorReports,
  editor_set_report_status: editorSetReportStatus,
  editor_distractor_queue: editorDistractorQueue,
  editor_resolve_distractor: editorResolveDistractor,
  editor_label_pairs: editorLabelPairs,
  editor_my_reviews: editorMyReviews,
  editor_resolve_sync_conflict: editorResolveSyncConflict,
  admin_bank_overview: adminBankOverview,
  admin_assign_questions: adminAssignQuestions,
  admin_set_topic_reviewer: adminSetTopicReviewer,
  admin_set_physician_code: adminSetPhysicianCode,
  admin_bank_team: adminBankTeam,
  admin_bank_settings: adminBankSettings,
  admin_save_bank_settings: adminSaveBankSettings,
  admin_retire_question: adminRetireQuestion,
  admin_restore_question: adminRestoreQuestion,
  admin_confirm_missing: adminConfirmMissing,
  admin_bank_sync_runs: adminBankSyncRuns,
  admin_bank_sync_rows: adminBankSyncRows,
  admin_bank_import: adminBankImport,
  admin_review_report: adminReviewReport,
  admin_review_report_detail: adminReviewReportDetail,
  admin_bank_read_alerts: adminBankReadAlerts,
  admin_deck_catalog_register: adminDeckCatalogRegister,
  admin_deck_catalog_publish: adminDeckCatalogPublish,
  admin_deck_catalog_retire: adminDeckCatalogRetire,
  admin_deck_catalog_overview: adminDeckCatalogOverview,
  owner_confirm_deck_authorization: ownerConfirmDeckAuthorization,
};

/** Una rpc del equipo, con la respuesta y el código de error que daría la base */
export function editorialRpc(
  store: FakeBankStore,
  name: BankEditorialRpc,
  caller: FakeBankCaller,
  args: Record<string, unknown>,
): FakeBankReply {
  try {
    return ok(HANDLERS[name](store, caller, args));
  } catch (error) {
    if (error instanceof Raise) return error.reply;
    throw error;
  }
}
