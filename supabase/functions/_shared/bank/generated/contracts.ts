// Generado por scripts/content/sync-bank-shared.ts desde src/data/bank/contracts.ts. No lo edites a mano. Cambia el
// original y corre npm run bank:shared.
// Contratos del banco en la nube (B11, 7.5 del plan de B11). Son las formas JSON que devuelven las
// funciones SQL del banco (supabase/migrations/20261023000001 a 20261023000006) y lo que manda la
// función bank-sync a la base. Los ids son uuid tal como salen de la nube. La app los convierte a ULID
// al guardarlos (src/data/cloud/cloudIds.ts). Solo tipos, sin código, para que los tres paquetes de
// B11 trabajen contra lo mismo. Cambiar una forma después del Paso 0 se acuerda entre dueños.

// ===================================================================== Alumno

/** Por qué una pregunta pedida no salió en fetch_questions. Los topes no lanzan error (2.6) */
export type DenyReason = 'daily_limit' | 'brake' | 'not_found' | 'retired' | 'closed';

/** Para qué pide el alumno los cuerpos. Se guarda en bank_reads para medir */
export type ReadPurpose = 'practice' | 'exam' | 'duel' | 'review' | 'other';

/** Lo que dice bank_quota y la cuota que viaja en fetch_questions (2.5) */
export interface QuotaInfo {
  /** El banco está abierto para quien llama. Para el equipo siempre */
  open: boolean;
  /** Plan efectivo de user_plan, o el rol del equipo (physician, admin u owner) */
  plan: string;
  /** Preguntas nuevas por día de estudio. null en los planes de pago y en el equipo */
  limit: number | null;
  /** Preguntas nuevas que ya abrió en el día de estudio */
  used: number;
  /** Las que le quedan hoy. null sin tope */
  left: number | null;
  /** Día de estudio, con corte a las 4 a. m. de Mérida (YYYY-MM-DD) */
  day: string;
  /** Cuándo empieza el siguiente día de estudio, ISO 8601 en UTC */
  resetsAt: string;
  /** Con algo negado por el freno, la hora en que puede volver a pedir. null si no hay freno */
  brake: { retryAt: string | null };
}

/** Una fila del catálogo, sin una sola palabra de texto (1.6 y 2.5) */
export interface CatalogRow {
  questionId: string;
  versionId: string;
  version: number;
  branch: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  itemKinds: string[];
  polarity: 'affirmative' | 'negative';
  task: string;
  format: 'clinical_case' | 'direct' | 'serial_case';
  caseId: string | null;
  caseOrder: number | null;
  caseSize: number | null;
  variantOf: string | null;
  examEligible: boolean;
  /** Sesgos de los distractores sin decir cuál es cuál, para el muestreo dirigido (D-080) */
  distractorBiases: string[];
  optionCount: number;
  language: 'es' | 'en';
  status: 'published' | 'retired';
  /** Sube con cada cambio. La app pide desde el último que vio */
  seq: number;
}

/** Respuesta de catalog_changes. Con el banco cerrado, open false y sin filas */
export interface CatalogPage {
  open: boolean;
  rows: CatalogRow[];
  /** El seq que se manda en la siguiente llamada */
  nextSince: number;
  /** No hay más filas después de nextSince */
  done: boolean;
}

export interface FetchedOption {
  /** Id de esta versión de la opción */
  id: string;
  /** Id estable de la opción entre versiones */
  optionId: string;
  position: number;
  text: string;
  isCorrect: boolean;
  biasTag: string | null;
  secondaryBiasTags: string[];
  rationale: string;
}

/** El cuerpo de una versión aprobada, con su explicación (respuesta 19) */
export interface FetchedQuestion {
  questionId: string;
  versionId: string;
  version: number;
  branch: string;
  topic: string;
  subtopic: string;
  caseId: string | null;
  caseOrder: number | null;
  vignette: string;
  prompt: string;
  structure: {
    polarity: 'affirmative' | 'negative';
    task: string;
    format: 'clinical_case' | 'direct' | 'serial_case';
    source: 'auto' | 'physician';
  };
  explanation: string;
  gpcRefs: { title: string; status: 'to_verify' | 'verified' }[];
  itemKinds: string[];
  clues: { text: string; strength: 'pathognomonic' | 'characteristic' | 'nonspecific' }[];
  physicianDifficulty: number;
  variantOf: string | null;
  canonicalOptionIds: string[];
  language: 'es' | 'en';
  createdAt: string;
  options: FetchedOption[];
}

export interface FetchedCase {
  id: string;
  vignette: string;
  createdAt: string;
}

/** Respuesta de fetch_questions (2.5) */
export interface FetchResult {
  questions: FetchedQuestion[];
  cases: FetchedCase[];
  /** id es el que se pidió, de pregunta estable o de versión según el parámetro */
  denied: { id: string; reason: DenyReason }[];
  /** La misma forma que bank_quota */
  quota: QuotaInfo;
}

/** Respuesta de report_question. Sin texto libre del alumno (8.30) */
export interface ReportQuestionResult {
  status: 'created' | 'duplicate' | 'limit' | 'not_found';
  reportId: string | null;
}

/** Respuesta de bias_agreement_summary. Con menos de minPairs se habla de trampas (4.4) */
export interface BiasAgreementSummary {
  pairs: number;
  kappa: number | null;
  vocabulary: 'bias' | 'trap';
  calibrating: boolean;
  minPairs: number;
  minKappa: number;
}

// ===================================================================== Catálogo de mazos

export interface DeckCatalogSubjectInfo {
  subjectKey: string;
  name: string;
  branch: string | null;
  topic: string | null;
  notes: number;
  cards: number;
  /** Bytes del .json más los paquetes de imágenes */
  bytes: number;
  mediaParts: number;
  sha256: string;
}

/** Nota de muestra para Gratis, sin imágenes */
export type DeckPreviewNote =
  { kind: 'basic'; front: string; back: string } | { kind: 'cloze'; text: string; extra: string };

export interface DeckCatalogEntry {
  deckKey: string;
  name: string;
  author: string;
  description: string;
  version: number;
  notes: number;
  cards: number;
  bytes: number;
  subjects: DeckCatalogSubjectInfo[];
  preview: DeckPreviewNote[];
}

/** Respuesta de deck_catalog_list. canDownload es false en Gratis, que solo ve la vista previa */
export interface DeckCatalogList {
  canDownload: boolean;
  decks: DeckCatalogEntry[];
}

// ===================================================================== Flujo editorial

/** Estado de la revisión a ciegas de una versión para quien la consulta (4.4) */
export type ReviewState = 'none' | 'blind_pending' | 'ready';
export type EditorialStatus = 'draft' | 'in_review' | 'approved' | 'rejected';

/**
 * Lo que le falta a una versión para poder aprobarse (3.4). Los que llevan dos puntos dicen la letra
 * de la opción, por ejemplo rationale_missing:B
 */
export type IncompleteCode =
  | 'explanation_missing'
  | 'references_missing'
  | `rationale_missing:${string}`
  | `bias_missing:${string}`
  | `bias_unknown:${string}`;

/** Avisos con casilla que el revisor confirma al aprobar (3.4) */
export type ReviewFlag = 'topic_inferred' | 'kind_control_check';

export type EditorRole = 'author' | 'reviewer' | 'admin' | 'none';

export interface EditorPerson {
  id: string;
  alias: string;
  /** Clave corta del médico para el Sheet (physician_codes). null si no tiene */
  code: string | null;
}

/** Un renglón de editor_list */
export interface EditorListItem {
  questionId: string;
  /** sheet:GO-0012, import:MI-0001 o null si nació en la app */
  sourceKey: string | null;
  latestVersionId: string;
  version: number;
  status: EditorialStatus;
  /** Número de la versión publicada, o null */
  publishedVersion: number | null;
  branch: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  /** Primeros 140 caracteres de la pregunta */
  promptPreview: string;
  author: EditorPerson | null;
  reviewer: EditorPerson | null;
  myRole: Exclude<EditorRole, 'none'>;
  reviewState: ReviewState;
  incomplete: string[];
  flags: string[];
  openReports: number;
  openDistractorFlags: number;
  conflict: boolean;
  missing: boolean;
  retireRequested: boolean;
  retired: boolean;
  updatedAt: string;
}

export interface EditorListResult {
  total: number;
  items: EditorListItem[];
}

/** Filtros de editor_list (4.2). Todos opcionales */
export interface EditorFilter {
  view?: 'to_review' | 'my_drafts' | 'incomplete' | 'reported' | 'conflict' | 'published' | 'all';
  branch?: string;
  topic?: string;
  status?: EditorialStatus;
}

export interface EditorOption {
  id: string;
  optionId: string;
  letter: string | null;
  position: number;
  text: string;
  isCorrect: boolean;
  /** null en la correcta, sin etiquetar o escondida durante el paso a ciegas */
  biasTag: string | null;
  secondaryBiasTags: string[];
  /** null escondida durante el paso a ciegas */
  rationale: string | null;
  /** true solo para el revisor mientras etiqueta a ciegas */
  hidden: boolean;
}

export interface EditorDecision {
  physician: { id: string; alias: string };
  decision: 'approve' | 'request_changes' | 'reject';
  comment: string | null;
  decidedAt: string;
}

/** Una versión en editor_question. Tolerante, porque un borrador puede estar incompleto (5.7) */
export interface EditorVersion {
  versionId: string;
  version: number;
  status: EditorialStatus;
  source: 'sheet' | 'import' | 'app' | 'ai_variant' | null;
  author: EditorPerson | null;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  branch: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  itemKinds: string[];
  structure: {
    polarity: 'affirmative' | 'negative';
    task: string;
    format: 'clinical_case' | 'direct' | 'serial_case';
    source: 'auto' | 'physician';
  };
  vignette: string;
  prompt: string;
  explanation: string;
  gpcRefs: { title: string; status: 'to_verify' | 'verified' }[];
  clues: { text: string; strength: 'pathognomonic' | 'characteristic' | 'nonspecific' }[];
  caseId: string | null;
  caseOrder: number | null;
  variantOf: string | null;
  canonicalOptionIds: string[];
  options: EditorOption[];
  incomplete: string[];
  flags: string[];
  decisions: EditorDecision[];
}

export interface EditorQuestion {
  question: EditorListItem;
  /** De la más reciente a la más vieja */
  versions: EditorVersion[];
  case: {
    id: string;
    vignette: string;
    members: { questionId: string; caseOrder: number; status: EditorialStatus }[];
  } | null;
  review: {
    role: EditorRole;
    state: ReviewState;
    myLabels: { optionId: string; tag: string; locked: boolean }[];
    pendingOptionIds: string[];
  };
  reports: { open: number; byReason: Record<string, number> };
  distractorFlags: {
    id: string;
    optionId: string;
    exposures: number;
    choices: number;
    attraction: number;
    status: 'open' | 'edited' | 'kept' | 'dismissed';
  }[];
  sync: {
    origin: 'sheet' | 'import' | 'app' | 'ai_variant';
    sourceKey: string | null;
    lastRunAt: string | null;
    conflictSince: string | null;
    missingSince: string | null;
  };
}

/** Respuesta de editor_create_question y editor_save_version */
export interface EditorSaveResult {
  status: 'saved';
  questionId: string;
  versionId: string;
  version: number;
  incomplete: string[];
}

/** Respuesta de editor_submit */
export interface EditorSubmitResult {
  status: 'in_review';
  versionId: string;
  reviewerId: string;
}

/** Respuesta de editor_label_option */
export interface EditorLabelResult {
  /** Distractores ya etiquetados por quien llama en esa versión */
  done: number;
  total: number;
  /** true cuando ya etiquetó todos y la versión se le muestra completa */
  revealed: boolean;
}

/** Respuesta de editor_decide */
export interface EditorDecideResult {
  status: EditorialStatus;
  published: boolean;
  /** Aprobada pero esperando a las demás preguntas de su caso seriado (1.6) */
  waitingCase: boolean;
}

/** Una fila de editor_label_pairs, para calcular el detalle del acuerdo en la app */
export interface LabelPair {
  optionId: string;
  authorTag: string;
  reviewerTag: string;
  labeledAt: string;
}

/** Respuesta de editor_my_reviews */
export interface MyReviews {
  from: string;
  to: string;
  approved: number;
  changesRequested: number;
  rejected: number;
  reviewed: number;
  distractorsResolved: number;
}

// ===================================================================== Sincronización con el Sheet

export type SyncOutcome =
  'created' | 'versioned' | 'converged' | 'meta' | 'conflict' | 'rejected' | 'missing';

/** Motivos de rechazo de un renglón (3.3 y 3.4). El renglón no entra */
export type SyncProblemCode =
  | 'id_missing'
  | 'id_format'
  | 'id_duplicate'
  | 'branch_unknown'
  | 'topic_unknown'
  | 'subtopic_unknown'
  | 'subtopic_is_topic'
  | 'difficulty_invalid'
  | 'kind_unknown'
  | 'task_unknown'
  | 'task_undetected'
  | 'polarity_invalid'
  | 'text_too_long'
  | 'prompt_missing'
  | 'correct_invalid'
  | 'options_few'
  | 'option_gap'
  | 'option_orphan'
  | 'canonical_invalid'
  | 'template_placeholder'
  | 'case_inconsistent';

/** Avisos de un renglón que entra. Los de ReviewFlag los confirma el revisor (3.4) */
export type SyncNoticeCode =
  | ReviewFlag
  | 'structure_auto'
  | 'status_approved_ignored'
  | 'status_unknown'
  | 'bias_none_on_correct'
  | 'author_unknown'
  | 'reviewer_unknown'
  | 'author_is_reviewer'
  | 'case_rows_apart'
  | 'language_unknown'
  | 'not_ready';

/** Un problema de un renglón. value es solo de listas cerradas, recortado a 60 caracteres */
export interface SyncProblem {
  code: SyncProblemCode;
  column: string;
  value?: string;
}

export interface SyncRunSummary {
  id: string;
  trigger: 'cron' | 'manual' | 'import';
  target: 'real' | 'test' | 'file';
  mode: 'dry_run' | 'apply';
  status: 'running' | 'ok' | 'partial' | 'failed' | 'skipped' | 'interrupted';
  /** disabled, not_configured, too_soon, running, no_changes, id_formula o sheet_error */
  reason: string | null;
  counts: Record<string, number>;
  startedAt: string;
  finishedAt: string | null;
}

export interface SyncRowResult {
  rowNumber: number | null;
  sheetKey: string | null;
  outcome: SyncOutcome;
  incomplete: string[];
  notices: SyncNoticeCode[];
  problems: SyncProblem[];
  questionId: string | null;
}

/** Una opción de un renglón ya convertido, por letra del Sheet */
export interface SyncQuestionOption {
  letter: string;
  text: string;
  correct: boolean;
  /** Clave del sesgo de la taxonomía, o null si falta o no se reconoció (queda como pendiente) */
  bias: string | null;
  rationale: string;
}

/** El contenido de un renglón ya convertido. Nunca viaja a registros ni a bank_sync_row_results */
export interface SyncQuestion {
  branch: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  itemKinds: string[];
  task: string;
  polarity: 'affirmative' | 'negative';
  /** El médico escribió Tarea y Polaridad. Si no, las detectó el motor de estructura */
  structureDeclared: boolean;
  language: 'es' | 'en';
  vignette: string;
  prompt: string;
  explanation: string;
  refs: string[];
  options: SyncQuestionOption[];
  /** Letras del set canónico */
  canonical: string[];
  caseKey: string | null;
  caseOrder: number | null;
  /** La viñeta del Orden 1 del caso, la misma en todos sus renglones. null sin caso */
  caseVignette: string | null;
}

export type SyncDecision =
  'create' | 'version' | 'converged' | 'conflict' | 'meta_only' | 'rejected';

/** Lo que manda bank-sync a bank_sync_apply por renglón, y admin_bank_import desde el navegador */
export interface SyncRowPayload {
  rowNumber: number;
  key: string;
  rowHash: string;
  metaHash: string;
  decision: SyncDecision;
  /** La versión más reciente que vio el planeador. bank_sync_apply la vuelve a revisar con candado */
  expectLatestVersionId: string | null;
  problems: SyncProblem[];
  incomplete: string[];
  notices: SyncNoticeCode[];
  /** No viaja en rejected ni en dry_run */
  question?: SyncQuestion;
  meta: {
    authorCode: string | null;
    reviewerCode: string | null;
    sheetStatus: 'draft' | 'ready' | 'retire' | null;
  };
}

/** Respuesta de bank_sync_apply por renglón */
export interface SyncApplyResult {
  rowNumber: number;
  outcome: SyncOutcome;
  questionId: string | null;
}

// ===================================================================== Pagos a médicos

/** Una fila de admin_review_report, por médico y mes en hora de Mérida (4.5) */
export interface ReviewReportRow {
  month: string;
  physicianId: string;
  alias: string;
  code: string | null;
  approved: number;
  changesRequested: number;
  rejected: number;
  reviewed: number;
  distractorsResolved: number;
  amountMxn: number | null;
}

/** Una fila de admin_review_report_detail, una por decisión */
export interface ReviewReportDetailRow {
  decidedAt: string;
  month: string;
  physicianId: string;
  alias: string;
  code: string | null;
  /** ID del Sheet o los primeros 8 caracteres del id de la pregunta */
  questionKey: string;
  version: number;
  decision: 'approve' | 'request_changes' | 'reject';
}

// ===================================================================== Códigos de error (2.6)

/** SQLSTATE propios del banco. Los topes del alumno no lanzan error, salen en denied */
export const BANK_ERROR_CODES = {
  staleBase: 'BK002',
  sameAuthorReviewer: 'BK003',
  blindLabels: 'BK004',
  incomplete: 'BK005',
  reportLimit: 'BK006',
  notAssigned: 'BK007',
  flagsUnconfirmed: 'BK008',
  syncBusy: 'BK009',
  deckUnauthorized: 'BK010',
  deckFilesMissing: 'BK011',
} as const;
export type BankErrorCode = (typeof BANK_ERROR_CODES)[keyof typeof BANK_ERROR_CODES];
