// Mazos, notas y tarjetas (6.2). El estado FSRS de cada tarjeta vive en cardStateCache.
import { z } from 'zod';
import { ContentOriginSchema, EditorialStatusSchema, IdSchema, UtcDateTimeSchema } from './common';

export const DeckSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(''),
  /** null en mazos precargados, que no tienen dueño */
  ownerId: IdSchema.nullable(),
  origin: ContentOriginSchema,
  /** Los mazos importados y creados por el alumno son privados por defecto (3.1) */
  visibility: z.enum(['private', 'public']),
  /** Contenido de demostración, lleva la etiqueta visible (4.6) */
  isDemo: z.boolean(),
  createdAt: UtcDateTimeSchema,
});
export type Deck = z.infer<typeof DeckSchema>;

const NoteBaseShape = {
  id: IdSchema,
  deckId: IdSchema,
  tags: z.array(z.string().min(1).max(80)).max(50).default([]),
  origin: ContentOriginSchema,
  editorialStatus: EditorialStatusSchema,
  /** Frase exacta de la fuente que respalda una tarjeta generada (4.1). null si no es generada */
  sourceQuote: z.string().max(2000).nullable(),
  /** Pregunta del banco de la que sale una tarjeta generada */
  sourceQuestionVersionId: IdSchema.nullable(),
  isDemo: z.boolean(),
  createdAt: UtcDateTimeSchema,
};

/** Contenido ya saneado (HTML con lista corta de etiquetas en el importador, 14.3) */
const SanitizedHtmlSchema = z.string().max(20_000);

export const BasicNoteSchema = z.strictObject({
  ...NoteBaseShape,
  kind: z.literal('basic'),
  front: SanitizedHtmlSchema,
  back: SanitizedHtmlSchema,
});

export const ClozeNoteSchema = z.strictObject({
  ...NoteBaseShape,
  kind: z.literal('cloze'),
  /** Texto con huecos al estilo Anki, por ejemplo {{c1::...}} */
  text: SanitizedHtmlSchema,
  extra: SanitizedHtmlSchema.default(''),
});

export const NoteSchema = z.discriminatedUnion('kind', [BasicNoteSchema, ClozeNoteSchema]);
export type Note = z.infer<typeof NoteSchema>;

export const CardSchema = z.strictObject({
  id: IdSchema,
  noteId: IdSchema,
  deckId: IdSchema,
  /** Número de hueco en cloze, 0 en básicas */
  ordinal: z.int().min(0).max(100),
  createdAt: UtcDateTimeSchema,
});
export type Card = z.infer<typeof CardSchema>;
