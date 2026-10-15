// Esquemas de los archivos de contenido en src/demo/content. Son datos que los médicos pueden
// editar sin tocar código (13). La Fase B los llena y las pruebas los validan al cargarlos.
import { z } from 'zod';
import { ClueStrengthSchema, ItemKindSchema, TaxonomyKeySchema } from './common';
import { QuestionTaskSchema } from './bank';

/** Estado de revisión de un archivo de contenido escrito por Claude */
export const ReviewStatusSchema = z.enum(['pending_physician_review', 'physician_reviewed']);

/** Una negación del diccionario, con su patrón y qué tipo de marca es */
const NegationEntrySchema = z.strictObject({
  id: z.string().min(1),
  pattern: z.string().min(1),
  /** Qué tipo de marca es, para explicarlo al alumno */
  kind: z.enum(['negation', 'exception', 'false_statement', 'least_likely', 'contraindication']),
});

/** Diccionario del etiquetador de estructura (7.5, 13.2) */
export const StructureDictionarySchema = z.strictObject({
  version: z.int().min(1),
  status: ReviewStatusSchema,
  /**
   * Negaciones y excepciones. Cada patrón es una expresión regular sin acentos y en minúsculas,
   * porque el texto se normaliza antes de buscar. Se envuelve con límites de palabra
   */
  negations: z.array(NegationEntrySchema).min(1),
  /** Frases que contienen una negación pero no vuelven negativa la pregunta, como al menos o si no */
  falsePositives: z.array(z.string().min(1)),
  /**
   * Lo mismo para las preguntas en inglés de Inglés médico (B13, 2.3 del plan de B13), con las mismas
   * reglas de los patrones. Sin el bloque, el inglés no resalta nada. Las tareas no tienen versión en
   * inglés, porque la tarea por omisión de una pregunta en inglés es data_interpretation
   */
  english: z
    .strictObject({
      negations: z.array(NegationEntrySchema).min(1),
      falsePositives: z.array(z.string().min(1)),
    })
    .optional(),
  /** Tareas por orden de prioridad. Gana la primera que aparezca en la frase de la pregunta */
  tasks: z
    .array(
      z.strictObject({
        task: QuestionTaskSchema,
        patterns: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});
export type StructureDictionary = z.infer<typeof StructureDictionarySchema>;

/** Un sesgo de la taxonomía de Ricardo (D-029, D-042) */
export const BiasDefinitionSchema = z.strictObject({
  key: TaxonomyKeySchema,
  name: z.string().min(1),
  englishName: z.string().min(1),
  /** Cómo luce un distractor con este sesgo, con la definición a la vista del médico (10.2) */
  distractorDefinition: z.string().min(1),
  /** Se puede usar como etiqueta de un distractor */
  taggable: z.boolean(),
  /** Señales de conducta que también lo miden (D-042). Vacío si solo se mide por etiqueta */
  behaviorSignals: z.array(
    z.enum([
      'answer_changes',
      'response_time',
      'confidence_calibration',
      'exam_position',
      'session_fatigue',
      'answer_position_pattern',
      'time_sink',
    ]),
  ),
});
export type BiasDefinition = z.infer<typeof BiasDefinitionSchema>;

export const BiasTaxonomySchema = z.strictObject({
  version: z.int().min(1),
  status: ReviewStatusSchema,
  biases: z.array(BiasDefinitionSchema).min(1),
});
export type BiasTaxonomy = z.infer<typeof BiasTaxonomySchema>;

/**
 * Sección del examen de una rama (B11). clinical son los 250 reactivos en español y english los 30 de
 * comprensión de textos en inglés, que se cuentan aparte. Sin el campo, la rama es clinical
 */
export const TaxonomySectionSchema = z.enum(['clinical', 'english']);
export type TaxonomySection = z.infer<typeof TaxonomySectionSchema>;

/** Taxonomía de ramas, temas y subtemas con pesos del ENARM (13.4) */
export const TopicTaxonomySchema = z.strictObject({
  version: z.int().min(1),
  status: ReviewStatusSchema,
  /**
   * Los pesos de fábrica son provisionales mientras la convocatoria no publique los oficiales (sección
   * 6 del plan del cambio). El admin los cambia y apaga la marca en Plataforma
   */
  weightsProvisional: z.boolean().optional(),
  /** De dónde salen los pesos de fábrica, para mostrarlo junto a la marca */
  weightsSource: z.string().min(1).max(200).optional(),
  branches: z
    .array(
      z.strictObject({
        key: TaxonomyKeySchema,
        name: z.string().min(1),
        /** Sección del examen. Sin el campo es clinical (ver branchSection) */
        section: TaxonomySectionSchema.optional(),
        /**
         * Peso provisional del ENARM. Desde B11 son los reactivos de cada rama sobre 250 de la
         * sección 6 del plan del cambio, e Inglés médico con sus 30 aparte
         */
        weight: z.number().positive(),
        topics: z
          .array(
            z.strictObject({
              key: TaxonomyKeySchema,
              name: z.string().min(1),
              /** Peso relativo del tema dentro de su rama */
              weight: z.number().positive(),
              /** Tema base para la regla de brecha de base (7.9), opcional */
              baseTopic: TaxonomyKeySchema.nullable(),
              subtopics: z
                .array(z.strictObject({ key: TaxonomyKeySchema, name: z.string().min(1) }))
                .min(1),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});
export type TopicTaxonomy = z.infer<typeof TopicTaxonomySchema>;

/** La sección de una rama. Las que no la dicen son clinical, como todas las de antes de B11 */
export function branchSection(branch: { section?: TaxonomySection | undefined }): TaxonomySection {
  return branch.section ?? 'clinical';
}

/** Textos base de consejos por sesgo (8.5). Borradores de Claude pendientes de revisión médica */
export const BiasTipsSchema = z.strictObject({
  version: z.int().min(1),
  status: ReviewStatusSchema,
  tips: z
    .array(z.strictObject({ biasKey: TaxonomyKeySchema, tip: z.string().min(10).max(400) }))
    .min(1),
});
export type BiasTips = z.infer<typeof BiasTipsSchema>;

/**
 * Lote de preguntas de demostración (11.1, D-042). Formato para escribir y revisar a mano. Al
 * sembrar la base, cada pregunta se convierte en una versión de Question con sus Option
 */
export const DemoOptionSchema = z.strictObject({
  key: z.string().regex(/^[a-j]$/),
  text: z.string().min(1).max(400),
  correct: z.boolean(),
  /** Sesgo primario de la taxonomía. Solo en distractores */
  bias: TaxonomyKeySchema.optional(),
  secondaryBiases: z.array(TaxonomyKeySchema).max(3).optional(),
  /** Por qué atrae este distractor, o por qué es la correcta */
  rationale: z.string().min(1).max(400),
});

export const DemoQuestionSchema = z
  .strictObject({
    key: z.string().regex(/^b\d-q\d{2}$/),
    caseKey: z.string().nullable(),
    caseOrder: z.int().min(1).max(3).nullable(),
    branch: TaxonomyKeySchema,
    topic: TaxonomyKeySchema,
    subtopic: TaxonomyKeySchema,
    /** Viñeta propia, o datos que se agregan al caso seriado en este paso */
    vignette: z.string().max(2000),
    prompt: z.string().min(5).max(400),
    polarity: z.enum(['affirmative', 'negative']),
    task: QuestionTaskSchema,
    difficulty: z.int().min(1).max(5),
    /**
     * De 4 a 10 opciones, con o sin tipos de reactivo. El examen real trae 4 y el banco nuevo trae
     * hasta 6 para subir la dificultad. Las 200 preguntas demo traen 10
     */
    options: z.array(DemoOptionSchema).min(4).max(10),
    /** Las 4 opciones del set canónico, la correcta y 3 distractores */
    canonical: z.array(z.string().regex(/^[a-j]$/)).length(4),
    explanation: z.string().min(1),
    /** Solo el título general de la GPC, sin claves, años ni páginas. Por verificar (11.1) */
    gpcRefs: z.array(z.string().min(5).max(200)).min(1).max(3),
    /** Tipos de reactivo raros y datos con su fuerza diagnóstica, opcionales (D-080) */
    kinds: z.array(ItemKindSchema).max(5).optional(),
    clues: z
      .array(z.strictObject({ text: z.string().min(1).max(300), strength: ClueStrengthSchema }))
      .max(20)
      .optional(),
  })
  .refine(
    (question) => {
      // Con 10 opciones toda clave a-j existía. Con menos, el set canónico no puede apuntar fuera
      const keys = new Set(question.options.map((option) => option.key));
      return (
        new Set(question.canonical).size === question.canonical.length &&
        question.canonical.every((key) => keys.has(key))
      );
    },
    {
      message: 'El set canónico usa claves distintas de opciones que existen',
      path: ['canonical'],
    },
  );
export type DemoQuestion = z.infer<typeof DemoQuestionSchema>;

export const DemoQuestionBatchSchema = z.strictObject({
  batch: z.int().min(1).max(6),
  status: ReviewStatusSchema,
  cases: z.array(
    z.strictObject({ key: z.string().min(1), vignette: z.string().min(20).max(3000) }),
  ),
  questions: z.array(DemoQuestionSchema).min(1),
});
export type DemoQuestionBatch = z.infer<typeof DemoQuestionBatchSchema>;

/** Nota de un mazo precargado de la demo, ya saneada (D-053) */
const DemoDeckNoteBase = {
  key: z.string().regex(/^[a-z0-9-]+$/),
  /** Etiqueta original del mazo, por ejemplo Medicina-Interna::Hematología::Anemias */
  sourceTag: z.string().max(200),
  tags: z.array(z.string().min(1).max(80)).max(20),
  /** Rama y tema de la taxonomía, o null si el mazo no corresponde a ninguno, como Urgencias */
  branch: TaxonomyKeySchema.nullable(),
  topic: TaxonomyKeySchema.nullable(),
};

export const DemoDeckNoteSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...DemoDeckNoteBase,
    kind: z.literal('basic'),
    front: z.string().min(1).max(20_000),
    back: z.string().max(20_000),
  }),
  z.strictObject({
    ...DemoDeckNoteBase,
    kind: z.literal('cloze'),
    text: z.string().min(1).max(20_000),
    extra: z.string().max(20_000),
    /** Números de hueco, una tarjeta por cada uno */
    ordinals: z.array(z.int().min(1).max(100)).min(1),
  }),
]);
export type DemoDeckNote = z.infer<typeof DemoDeckNoteSchema>;

export const DemoDeckFileSchema = z.strictObject({
  version: z.literal(1),
  key: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(1000),
  /** Autor del mazo, con crédito visible (D-053) */
  author: z.string().min(1).max(80),
  status: ReviewStatusSchema,
  /** Imágenes del mazo, servidas desde public. Ruta absoluta desde la raíz del sitio */
  media: z.array(
    z.string().regex(/^\/demo-media\/[a-z0-9-]+\/m-\d{4}\.(?:jpg|jpeg|png|gif|webp)$/),
  ),
  notes: z.array(DemoDeckNoteSchema).min(1),
});
export type DemoDeckFile = z.infer<typeof DemoDeckFileSchema>;
