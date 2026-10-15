// De dónde salen las preguntas del alumno (B11, 5.1 del plan de B11, paso 2 de BANCO_EN_LA_NUBE.md). Una
// interfaz con dos implementaciones. localSource.ts es el banco de demostración guardado en Dexie, como
// hasta ahora. cloudSource.ts es el catálogo de la nube con los cuerpos que se bajan con fetch_questions.
// Los motores no cambian, porque reciben datos. Las pantallas eligen del pool, piden los cuerpos con
// ensureBodies antes de empezar y después leen de Dexie como siempre.
import type { DatabaseKind } from '../databases';
import type { Question } from '../schemas/bank';
import type { DenyReason, QuotaInfo, ReadPurpose } from './contracts';

/** Lo que se necesita de una pregunta para elegirla, sin su texto */
export interface PoolQuestion extends Pick<
  Question,
  | 'id'
  | 'questionId'
  | 'version'
  | 'caseId'
  | 'caseOrder'
  | 'branch'
  | 'topic'
  | 'subtopic'
  | 'physicianDifficulty'
  | 'itemKinds'
  | 'variantOf'
  | 'isDemo'
> {
  structure: Pick<Question['structure'], 'polarity' | 'task' | 'format'>;
  /** Entra al examen completo, que da puntaje. Las variantes esperan su umbral (8.6) */
  examEligible: boolean;
  language: 'es' | 'en';
  /** Sesgos de sus distractores, para el muestreo dirigido. Vacío en el banco de demostración */
  distractorBiases: readonly string[];
  /**
   * Su cuerpo ya está en este navegador y se puede estudiar sin conexión. Siempre en el banco de
   * demostración. Con la nube, solo lo que ya se bajó
   */
  cached: boolean;
}

export interface StudentPool {
  /** Para práctica, duelos y planificador */
  practice: PoolQuestion[];
  /** Para el examen completo */
  exam: PoolQuestion[];
}

export interface EnsureResult {
  /** Ids de versión ya guardados en Dexie, en el orden pedido */
  ready: string[];
  /** Lo que el servidor no concedió, con ids de versión de la app */
  denied: { id: string; reason: DenyReason }[];
  /** La cuota que dijo el servidor. null sin nube */
  quota: QuotaInfo | null;
  /** Faltaron cuerpos porque no hubo conexión */
  offline: boolean;
}

/**
 * Si el banco se puede usar. ready, ya se puede elegir. never_downloaded, la nube nunca bajó el
 * catálogo y no hay conexión. closed, la nube dice que el banco todavía no abre para el alumno
 */
export type SourceReadiness = 'ready' | 'never_downloaded' | 'closed';

export interface QuestionSource {
  readonly kind: 'local' | 'cloud';
  /** Deja el banco listo para elegir y dice si se puede usar */
  prepare(): Promise<SourceReadiness>;
  pool(): Promise<StudentPool>;
  /** Baja los cuerpos que falten. Lo concedido queda en Dexie y lo negado sale con su motivo */
  ensureBodies(versionIds: readonly string[], purpose: ReadPurpose): Promise<EnsureResult>;
  /** La cuota del día. null sin nube */
  quota(): Promise<QuotaInfo | null>;
  /** Vuelve a pedir lo que cambia en la nube, como el catálogo, la cuota y el acuerdo */
  refresh(): Promise<void>;
}

/** Cada cuánto se vuelve a pedir el catálogo con la app abierta (5.3) */
export const CATALOG_REFRESH_MS = 6 * 60 * 60 * 1000;

/** Lo que decide qué fuente usar */
export interface SourceContext {
  database: DatabaseKind;
  cloudConfigured: boolean;
  /** La bandera cloudBank, que la base también lee (bank_open_for_students) */
  cloudBank: boolean;
  /** Estado de la cuenta en la nube (src/app/cloudState.ts) */
  cloudStatus: 'off' | 'checking' | 'signed-out' | 'linked' | 'error';
}

/**
 * La nube solo con la base real, la nube configurada, la bandera cloudBank y una cuenta que entró. Sin
 * conexión la cuenta queda en error o comprobando y sigue con la nube, que estudia con lo ya bajado y
 * nunca cae al banco de demostración (5.3). La base de demostración siempre usa el banco local (5.6)
 */
export function questionSourceKind(context: SourceContext): 'local' | 'cloud' {
  if (context.database !== 'real' || !context.cloudConfigured || !context.cloudBank) return 'local';
  return context.cloudStatus === 'linked' ||
    context.cloudStatus === 'checking' ||
    context.cloudStatus === 'error'
    ? 'cloud'
    : 'local';
}
