// Piezas comunes de los esquemas. Única fuente de verdad del modelo de datos (6.1).
import { z } from 'zod';

/** IDs con ULID, ordenables por tiempo (6.1) */
export const IdSchema = z.ulid();
export type Id = z.infer<typeof IdSchema>;

/**
 * Momento en UTC como ISO 8601 con milisegundos y Z, exactamente el formato de toISOString,
 * por ejemplo 2026-10-01T15:30:00.000Z. Un solo formato hace que el orden del texto sea el orden
 * en el tiempo, que es como la bitácora ordena y filtra
 */
export const UtcDateTimeSchema = z.iso.datetime({ precision: 3 });

/** Fecha de calendario sin hora, por ejemplo 2027-09-14 */
export const CalendarDateSchema = z.iso.date();

/** Zona horaria IANA, por ejemplo America/Merida */
export const TimeZoneSchema = z.string().min(1).max(64);

export const DEFAULT_TIME_ZONE = 'America/Merida';

/** Clave de una taxonomía en archivo de datos (sesgos, ramas, temas). Se valida contra la taxonomía al cargar contenido */
export const TaxonomyKeySchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,47}$/, 'Clave de taxonomía inválida');

/** Valor JSON libre, para configuraciones que cada fase precisa con su propio esquema */
export const JsonRecordSchema = z.record(z.string(), z.json());

/** Roles por nivel. Alumno sin poderes, médico revisa lo asignado, admin todo, dueño fijo (D-070) */
export const RoleSchema = z.enum(['student', 'physician', 'admin', 'owner']);
export type Role = z.infer<typeof RoleSchema>;

/** Estado editorial de contenido. Borrador primero (4.2) */
export const EditorialStatusSchema = z.enum(['draft', 'in_review', 'approved', 'rejected']);

/** Origen del contenido de un mazo o una nota */
export const ContentOriginSchema = z.enum(['preloaded', 'imported', 'generated', 'manual']);

export const SessionKindSchema = z.enum(['review', 'practice', 'exam', 'challenge']);

/** Confianza autorreportada en tarjetas (7.1). No lo sé, Dudo y Seguro */
export const CardConfidenceSchema = z.enum(['dont_know', 'unsure', 'sure']);

/** Confianza autorreportada en opción múltiple (7.1). Adiviné, Dudé y Seguro */
export const McqConfidenceSchema = z.enum(['guessed', 'unsure', 'sure']);

/**
 * Tipos de reactivo que el esquema acepta además del estándar (D-080). El ENARM tiene reactivos
 * raros y el simulador debe poder tenerlos. Un reactivo puede tener varios tipos. Ningún validador
 * rechaza un reactivo por ser imperfecto
 */
export const ItemKindSchema = z.enum([
  /** Casos casi idénticos que solo se separan por las opciones de tratamiento */
  'inverse_resolution',
  /** Con incoherencias intencionales en el caso */
  'incoherent',
  /** De control, para medir la atención del alumno */
  'control',
  /** Con datos muy específicos u oscuros */
  'obscure_detail',
  /** Escrito desde la perspectiva del paciente */
  'patient_perspective',
]);
export type ItemKind = z.infer<typeof ItemKindSchema>;

/** Qué tanto define un dato del caso al diagnóstico. Patognomónico y característico son distintos */
export const ClueStrengthSchema = z.enum(['pathognomonic', 'characteristic', 'nonspecific']);
export type ClueStrength = z.infer<typeof ClueStrengthSchema>;

/** Botones de FSRS en español: Otra vez, Difícil, Bien y Fácil */
export const FsrsRatingSchema = z.enum(['again', 'hard', 'good', 'easy']);

/** Causas de error autorreportadas (13.3). Otra no lleva texto libre */
export const ErrorCauseSchema = z.enum([
  'not_studied',
  'forgot',
  'confused',
  'misread',
  'missed_detail',
  'rushed_or_tired',
  'changed_answer',
  'other',
]);

/** Reglas de olvido de 7.9 */
export const ForgettingRuleSchema = z.enum([
  'persistent_lapse',
  'list_card',
  'interference',
  'high_confidence_error',
  'misreading',
  'fatigue',
  'rushing',
  'foundation_gap',
  'expected_forgetting',
]);

/** Acciones que la app sabe ejecutar. Lista cerrada de 8.2 */
export const TutorActionSchema = z.enum([
  'create_contrast_card',
  'split_card',
  'review_explanation',
  'subtopic_simulator',
  'enable_highlight',
  'suggest_break',
]);

export const AiArtifactKindSchema = z.enum([
  'hypothesis',
  'weekly_report',
  'flashcard',
  'bias_tip',
  'restructured_question',
]);

export const ConsentPurposeSchema = z.enum(['party', 'ai_analysis', 'anonymized_improvement']);

/** Modos de muestreo de opciones (7.8) */
export const SamplingModeSchema = z.enum(['canonical', 'diverse', 'targeted', 'stratified']);

/** Estado de una tarjeta según FSRS. Se alinea con ts-fsrs en la Fase B */
export const FsrsCardStateSchema = z.strictObject({
  due: UtcDateTimeSchema,
  stability: z.number().nonnegative(),
  difficulty: z.number().nonnegative(),
  scheduledDays: z.number().nonnegative(),
  learningSteps: z.int().nonnegative(),
  reps: z.int().nonnegative(),
  lapses: z.int().nonnegative(),
  state: z.enum(['new', 'learning', 'review', 'relearning']),
  lastReview: UtcDateTimeSchema.nullable(),
});
export type FsrsCardState = z.infer<typeof FsrsCardStateSchema>;
