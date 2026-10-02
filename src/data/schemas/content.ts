// Esquemas de los archivos de contenido en src/demo/content. Son datos que los médicos pueden
// editar sin tocar código (13). La Fase B los llena y las pruebas los validan al cargarlos.
import { z } from 'zod';
import { TaxonomyKeySchema } from './common';
import { QuestionTaskSchema } from './bank';

/** Estado de revisión de un archivo de contenido escrito por Claude */
export const ReviewStatusSchema = z.enum(['pending_physician_review', 'physician_reviewed']);

/** Diccionario del etiquetador de estructura (7.5, 13.2) */
export const StructureDictionarySchema = z.strictObject({
  version: z.int().min(1),
  status: ReviewStatusSchema,
  /**
   * Negaciones y excepciones. Cada patrón es una expresión regular sin acentos y en minúsculas,
   * porque el texto se normaliza antes de buscar. Se envuelve con límites de palabra
   */
  negations: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        pattern: z.string().min(1),
        /** Qué tipo de marca es, para explicarlo al alumno */
        kind: z.enum([
          'negation',
          'exception',
          'false_statement',
          'least_likely',
          'contraindication',
        ]),
      }),
    )
    .min(1),
  /** Frases que contienen una negación pero no vuelven negativa la pregunta, como al menos o si no */
  falsePositives: z.array(z.string().min(1)),
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

/** Taxonomía de ramas, temas y subtemas con pesos del ENARM (13.4) */
export const TopicTaxonomySchema = z.strictObject({
  version: z.int().min(1),
  status: ReviewStatusSchema,
  branches: z
    .array(
      z.strictObject({
        key: TaxonomyKeySchema,
        name: z.string().min(1),
        /** Peso provisional del ENARM, iguales hasta que Ricardo dé los oficiales (D-013) */
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

/** Textos base de consejos por sesgo (8.5). Borradores de Claude pendientes de revisión médica */
export const BiasTipsSchema = z.strictObject({
  version: z.int().min(1),
  status: ReviewStatusSchema,
  tips: z
    .array(z.strictObject({ biasKey: TaxonomyKeySchema, tip: z.string().min(10).max(400) }))
    .min(1),
});
export type BiasTips = z.infer<typeof BiasTipsSchema>;
