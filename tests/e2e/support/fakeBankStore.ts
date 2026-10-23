// Modelo en memoria del banco en la nube para el Supabase simulado de Playwright (B11, Paso 0, 6.3 del
// plan de B11). Es el único modelo. fakeBank.ts (alumno, paquete B) y fakeEditorial.ts (médico y admin,
// paquete C) solo lo leen y lo cambian con sus funciones exportadas, y fakeSupabase.ts los engancha con
// attachBank. Imita las tablas de supabase/migrations/20261023000001 a 20261023000006 y las formas JSON
// de src/data/bank/contracts.ts, con ids uuid como en la nube.
//
// Todo el texto que siembra lleva [Prueba] y dice que es contenido simulado, nunca contenido médico
// (CLAUDE.md). Las lecturas, las decisiones y las etiquetas solo se agregan, como en la base.
import { randomUUID } from 'node:crypto';
import type {
  CatalogRow,
  EditorialStatus,
  ReadPurpose,
  SyncRowResult,
  SyncRunSummary,
} from '@/data/bank/contracts';
import { formatPassageSource } from '@/data/content/passageSource';
import type { Role } from '@/data/schemas/common';

/** Marca de todo texto simulado del banco */
export const FAKE_BANK_TEXT_MARK = '[Prueba] Contenido simulado, no es contenido médico.';

/** Las funciones rpc del banco que fakeSupabase.ts manda a attachBank (1.18 del plan de B11) */
export const BANK_STUDENT_RPCS = [
  'catalog_changes',
  'fetch_questions',
  'bank_quota',
  'report_question',
  'bias_agreement_summary',
  'deck_catalog_list',
  'record_deck_download',
] as const;

export const BANK_EDITORIAL_RPCS = [
  'editor_list',
  'editor_question',
  'editor_create_question',
  'editor_save_version',
  'editor_submit',
  'editor_label_option',
  'editor_decide',
  'editor_reports',
  'editor_set_report_status',
  'editor_distractor_queue',
  'editor_resolve_distractor',
  'editor_label_pairs',
  'editor_my_reviews',
  'editor_resolve_sync_conflict',
  'admin_bank_overview',
  'admin_assign_questions',
  'admin_set_topic_reviewer',
  'admin_set_physician_code',
  'admin_bank_team',
  'admin_bank_settings',
  'admin_save_bank_settings',
  'admin_retire_question',
  'admin_restore_question',
  'admin_confirm_missing',
  'admin_bank_sync_runs',
  'admin_bank_sync_rows',
  'admin_bank_import',
  'admin_review_report',
  'admin_review_report_detail',
  'admin_bank_read_alerts',
  'admin_deck_catalog_register',
  'admin_deck_catalog_publish',
  'admin_deck_catalog_retire',
  'admin_deck_catalog_overview',
  'admin_deck_catalog_set_free_access',
  'owner_confirm_deck_authorization',
  'owner_confirm_deck_version',
] as const;

export type BankStudentRpc = (typeof BANK_STUDENT_RPCS)[number];
export type BankEditorialRpc = (typeof BANK_EDITORIAL_RPCS)[number];
export type BankRpc = BankStudentRpc | BankEditorialRpc;

const BANK_RPC_SET: ReadonlySet<string> = new Set<string>([
  ...BANK_STUDENT_RPCS,
  ...BANK_EDITORIAL_RPCS,
]);
export const isBankRpc = (name: string): name is BankRpc => BANK_RPC_SET.has(name);

/** El bucket privado del catálogo de mazos */
export const DECK_CATALOG_BUCKET = 'deck-catalog';

// ===================================================================== Tablas

export interface FakeBankOption {
  /** Id de esta versión de la opción */
  id: string;
  /** Id estable entre versiones */
  optionId: string;
  letter: string | null;
  position: number;
  text: string;
  isCorrect: boolean;
  /** La etiqueta del autor. null en la correcta o en un borrador incompleto */
  biasTag: string | null;
  secondaryBiasTags: string[];
  rationale: string;
}

export interface FakeBankVersion {
  id: string;
  questionId: string;
  version: number;
  status: EditorialStatus;
  source: 'sheet' | 'import' | 'app' | 'ai_variant';
  authorId: string | null;
  branch: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  itemKinds: string[];
  polarity: 'affirmative' | 'negative';
  task: string;
  format: 'clinical_case' | 'direct' | 'serial_case';
  structureSource: 'auto' | 'physician';
  caseId: string | null;
  caseOrder: number | null;
  variantOf: string | null;
  language: 'es' | 'en';
  vignette: string;
  prompt: string;
  explanation: string;
  gpcRefs: { title: string; status: 'to_verify' | 'verified' }[];
  clues: { text: string; strength: 'pathognomonic' | 'characteristic' | 'nonspecific' }[];
  canonicalOptionIds: string[];
  options: FakeBankOption[];
  incomplete: string[];
  flags: string[];
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
}

export interface FakeBankQuestion {
  questionId: string;
  origin: 'sheet' | 'import' | 'app' | 'ai_variant';
  sourceKey: string | null;
  latestVersionId: string;
  publishedVersionId: string | null;
  status: 'active' | 'retired';
  retireRequestedAt: string | null;
  conflictSince: string | null;
  missingSince: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FakeBankCase {
  id: string;
  caseKey: string | null;
  vignette: string;
  createdAt: string;
}

export interface FakeBankRead {
  userId: string;
  questionId: string;
  versionId: string;
  /** Día de estudio YYYY-MM-DD */
  day: string;
  plan: string;
  purpose: ReadPurpose;
  createdAt: string;
}

export interface FakeBankReadAlert {
  userId: string;
  day: string;
  kind: 'daily_volume' | 'week_share' | 'brake';
  value: number;
  createdAt: string;
}

export interface FakeAssignment {
  questionId: string;
  physicianId: string;
  role: 'author' | 'reviewer';
  assignedAt: string;
  revokedAt: string | null;
  /** Quién asignó. null o sin valor si vino del Sheet o de una siembra */
  assignedBy?: string | null;
}

export interface FakeDecision {
  id: string;
  versionId: string;
  questionId: string;
  version: number;
  physicianId: string;
  decision: 'approve' | 'request_changes' | 'reject';
  comment: string | null;
  checks: string[];
  decidedAt: string;
}

export interface FakeBiasLabel {
  optionId: string;
  labelerId: string;
  versionId: string;
  tag: string;
  authorTag: string | null;
  labeledAt: string;
  lockedAt: string | null;
}

export interface FakeContentReport {
  id: string;
  reporterId: string;
  versionId: string;
  questionId: string | null;
  reason: 'clinical_error' | 'wrong_key' | 'typo' | 'outdated' | 'other';
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface FakeDistractorFlag {
  id: string;
  questionId: string;
  optionId: string;
  versionId: string;
  exposures: number;
  choices: number;
  attraction: number;
  status: 'open' | 'edited' | 'kept' | 'dismissed';
  flaggedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  note: string | null;
}

/** Un correo encolado como lo deja enqueue_email, sin correo del destinatario */
export interface FakeOutboxEmail {
  kind: string;
  recipientUser: string | null;
  recipientRole: 'team' | null;
  dedupeKey: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface FakeSyncRun extends SyncRunSummary {
  actorId: string | null;
  rows: SyncRowResult[];
}

export interface FakeDeckSubject {
  subjectKey: string;
  name: string;
  branch: string | null;
  topic: string | null;
  notes: number;
  cards: number;
  jsonBytes: number;
  mediaBytes: number;
  mediaParts: number;
  sha256: string;
}

export interface FakeDeckVersion {
  version: number;
  status: 'uploading' | 'published' | 'retired';
  subjects: FakeDeckSubject[];
  /** La vista previa de esta versión. Pasa al mazo al publicar, como en la base */
  preview?: FakeDeck['preview'];
  createdAt: string;
  publishedAt: string | null;
}

export interface FakeDeck {
  deckKey: string;
  name: string;
  description: string;
  author: string;
  license: 'own' | 'third_party';
  authorizationNote: string | null;
  authorizationConfirmedAt: string | null;
  /** La versión más alta que confirmó el dueño, como authorization_confirmed_version */
  authorizationConfirmedVersion: number | null;
  /** La nota que escribió el dueño al confirmar. authorizationNote es la del admin y no se pisan */
  authorizationConfirmedNote: string | null;
  /** El plan Gratis puede bajar este mazo, como free_access */
  freeAccess: boolean;
  status: 'draft' | 'published' | 'retired';
  publishedVersion: number | null;
  preview: (
    { kind: 'basic'; front: string; back: string } | { kind: 'cloze'; text: string; extra: string }
  )[];
  versions: FakeDeckVersion[];
}

export interface FakeDeckDownload {
  userId: string;
  deckKey: string;
  version: number;
  subjectKey: string;
  bytes: number;
  createdAt: string;
}

export interface FakeStorageObject {
  bucket: string;
  /** Ruta dentro del bucket, por ejemplo paco-mi/v1/infectologia.json */
  name: string;
  bytes: Buffer;
  contentType: string;
  createdAt: string;
}

/**
 * Los ajustes del banco (1.16 del plan de B11). perHour, alertDaily, alertWeekShare y la tarifa viven en
 * bank_private_settings y solo salen por admin_bank_settings (B5 de la revisión)
 */
export interface FakeBankSettings {
  bankLimits: {
    perMinute: number;
    perHour: number;
    alertDaily: number;
    alertWeekShare: number;
    reportsPerDay: number;
    maxFetch: number;
  };
  bankSync: {
    enabled: boolean;
    mode: 'dry_run' | 'apply';
    tab: string;
    maxRows: number;
    minIntervalSeconds: number;
    idPattern: string;
  };
  bankGoal: { approvedToOpen: number };
  physicianPay: { perReviewMxn: number | null };
  /** Límite diario de Gratis, el de plans.free.dailyQuestions */
  freeDaily: number;
}

export interface FakeBankStore {
  questions: Map<string, FakeBankQuestion>;
  versions: Map<string, FakeBankVersion>;
  cases: Map<string, FakeBankCase>;
  /** Catálogo publicado por id estable de la pregunta */
  catalog: Map<string, CatalogRow>;
  /** El último seq que se dio al catálogo */
  seq: number;
  reads: FakeBankRead[];
  readAlerts: FakeBankReadAlert[];
  assignments: FakeAssignment[];
  decisions: FakeDecision[];
  labels: FakeBiasLabel[];
  reports: FakeContentReport[];
  distractorFlags: FakeDistractorFlag[];
  /** Clave corta de cada médico para el Sheet, por id de cuenta */
  physicianCodes: Map<string, string>;
  /** Revisor por omisión de cada subespecialidad, con la llave rama/tema */
  topicReviewers: Map<string, string>;
  outbox: FakeOutboxEmail[];
  syncRuns: FakeSyncRun[];
  decks: Map<string, FakeDeck>;
  deckDownloads: FakeDeckDownload[];
  /** Objetos de Storage del bucket deck-catalog, por ruta */
  objects: Map<string, FakeStorageObject>;
  settings: FakeBankSettings;
  /** Hora simulada en milisegundos. Las specs la mueven con advanceStudyDay */
  now: () => number;
  /** Días que se le suman al día de estudio, para simular el día siguiente */
  dayOffset: number;
}

export function createFakeBankStore(options: { now?: () => number } = {}): FakeBankStore {
  return {
    questions: new Map(),
    versions: new Map(),
    cases: new Map(),
    catalog: new Map(),
    seq: 0,
    reads: [],
    readAlerts: [],
    assignments: [],
    decisions: [],
    labels: [],
    reports: [],
    distractorFlags: [],
    physicianCodes: new Map(),
    topicReviewers: new Map(),
    outbox: [],
    syncRuns: [],
    decks: new Map(),
    deckDownloads: [],
    objects: new Map(),
    settings: {
      bankLimits: {
        perMinute: 300,
        perHour: 900,
        alertDaily: 600,
        alertWeekShare: 0.5,
        reportsPerDay: 10,
        maxFetch: 100,
      },
      bankSync: {
        enabled: false,
        mode: 'dry_run',
        tab: 'Preguntas',
        maxRows: 5000,
        minIntervalSeconds: 60,
        idPattern: '^[A-Z]{2,4}-[0-9]{4,5}$',
      },
      bankGoal: { approvedToOpen: 300 },
      physicianPay: { perReviewMxn: null },
      freeDaily: 20,
    },
    now: options.now ?? (() => Date.now()),
    dayOffset: 0,
  };
}

// ===================================================================== Quién llama

/** Lo que fakeSupabase.ts sabe de quien llama una rpc del banco */
export interface FakeBankCaller {
  userId: string;
  role: Role;
  alias: string;
  /** El dispositivo de la sesión es el activo de la cuenta (is_active_device) */
  activeDevice: boolean;
  /** Plan efectivo de user_plan */
  plan: string;
  /** Banderas de platform_settings.feature_flags, como las ve la base */
  flags: Readonly<Record<string, boolean>>;
}

/** Respuesta de una ruta del banco. json se manda como JSON, bytes como archivo */
export type FakeBankReply =
  { status: number; json: unknown } | { status: number; bytes: Buffer; contentType: string };

/** El equipo, con rol de médico, admin o dueño */
export const isTeam = (caller: FakeBankCaller) => caller.role !== 'student';

/** El banco está abierto para los alumnos (bank_open_for_students) */
export const bankOpen = (caller: FakeBankCaller) => caller.flags.cloudBank === true;

// ===================================================================== Días y catálogo

const DAY_MS = 86_400_000;
const MERIDA_OFFSET_MS = -6 * 3_600_000;

/** El día de estudio, con corte a las 4 a. m. de Mérida, como study_day() */
export function fakeStudyDay(store: FakeBankStore): string {
  const shifted = store.now() + MERIDA_OFFSET_MS - 4 * 3_600_000 + store.dayOffset * DAY_MS;
  return new Date(shifted).toISOString().slice(0, 10);
}

/** Cuándo empieza el siguiente día de estudio, en UTC */
export function fakeStudyDayResetsAt(store: FakeBankStore): string {
  const day = fakeStudyDay(store);
  const start = Date.parse(`${day}T04:00:00.000Z`) - MERIDA_OFFSET_MS - store.dayOffset * DAY_MS;
  return new Date(start + DAY_MS).toISOString();
}

/** Simula el día de estudio siguiente, como mover day en las pruebas SQL */
export function advanceStudyDay(store: FakeBankStore, days = 1): void {
  store.dayOffset += days;
}

const iso = (store: FakeBankStore) => new Date(store.now()).toISOString();

/** La fila del catálogo de una versión, sin texto */
export function catalogRowOf(store: FakeBankStore, version: FakeBankVersion): CatalogRow {
  const caseSize = version.caseId
    ? [...store.versions.values()].filter(
        (item) =>
          item.caseId === version.caseId &&
          store.questions.get(item.questionId)?.latestVersionId === item.id,
      ).length
    : null;
  return {
    questionId: version.questionId,
    versionId: version.id,
    version: version.version,
    branch: version.branch,
    topic: version.topic,
    subtopic: version.subtopic,
    difficulty: version.difficulty,
    itemKinds: [...version.itemKinds],
    polarity: version.polarity,
    task: version.task,
    format: version.format,
    caseId: version.caseId,
    caseOrder: version.caseOrder,
    caseSize,
    variantOf: version.variantOf,
    examEligible: version.variantOf === null,
    distractorBiases: [
      ...new Set(
        version.options.flatMap((option) => (option.biasTag === null ? [] : [option.biasTag])),
      ),
    ].sort(),
    optionCount: version.options.length,
    language: version.language,
    status: 'published',
    seq: store.seq,
  };
}

/** Publica la versión aprobada más reciente de una pregunta, como bank_publish */
export function publishQuestion(store: FakeBankStore, questionId: string): void {
  const question = store.questions.get(questionId);
  if (!question) throw new Error(`No existe la pregunta ${questionId}`);
  const approved = [...store.versions.values()]
    .filter((item) => item.questionId === questionId && item.status === 'approved')
    .sort((a, b) => b.version - a.version)[0];
  if (!approved) throw new Error(`La pregunta ${questionId} no tiene versión aprobada`);
  store.seq += 1;
  question.publishedVersionId = approved.id;
  question.updatedAt = iso(store);
  store.catalog.set(questionId, { ...catalogRowOf(store, approved), seq: store.seq });
}

/** Retira una pregunta del catálogo, como admin_retire_question */
export function retireQuestion(store: FakeBankStore, questionId: string): void {
  const question = store.questions.get(questionId);
  const row = store.catalog.get(questionId);
  if (!question || !row) throw new Error(`La pregunta ${questionId} no está publicada`);
  store.seq += 1;
  question.status = 'retired';
  store.catalog.set(questionId, { ...row, status: 'retired', seq: store.seq });
}

// ===================================================================== Siembras de ayuda

const TOPICS: readonly { branch: string; topic: string; subtopic: string }[] = [
  { branch: 'internal_medicine', topic: 'cardiology', subtopic: 'hypertension' },
  { branch: 'pediatrics', topic: 'neonatology', subtopic: 'neonatal_jaundice' },
  { branch: 'obstetrics_gynecology', topic: 'prenatal_care', subtopic: 'gestational_diabetes' },
  { branch: 'general_surgery', topic: 'acute_abdomen', subtopic: 'appendicitis' },
];
const TAGS = ['anchoring', 'availability_heuristic', 'premature_closure', 'framing_effect'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export interface SeedQuestionOptions {
  /** Estado de la versión 1. approved la publica */
  status?: EditorialStatus;
  /** Origen de la pregunta. sheet le da una clave GO-0001 en adelante */
  origin?: FakeBankQuestion['origin'];
  authorId?: string | null;
  optionCount?: number;
}

/** Siembra n preguntas simuladas con cuatro opciones. Con status approved las publica */
export function seedQuestions(
  store: FakeBankStore,
  count: number,
  options: SeedQuestionOptions = {},
): FakeBankQuestion[] {
  const status = options.status ?? 'approved';
  const origin = options.origin ?? 'sheet';
  const optionCount = options.optionCount ?? 4;
  const created: FakeBankQuestion[] = [];
  for (let index = 0; index < count; index += 1) {
    const number = store.questions.size + 1;
    const questionId = randomUUID();
    const versionId = randomUUID();
    const place = TOPICS[number % TOPICS.length] ?? TOPICS[0];
    if (!place) throw new Error('Sin temas de siembra');
    const at = iso(store);
    const bankOptions: FakeBankOption[] = Array.from({ length: optionCount }, (_, position) => ({
      id: randomUUID(),
      optionId: randomUUID(),
      letter: LETTERS[position] ?? null,
      position,
      text: `[Prueba] Opción ${LETTERS[position] ?? position} de la pregunta ${number}`,
      isCorrect: position === 0,
      biasTag: position === 0 ? null : (TAGS[(position + number) % TAGS.length] ?? null),
      secondaryBiasTags: [],
      rationale: `[Prueba] Justificación simulada de la opción ${LETTERS[position] ?? position}`,
    }));
    const version: FakeBankVersion = {
      id: versionId,
      questionId,
      version: 1,
      status,
      source: origin,
      authorId: options.authorId ?? null,
      branch: place.branch,
      topic: place.topic,
      subtopic: place.subtopic,
      difficulty: (number % 5) + 1,
      itemKinds: [],
      polarity: 'affirmative',
      task: 'diagnosis',
      format: 'clinical_case',
      structureSource: 'physician',
      caseId: null,
      caseOrder: null,
      variantOf: null,
      language: 'es',
      vignette: `${FAKE_BANK_TEXT_MARK} Caso simulado número ${number}.`,
      prompt: `[Prueba] ¿Cuál es la respuesta simulada ${number}?`,
      explanation: `${FAKE_BANK_TEXT_MARK} Explicación simulada ${number}.`,
      gpcRefs: [{ title: '[Prueba] Referencia simulada', status: 'to_verify' }],
      clues: [],
      canonicalOptionIds: bankOptions.slice(0, 4).map((option) => option.id),
      options: bankOptions,
      incomplete: [],
      flags: [],
      createdAt: at,
      submittedAt: status === 'draft' ? null : at,
      decidedAt: status === 'approved' || status === 'rejected' ? at : null,
    };
    const question: FakeBankQuestion = {
      questionId,
      origin,
      sourceKey: origin === 'sheet' ? `sheet:GO-${String(number).padStart(4, '0')}` : null,
      latestVersionId: versionId,
      publishedVersionId: null,
      status: 'active',
      retireRequestedAt: null,
      conflictSince: null,
      missingSince: null,
      createdAt: at,
      updatedAt: at,
    };
    store.questions.set(questionId, question);
    store.versions.set(versionId, version);
    if (status === 'approved') publishQuestion(store, questionId);
    created.push(question);
  }
  return created;
}

// ===================================================================== Casos de lectura en inglés (B13)

/**
 * La fuente de los textos simulados de inglés, con la forma fija de passageSource.ts. Es la primera
 * referencia de cada pregunta, como la deja el editor del médico (1.4 del plan de B13)
 */
export const FAKE_ENGLISH_SOURCE = formatPassageSource({
  title: '[Prueba] Texto simulado',
  license: 'team',
  url: null,
});

/** Los siete subtemas de Comprensión de lectura, uno por rama clínica de la que trata el texto */
const ENGLISH_SUBTOPICS = [
  'english_internal_medicine',
  'english_pediatrics',
  'english_obstetrics_gynecology',
  'english_general_surgery',
  'english_family_medicine',
  'english_emergency_medicine',
  'english_public_health',
] as const;

/** Los sesgos que más aplican a la lectura (1.3 del plan de B13) */
const READING_TAGS = [
  'belief_bias',
  'inattentional_blindness',
  'focusing_illusion',
  'framing_effect',
  'anchoring',
];

export interface SeedEnglishCasesOptions {
  /**
   * Preguntas de cada caso. Un número, o una lista que se repite caso por caso, por ejemplo [2, 3] para
   * alternar casos de dos y de tres preguntas. 3 por omisión
   */
  itemsPerCase?: number | readonly number[];
  /** Estado de las versiones. approved las publica, con el caso completo, como bank_publish */
  status?: EditorialStatus;
  origin?: FakeBankQuestion['origin'];
  authorId?: string | null;
}

/**
 * Siembra casos de lectura en inglés (B13). Cada caso es un caso seriado con su texto en inglés como viñeta,
 * de dos o tres preguntas con cuatro opciones en inglés, justificaciones y explicación en español y la
 * fuente del texto como primera referencia. Va en Inglés médico, Comprensión de lectura, con un subtema
 * por rama clínica. Todo el texto lleva [Prueba] y es simulado, nunca contenido médico. Con status
 * approved publica los casos completos, y las preguntas salen en el orden del caso
 */
export function seedEnglishCases(
  store: FakeBankStore,
  cases: number,
  options: SeedEnglishCasesOptions = {},
): FakeBankQuestion[] {
  const status = options.status ?? 'approved';
  const origin = options.origin ?? 'sheet';
  const perCase = options.itemsPerCase ?? 3;
  const sizes: readonly number[] = typeof perCase === 'number' ? [perCase] : perCase;
  if (sizes.length === 0 || sizes.some((size) => !Number.isInteger(size) || size < 1)) {
    throw new Error('itemsPerCase pide enteros de 1 en adelante');
  }
  const created: FakeBankQuestion[] = [];
  for (let index = 0; index < cases; index += 1) {
    // Los textos y las preguntas siguen contando entre una siembra y otra
    const textNumber =
      [...store.cases.values()].filter((item) => item.caseKey?.startsWith('EN-C') === true).length +
      1;
    const size = sizes[index % sizes.length] ?? 3;
    const at = iso(store);
    const caseId = randomUUID();
    const vignette =
      `[Prueba] Simulated reading passage ${textNumber}. This short text is invented for tests and has ` +
      `no medical value. It describes a fictional clinic visit in plain words, so that the reading ` +
      `screen has something to show. Read it carefully before answering.`;
    store.cases.set(caseId, {
      id: caseId,
      caseKey: `EN-C${String(textNumber).padStart(3, '0')}`,
      vignette,
      createdAt: at,
    });
    const subtopic =
      ENGLISH_SUBTOPICS[textNumber % ENGLISH_SUBTOPICS.length] ?? ENGLISH_SUBTOPICS[0];
    const questions: FakeBankQuestion[] = [];
    for (let order = 1; order <= size; order += 1) {
      const number =
        [...store.versions.values()].filter((item) => item.language === 'en').length + 1;
      const questionId = randomUUID();
      const versionId = randomUUID();
      const bankOptions: FakeBankOption[] = Array.from({ length: 4 }, (_, position) => ({
        id: randomUUID(),
        optionId: randomUUID(),
        letter: LETTERS[position] ?? null,
        position,
        text: `[Prueba] Option ${LETTERS[position] ?? position} of item ${order} of passage ${textNumber}`,
        isCorrect: position === 0,
        biasTag:
          position === 0 ? null : (READING_TAGS[(position + number) % READING_TAGS.length] ?? null),
        secondaryBiasTags: [],
        rationale: `[Prueba] Justificación simulada de la opción ${LETTERS[position] ?? position}`,
      }));
      const version: FakeBankVersion = {
        id: versionId,
        questionId,
        version: 1,
        status,
        source: origin,
        authorId: options.authorId ?? null,
        branch: 'medical_english',
        topic: 'reading_comprehension',
        subtopic,
        difficulty: (number % 5) + 1,
        itemKinds: [],
        polarity: 'affirmative',
        task: 'data_interpretation',
        format: 'serial_case',
        structureSource: 'auto',
        caseId,
        caseOrder: order,
        variantOf: null,
        language: 'en',
        vignette: '',
        prompt: `[Prueba] According to the passage, which statement is correct? (item ${order})`,
        explanation: `${FAKE_BANK_TEXT_MARK} Explicación simulada del texto ${textNumber}, pregunta ${order}.`,
        gpcRefs: [{ title: FAKE_ENGLISH_SOURCE, status: 'to_verify' }],
        clues: [],
        canonicalOptionIds: bankOptions.map((option) => option.id),
        options: bankOptions,
        incomplete: [],
        flags: [],
        createdAt: at,
        submittedAt: status === 'draft' ? null : at,
        decidedAt: status === 'approved' || status === 'rejected' ? at : null,
      };
      const question: FakeBankQuestion = {
        questionId,
        origin,
        sourceKey: origin === 'sheet' ? `sheet:EN-${String(number).padStart(4, '0')}` : null,
        latestVersionId: versionId,
        publishedVersionId: null,
        status: 'active',
        retireRequestedAt: null,
        conflictSince: null,
        missingSince: null,
        createdAt: at,
        updatedAt: at,
      };
      store.questions.set(questionId, question);
      store.versions.set(versionId, version);
      questions.push(question);
    }
    // El caso se publica completo, con todas sus preguntas ya creadas para que caseSize sea el real
    if (status === 'approved') {
      for (const question of questions) publishQuestion(store, question.questionId);
    }
    created.push(...questions);
  }
  return created;
}

/** Aprueba y publica la versión más reciente de todas las preguntas que no estén aprobadas */
export function approveAll(store: FakeBankStore): number {
  let count = 0;
  for (const question of store.questions.values()) {
    const latest = store.versions.get(question.latestVersionId);
    if (!latest || latest.status === 'approved' || question.status === 'retired') continue;
    latest.status = 'approved';
    latest.incomplete = [];
    latest.decidedAt = iso(store);
    publishQuestion(store, question.questionId);
    count += 1;
  }
  return count;
}

/**
 * Siembra n pares de etiquetas (autor y revisor) para el acuerdo. agreement es la parte de los pares
 * en los que coinciden, de 0 a 1. Cada par es una opción distinta de una versión simulada
 */
export function seedPairs(
  store: FakeBankStore,
  count: number,
  agreement: number,
  reviewerId: string,
): FakeBiasLabel[] {
  const agreeing = Math.round(count * Math.min(Math.max(agreement, 0), 1));
  const created: FakeBiasLabel[] = [];
  for (let index = 0; index < count; index += 1) {
    const authorTag = TAGS[index % TAGS.length] ?? 'anchoring';
    const tag = index < agreeing ? authorTag : (TAGS[(index + 1) % TAGS.length] ?? 'anchoring');
    const label: FakeBiasLabel = {
      optionId: randomUUID(),
      labelerId: reviewerId,
      versionId: randomUUID(),
      tag,
      authorTag,
      labeledAt: iso(store),
      lockedAt: iso(store),
    };
    store.labels.push(label);
    created.push(label);
  }
  return created;
}
