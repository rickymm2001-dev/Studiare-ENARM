// Repositorio editorial (B11, 5.7 del plan de B11). Una sola interfaz para el banco del médico y del
// admin con dos versiones. La de la nube llama las funciones editor_* de Supabase y la local trabaja
// sobre la base de este navegador, la de la demo, con la misma regla a ciegas. Las pantallas 17 a 22
// leen y escriben solo por aquí, así la demo enseña el mismo flujo que la nube.
//
// Los ids son de la base que responde. En la nube son uuid tal como salen de las funciones, porque nada
// editorial se guarda en Dexie (5.2) y el médico trabaja en línea. En la local son ULID.
import type {
  EditorDecideResult,
  EditorFilter,
  EditorLabelResult,
  EditorListResult,
  EditorQuestion,
  EditorSaveResult,
  EditorSubmitResult,
  LabelPair,
  MyReviews,
} from '../bank/contracts';
import type { ContentReport } from '../schemas/bank';
import type { QuestionDraft } from '@/features/physician/editorDraft';

export type ReportReason = ContentReport['reason'];
export type ReportStatus = ContentReport['status'];
export type DistractorStatus = 'open' | 'edited' | 'kept' | 'dismissed';
export type DistractorResolution = Exclude<DistractorStatus, 'open'>;
export type ReviewDecision = 'approve' | 'request_changes' | 'reject';
export type SyncConflictChoice = 'keep_app' | 'take_sheet';

/** Un reporte de error de un alumno, sin nada del alumno (8.30) */
export interface EditorReportRow {
  id: string;
  /** Id estable de la pregunta */
  questionId: string;
  /** ID del Sheet, o los primeros 8 caracteres del id */
  questionKey: string;
  /** La versión que el alumno tenía a la vista */
  versionId: string;
  /** Número de esa versión. null si ya no está en la base */
  version: number | null;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
}

/** Lo que se muestra de una pregunta con reportes, sin abrir el editor */
export interface EditorReportQuestion {
  questionId: string;
  questionKey: string;
  /** Primeros caracteres de la pregunta, o null si no se pudo leer */
  promptPreview: string | null;
  branch: string | null;
  topic: string | null;
  /** Número de la versión más reciente, para marcar los reportes de una versión anterior */
  latestVersion: number | null;
}

export interface EditorReports {
  rows: EditorReportRow[];
  questions: EditorReportQuestion[];
  /** Reportes de apuntes de alumnos, que son privados y no se revisan aquí. Solo en la local */
  notes: number;
}

/** Un distractor que casi nadie elige, de la cola que llena B14 (4.7) */
export interface EditorDistractorFlag {
  id: string;
  questionId: string;
  questionKey: string;
  versionId: string;
  optionId: string;
  exposures: number;
  choices: number;
  /** Parte de las exposiciones en que lo eligieron, de 0 a 1 */
  attraction: number;
  status: DistractorStatus;
  flaggedAt: string;
  resolvedAt: string | null;
  note: string | null;
}

export interface EditorialRepo {
  /** local en la demo y sin nube. cloud con base real, cuenta conectada y rol del equipo */
  readonly kind: 'local' | 'cloud';
  list(filter: EditorFilter, page: { limit: number; offset: number }): Promise<EditorListResult>;
  question(questionId: string): Promise<EditorQuestion>;
  /** Una pregunta nueva, o la variante de otra (B12), en borrador con quien la crea como autor */
  createQuestion(draft: QuestionDraft, variantOf?: string): Promise<EditorSaveResult>;
  /** Versión nueva sobre la base. Si ya no es la más reciente lanza stale (BK002) */
  saveVersion(
    questionId: string,
    baseVersionId: string,
    draft: QuestionDraft,
  ): Promise<EditorSaveResult>;
  submit(versionId: string): Promise<EditorSubmitResult>;
  /** Etiqueta a ciegas un distractor. optionId es el id estable de la opción */
  label(versionId: string, optionId: string, tag: string): Promise<EditorLabelResult>;
  decide(
    versionId: string,
    decision: ReviewDecision,
    comment: string,
    checks: readonly string[],
  ): Promise<EditorDecideResult>;
  /** Todos los reportes de lo que quien llama puede ver, en cualquier estado */
  reports(): Promise<EditorReports>;
  setReportsStatus(ids: readonly string[], status: ReportStatus): Promise<number>;
  distractorQueue(status: DistractorStatus | 'all'): Promise<EditorDistractorFlag[]>;
  resolveDistractor(id: string, resolution: DistractorResolution, note?: string): Promise<void>;
  /** Pares de etiqueta del autor y del revisor, sin texto, para el detalle del acuerdo */
  labelPairs(): Promise<LabelPair[]>;
  /** Mis revisiones en un rango de días YYYY-MM-DD de Mérida */
  myReviews(from: string, to: string): Promise<MyReviews>;
  resolveSyncConflict(questionId: string, choice: SyncConflictChoice): Promise<void>;
}

/**
 * Lo que puede salir mal, con los códigos de 2.6 del plan de B11. forbidden es el 42501, que con B9
 * también es el equipo sin segundo factor
 */
export type EditorialErrorCode =
  | 'stale'
  | 'same_author_reviewer'
  | 'blind_labels'
  | 'incomplete'
  | 'not_assigned'
  | 'flags_unconfirmed'
  | 'sync_busy'
  | 'report_limit'
  | 'deck_unauthorized'
  | 'deck_files_missing'
  | 'forbidden'
  | 'no_session'
  | 'invalid'
  | 'not_found'
  | 'network'
  | 'unknown';

const SQLSTATE_CODES: Readonly<Record<string, EditorialErrorCode>> = {
  BK002: 'stale',
  BK003: 'same_author_reviewer',
  BK004: 'blind_labels',
  BK005: 'incomplete',
  BK007: 'not_assigned',
  BK008: 'flags_unconfirmed',
  BK009: 'sync_busy',
  BK006: 'report_limit',
  BK010: 'deck_unauthorized',
  BK011: 'deck_files_missing',
  '42501': 'forbidden',
  '28000': 'no_session',
  '22023': 'invalid',
  PGRST202: 'unknown',
};

/** El código de la app para el SQLSTATE de una respuesta. Sin código la petición no llegó */
export function editorialCodeOf(sqlState: string | null | undefined): EditorialErrorCode {
  if (!sqlState) return 'network';
  return SQLSTATE_CODES[sqlState] ?? 'unknown';
}

export class EditorialError extends Error {
  readonly code: EditorialErrorCode;
  /** El detalle que manda la base, como la casilla que falta o los pendientes. Sin texto médico */
  readonly detail: string | null;
  constructor(code: EditorialErrorCode, detail: string | null = null) {
    super(`Error editorial ${code}`);
    this.name = 'EditorialError';
    this.code = code;
    this.detail = detail;
  }
}

/** El código de un error de la interfaz, o unknown si no es de aquí */
export const errorCodeOf = (error: unknown): EditorialErrorCode =>
  error instanceof EditorialError ? error.code : 'unknown';
