// Banco en la nube guardado en el navegador (B11, 5.2 del plan de B11). El catálogo que baja la app,
// sin una sola palabra de texto, el estado de la bajada con la última cuota y el último acuerdo que
// dijo el servidor, y las imágenes de los submazos del catálogo de mazos. Los cuerpos de las preguntas
// no viven aquí. Van a las tablas de siempre (questions, options y cases) con su esquema, así el
// simulador, el examen, el Tutor y Progreso los leen igual que el banco de demostración.
import { z } from 'zod';
import { ModelSettingsSchema } from '../../config/modelSettings';
import { ContentReportSchema, QuestionTaskSchema } from './bank';
import {
  CalendarDateSchema,
  IdSchema,
  ItemKindSchema,
  TaxonomyKeySchema,
  UtcDateTimeSchema,
} from './common';

// Las mismas reglas de deck_catalog.deck_key, subject_key y la ruta de imagen de deckCatalog.ts. Se
// repiten aquí porque este archivo va en el JavaScript inicial con las tablas de Dexie y deckCatalog.ts
// trae consigo los esquemas de contenido, que solo hacen falta al bajar un submazo
const DeckCatalogKeySchema = z.string().regex(/^[a-z0-9-]{3,48}$/);
const DeckSubjectKeySchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
const DeckMediaPathSchema = z
  .string()
  .regex(
    /^\/deck-media\/[a-z0-9-]{3,48}\/[a-z0-9-]{1,64}\/[A-Za-z0-9._-]{1,120}\.(?:jpg|jpeg|png|gif|webp|svg)$/,
  );

/**
 * La calibración de la noche de una pregunta (B14, 1.6 del plan de B14), con el id de la versión que se
 * calibró ya en ULID. Lleva ese id porque bank_publish no la toca al publicar otra versión, y la app solo
 * la usa si coincide con la versión publicada (src/data/bank/calibration.ts)
 */
export const CatalogCalibrationSchema = z.strictObject({
  versionId: IdSchema,
  state: z.enum(['physician_estimate', 'provisional', 'calibrated']),
  /** Dificultad de Rasch en logits, ya enlazada. null si no tiene estimación finita */
  difficulty: z.number().nullable(),
  se: z.number().nullable(),
  /** Alumnos distintos con primer intento válido */
  students: z.int().min(0),
  elo: z.number().nullable(),
  /** Todos acertaron o todos fallaron, así que no hay estimación finita */
  extreme: z.boolean(),
  /** Día de estudio de la noche que la calculó */
  studyDay: CalendarDateSchema,
});

/**
 * Una pregunta publicada o retirada del catálogo, con sus ids ya en ULID (src/data/cloud/cloudIds.ts).
 * Una fila por pregunta estable, como question_catalog en la base
 */
export const CatalogEntrySchema = z
  .strictObject({
    /** Id estable de la pregunta */
    questionId: IdSchema,
    /** La versión publicada, la que se pide con fetch_questions */
    versionId: IdSchema,
    version: z.int().min(1),
    branch: TaxonomyKeySchema,
    topic: TaxonomyKeySchema,
    subtopic: TaxonomyKeySchema,
    difficulty: z.int().min(1).max(5),
    /** Solo los tipos de reactivo que esta app conoce (D-080). Un tipo nuevo del servidor se ignora */
    itemKinds: z.array(ItemKindSchema).max(5),
    polarity: z.enum(['affirmative', 'negative']),
    task: QuestionTaskSchema,
    format: z.enum(['clinical_case', 'direct', 'serial_case']),
    caseId: IdSchema.nullable(),
    caseOrder: z.int().min(1).nullable(),
    caseSize: z.int().min(1).nullable(),
    variantOf: IdSchema.nullable(),
    /** Las variantes nacen fuera del examen hasta su umbral (B14) */
    examEligible: z.boolean(),
    /** Sesgos de los distractores sin decir cuál es cuál, para el muestreo dirigido (D-080) */
    distractorBiases: z.array(TaxonomyKeySchema).max(20),
    optionCount: z.int().min(2).max(10),
    language: z.enum(['es', 'en']),
    status: z.enum(['published', 'retired']),
    /** El seq de la nube. La siguiente bajada pide desde el más alto */
    seq: z.int().min(0),
    /**
     * Lo que calculó la noche (B14). Ausente en una fila de antes de B14 o de un servidor sin la
     * migración, y null si la pregunta todavía no se calibra
     */
    calibration: CatalogCalibrationSchema.nullable().optional(),
  })
  .refine((entry) => (entry.caseId === null) === (entry.caseOrder === null), {
    message: 'caseId y caseOrder van juntos',
    path: ['caseOrder'],
  });
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

/** La cuota del alumno como la dice bank_quota (2.5). Misma forma que QuotaInfo de contracts.ts */
export const QuotaInfoSchema = z.strictObject({
  open: z.boolean(),
  plan: z.string().min(1).max(32),
  limit: z.int().min(0).nullable(),
  used: z.int().min(0),
  left: z.int().min(0).nullable(),
  day: CalendarDateSchema,
  resetsAt: UtcDateTimeSchema,
  brake: z.strictObject({ retryAt: UtcDateTimeSchema.nullable() }),
});

/** El acuerdo entre médicos que dice bias_agreement_summary (4.4) */
export const AgreementSummarySchema = z.strictObject({
  pairs: z.int().min(0),
  kappa: z.number().min(-1).max(1).nullable(),
  vocabulary: z.enum(['bias', 'trap']),
  calibrating: z.boolean(),
  minPairs: z.int().min(0),
  minKappa: z.number(),
});

/** Un submazo del catálogo que este navegador ya bajó, para avisar cuando haya versión nueva */
export const DeckDownloadSchema = z.strictObject({
  deckKey: DeckCatalogKeySchema,
  subjectKey: DeckSubjectKeySchema,
  version: z.int().min(1),
  /** Huella del .json bajado. Si la versión nueva trae la misma, no se vuelve a bajar */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.int().min(0),
  at: UtcDateTimeSchema,
});
export type DeckDownload = z.infer<typeof DeckDownloadSchema>;

/**
 * La foto de comparación que dejó la noche (comparison_snapshot, B14 1.9). Solo Todos y la especialidad de
 * quien pregunta. Una celda con menos de minGroupSize alumnos no trae cortes y dice calibrando
 */
export const ComparisonSnapshotSchema = z.strictObject({
  available: z.boolean(),
  runAt: UtcDateTimeSchema.nullable(),
  studyDay: CalendarDateSchema.nullable(),
  windowDays: z.int().min(1).max(366),
  minGroupSize: z.int().min(1),
  specialty: z
    .string()
    .regex(/^[a-z_]{2,48}$/)
    .nullable(),
  cells: z
    .array(
      z.strictObject({
        cohort: z.enum(['all', 'specialty']),
        metric: z.enum(['sim_accuracy', 'reviews', 'consistency']),
        /** La rama de la taxonomía, o * para el total */
        branch: z.string().regex(/^(\*|[a-z_]{2,48})$/),
        students: z.int().min(0),
        state: z.enum(['ready', 'calibrating']),
        /** 19 cortes, del percentil 5 al 95 */
        cuts: z.array(z.number()).length(19).nullable(),
      }),
    )
    .max(2000),
});

/** La línea base de la población (population_baselines, B14 1.9). Todo son números con llaves de la taxonomía */
export const PopulationBaselinesSchema = z.strictObject({
  available: z.boolean(),
  runAt: UtcDateTimeSchema.nullable(),
  bias: z.record(z.string(), z.strictObject({ students: z.int().min(0), rate: z.number() })),
  motives: z.record(z.string(), z.record(z.string(), z.number())),
  topics: z.record(
    z.string(),
    z.strictObject({
      students: z.int().min(0),
      accuracy: z.number(),
      difficulty: z.number().nullable(),
    }),
  ),
  indicators: z.record(z.string(), z.strictObject({ students: z.int().min(0), rate: z.number() })),
  fatigue: z.strictObject({
    state: z.enum(['calibrating', 'validated', 'not_valid']),
    students: z.int().min(0),
    longSessions: z.int().min(0),
  }),
});

/**
 * Estado del banco de la nube en este navegador, una fila por clave
 *   catalog. Hasta qué seq se bajó el catálogo, si ya llegó completo y si el banco estaba abierto
 *   quota. La última cuota que dijo el servidor, para la cuenta del tope sin conexión (5.5)
 *   agreement. El último acuerdo entre médicos, para hablar de sesgos o de trampas (4.4)
 *   decks. Los submazos del catálogo de mazos que ya se bajaron (4.8)
 *   comparison, population y model_settings. Lo que baja una vez por día de estudio de lo que calculó la
 *   noche y de los ajustes del modelo (B14, 1.12). Cada uno dice el día de estudio en que se bajó
 */
/**
 * Un reporte de error que se guardó sin conexión y todavía no llega al médico (B3 de la revisión de
 * B11). Se manda solo al conectar la cuenta y cada vez que vuelve la red. Solo el motivo, nunca texto
 */
export const PendingReportSchema = z.strictObject({
  reportId: IdSchema,
  questionVersionId: IdSchema,
  reason: ContentReportSchema.shape.reason,
  at: UtcDateTimeSchema,
});
export type PendingReport = z.infer<typeof PendingReportSchema>;

/** Cuántos reportes esperan a la red como máximo. Si hubiera más, los más viejos ya no viajan */
export const MAX_PENDING_REPORTS = 200;

export const BankStateSchema = z.discriminatedUnion('key', [
  z.strictObject({
    key: z.literal('catalog'),
    since: z.int().min(0),
    /** Ya se bajó hasta done al menos una vez. Sin eso no se estudia sin conexión (5.3) */
    complete: z.boolean(),
    open: z.boolean(),
    syncedAt: UtcDateTimeSchema.nullable(),
  }),
  z.strictObject({ key: z.literal('quota'), quota: QuotaInfoSchema, at: UtcDateTimeSchema }),
  z.strictObject({
    key: z.literal('agreement'),
    summary: AgreementSummarySchema,
    at: UtcDateTimeSchema,
  }),
  z.strictObject({ key: z.literal('decks'), downloads: z.array(DeckDownloadSchema) }),
  z.strictObject({
    key: z.literal('reports'),
    pending: z.array(PendingReportSchema).max(MAX_PENDING_REPORTS),
  }),
  z.strictObject({
    key: z.literal('comparison'),
    snapshot: ComparisonSnapshotSchema,
    /** El día de estudio de este dispositivo en que se bajó */
    fetchedDay: CalendarDateSchema,
    at: UtcDateTimeSchema,
  }),
  z.strictObject({
    key: z.literal('population'),
    baselines: PopulationBaselinesSchema,
    fetchedDay: CalendarDateSchema,
    at: UtcDateTimeSchema,
  }),
  z.strictObject({
    key: z.literal('model_settings'),
    settings: ModelSettingsSchema,
    fetchedDay: CalendarDateSchema,
    at: UtcDateTimeSchema,
  }),
]);
export type BankState = z.infer<typeof BankStateSchema>;
export type BankStateKey = BankState['key'];
export type BankStateOf<K extends BankStateKey> = Extract<BankState, { key: K }>;

/** Tipos de imagen que guarda la app de los paquetes del catálogo de mazos */
export const DeckMediaTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

/**
 * Una imagen de un submazo bajado, como Blob. La nota la pide con su ruta /deck-media/... y la app
 * la convierte en una dirección blob al mostrarla (src/features/shared/deckMediaUrls.ts)
 */
export const DeckMediaSchema = z.strictObject({
  path: DeckMediaPathSchema,
  deckKey: DeckCatalogKeySchema,
  subjectKey: DeckSubjectKeySchema,
  /** Versión del mazo de la que salió la imagen */
  deckVersion: z.int().min(1),
  type: DeckMediaTypeSchema,
  blob: z.instanceof(Blob),
});
export type DeckMedia = z.infer<typeof DeckMediaSchema>;
