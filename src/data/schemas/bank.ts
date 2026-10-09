// Banco de preguntas. Casos, preguntas y opciones con versiones inmutables (6.1, 6.2, 7.8).
// Editar una pregunta crea una versión nueva y las estadísticas se guardan por versión.
import { z } from 'zod';
import {
  ClueStrengthSchema,
  EditorialStatusSchema,
  IdSchema,
  ItemKindSchema,
  TaxonomyKeySchema,
  UtcDateTimeSchema,
} from './common';

/**
 * Viñeta clínica compartida por las preguntas de un caso seriado. Es inmutable. Editarla crea
 * un caso nuevo y versiones nuevas de sus preguntas (6.1)
 */
export const ClinicalCaseSchema = z.strictObject({
  id: IdSchema,
  vignette: z.string().min(1).max(8000),
  isDemo: z.boolean(),
  createdAt: UtcDateTimeSchema,
});
export type ClinicalCase = z.infer<typeof ClinicalCaseSchema>;

/** Tipos de tarea de 13.2 */
export const QuestionTaskSchema = z.enum([
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

export const QuestionStructureSchema = z.strictObject({
  polarity: z.enum(['affirmative', 'negative']),
  task: QuestionTaskSchema,
  format: z.enum(['clinical_case', 'direct', 'serial_case']),
  /** La etiqueta del médico gana sobre la automática (7.5) */
  source: z.enum(['auto', 'physician']),
});

export const GpcReferenceSchema = z.strictObject({
  /** Solo el título general de la GPC, sin inventar claves, años ni páginas (11.1) */
  title: z.string().min(1).max(300),
  status: z.enum(['to_verify', 'verified']),
});

/** Dato del caso que el médico marca como patognomónico, característico o inespecífico (D-080) */
export const ClueSchema = z.strictObject({
  text: z.string().min(1).max(300),
  strength: ClueStrengthSchema,
});
export type Clue = z.infer<typeof ClueSchema>;

export const QuestionSchema = z
  .strictObject({
    /** ID de esta versión. Las estadísticas se guardan con este ID */
    id: IdSchema,
    /** ID estable de la pregunta a través de sus versiones */
    questionId: IdSchema,
    version: z.int().min(1),
    caseId: IdSchema.nullable(),
    /** Orden dentro del caso seriado */
    caseOrder: z.int().min(1).nullable(),
    /** Viñeta propia. Vacía si es pregunta directa o si la viñeta viene del caso */
    vignette: z.string().max(8000),
    /** Frase de la pregunta. Ahí y solo ahí se buscan negaciones (7.5) */
    prompt: z.string().min(1).max(1000),
    branch: TaxonomyKeySchema,
    topic: TaxonomyKeySchema,
    subtopic: TaxonomyKeySchema,
    structure: QuestionStructureSchema,
    explanation: z.string().max(4000),
    gpcRefs: z.array(GpcReferenceSchema).max(10),
    /** Tipos de reactivo raros. Ausente es un reactivo estándar (D-080) */
    itemKinds: z.array(ItemKindSchema).max(5).optional(),
    /** Datos del caso con su fuerza diagnóstica, que pone el médico (D-080) */
    clues: z.array(ClueSchema).max(20).optional(),
    /** Dificultad que estima el médico, de 1 a 5 (7.7) */
    physicianDifficulty: z.int().min(1).max(5),
    /**
     * ID estable de la pregunta de la que sale esta variante reestructurada (8.6). Ausente en las
     * preguntas originales. Una variante no entra al puntaje del examen hasta su umbral
     */
    variantOf: IdSchema.optional(),
    /** Set canónico. La correcta y los distractores estándar, en IDs de opción de esta versión (7.8) */
    canonicalOptionIds: z.array(IdSchema).min(2).max(10),
    editorialStatus: EditorialStatusSchema,
    isDemo: z.boolean(),
    createdAt: UtcDateTimeSchema,
  })
  .refine((question) => (question.caseId === null) === (question.caseOrder === null), {
    message: 'caseId y caseOrder van juntos',
    path: ['caseOrder'],
  });
export type Question = z.infer<typeof QuestionSchema>;

export const OptionSchema = z
  .strictObject({
    /** ID de esta versión de la opción */
    id: IdSchema,
    /** ID estable de la opción a través de versiones */
    optionId: IdSchema,
    questionVersionId: IdSchema,
    text: z.string().min(1).max(1000),
    isCorrect: z.boolean(),
    /**
     * Etiqueta primaria de sesgo o trampa de la taxonomía (D-029). Es la que se usa para kappa
     * y para los análisis, porque 13.1 pide una sola etiqueta por distractor. null en la correcta
     */
    biasTag: TaxonomyKeySchema.nullable(),
    /** Otros sesgos que también aplican (D-029). No entran a kappa */
    secondaryBiasTags: z.array(TaxonomyKeySchema).max(5).default([]),
    /** Por qué atrae este distractor, o por qué es correcta */
    rationale: z.string().min(1).max(1500),
  })
  .refine((option) => option.isCorrect === (option.biasTag === null), {
    message: 'Cada distractor lleva etiqueta primaria y la correcta no lleva',
    path: ['biasTag'],
  })
  .refine(
    (option) => option.biasTag === null || !option.secondaryBiasTags.includes(option.biasTag),
    {
      message: 'La etiqueta primaria no se repite como secundaria',
      path: ['secondaryBiasTags'],
    },
  );
export type Option = z.infer<typeof OptionSchema>;

/** Etiqueta que pone cada médico a una opción, para medir acuerdo (7.11) */
export const BiasLabelSchema = z.strictObject({
  id: IdSchema,
  optionId: IdSchema,
  physicianId: IdSchema,
  biasTag: TaxonomyKeySchema,
  labeledAt: UtcDateTimeSchema,
});
export type BiasLabel = z.infer<typeof BiasLabelSchema>;

export const ContentReportSchema = z.strictObject({
  id: IdSchema,
  reporterId: IdSchema,
  targetKind: z.enum(['question', 'note']),
  targetId: IdSchema,
  reason: z.enum(['clinical_error', 'wrong_key', 'typo', 'outdated', 'other']),
  status: z.enum(['open', 'resolved', 'dismissed']),
  createdAt: UtcDateTimeSchema,
  resolvedAt: UtcDateTimeSchema.nullable(),
});
export type ContentReport = z.infer<typeof ContentReportSchema>;

/** Qué pregunta revisa qué médico (D-070). La misma idea que review_assignments en Supabase */
export const ReviewAssignmentSchema = z.strictObject({
  id: IdSchema,
  /** ID estable de la pregunta, así la asignación sigue en versiones nuevas */
  questionId: IdSchema,
  physicianId: IdSchema,
  assignedBy: IdSchema.nullable(),
  assignedAt: UtcDateTimeSchema,
});
export type ReviewAssignment = z.infer<typeof ReviewAssignmentSchema>;
