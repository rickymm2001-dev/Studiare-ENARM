// Mazos, notas y tarjetas (6.2). El estado FSRS de cada tarjeta vive en cardStateCache.
// Los tres llevan fecha de modificación y marca de borrado para sincronizar entre dispositivos
// (D-085, fila 12). Borrar es poner la marca y no quitar el registro, así otro dispositivo se entera.
import { z } from 'zod';
import { ACADEMIC_SOURCE_KEYS } from '../../config/academicSources';
import { CONTROVERSY_REASON_MAX, CONTROVERSY_REASON_MIN } from '../../engines/cardGen';
import { TAG_MAX_LENGTH } from '../../engines/tagPath';
import { ContentOriginSchema, EditorialStatusSchema, IdSchema, UtcDateTimeSchema } from './common';

/**
 * Campos de sincronización. updatedAt dice cuándo cambió por última vez y, si falta, vale lo mismo
 * que createdAt. deletedAt con fecha es una marca de borrado y null o ausente es un registro vivo
 */
export const SyncShape = {
  updatedAt: UtcDateTimeSchema.optional(),
  deletedAt: UtcDateTimeSchema.nullable().optional(),
};

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
  /** Mazo del que cuelga. null o ausente es un mazo de primer nivel (D-085, fila 3) */
  parentId: IdSchema.nullable().optional(),
  createdAt: UtcDateTimeSchema,
  ...SyncShape,
});
export type Deck = z.infer<typeof DeckSchema>;

/** Una etiqueta de nota. Nunca lleva espacios y sus niveles van separados por :: (D-085) */
export const NoteTagSchema = z
  .string()
  .min(1)
  .max(TAG_MAX_LENGTH)
  .regex(/^\S+$/, 'Una etiqueta no lleva espacios');

/**
 * Señal de controversia que la IA pone en una tarjeta generada (D-085). La IA nunca cambia el texto,
 * solo señala con una explicación que se apoya en la lista cerrada de textos académicos. El alumno la
 * quita al marcar que ya la verificó o al editar la tarjeta, y eso queda como evento
 */
export const ControversySchema = z.strictObject({
  reason: z.string().trim().min(CONTROVERSY_REASON_MIN).max(CONTROVERSY_REASON_MAX),
  sources: z
    .array(
      z.strictObject({
        key: z.enum(ACADEMIC_SOURCE_KEYS),
        /** Capítulo o sección, si se conoce */
        locator: z.string().max(120).nullable(),
      }),
    )
    .min(1)
    .max(3),
  /** La puso el generador simulado, sin un modelo de IA */
  simulated: z.boolean(),
  flaggedAt: UtcDateTimeSchema,
});
export type Controversy = z.infer<typeof ControversySchema>;

const NoteBaseShape = {
  id: IdSchema,
  deckId: IdSchema,
  tags: z.array(NoteTagSchema).max(50).default([]),
  origin: ContentOriginSchema,
  editorialStatus: EditorialStatusSchema,
  /** Frase exacta de la fuente que respalda una tarjeta generada (4.1). null si no es generada */
  sourceQuote: z.string().max(2000).nullable(),
  /** Pregunta del banco de la que sale una tarjeta generada */
  sourceQuestionVersionId: IdSchema.nullable(),
  /**
   * Identificador de la nota en el archivo de donde se importó, para no duplicarla si el alumno
   * vuelve a importar el mismo archivo (D-093). Ausente o null en lo que no se importó
   */
  sourceGuid: z.string().max(200).nullable().optional(),
  /** Nombre del texto o PDF del alumno de donde sale una tarjeta generada (D-085) */
  sourceTitle: z.string().max(200).nullable().optional(),
  /** Señal de controversia puesta por la IA. null o ausente si no hay o ya se atendió */
  controversy: ControversySchema.nullable().optional(),
  isDemo: z.boolean(),
  createdAt: UtcDateTimeSchema,
  ...SyncShape,
};

/** Contenido ya saneado (HTML con lista corta de etiquetas en el importador, 14.3) */
const SanitizedHtmlSchema = z.string().max(20_000);

export const BasicNoteSchema = z.strictObject({
  ...NoteBaseShape,
  kind: z.literal('basic'),
  front: SanitizedHtmlSchema,
  back: SanitizedHtmlSchema,
});

/**
 * Básica con tarjeta inversa, como en Anki. Una nota con frente y reverso que genera dos cartas, la
 * de ordinal 0 que pregunta el frente y la de ordinal 1 que pregunta el reverso
 */
export const BasicReverseNoteSchema = z.strictObject({
  ...NoteBaseShape,
  kind: z.literal('basic_reverse'),
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

export const NoteSchema = z
  .discriminatedUnion('kind', [BasicNoteSchema, BasicReverseNoteSchema, ClozeNoteSchema])
  // Una tarjeta generada siempre cita la frase y la fuente que la respalda, la pregunta del banco o
  // el texto del alumno (4.1, D-085)
  .refine(
    (note) =>
      note.origin !== 'generated' ||
      (note.sourceQuote !== null &&
        (note.sourceQuestionVersionId !== null ||
          (note.sourceTitle !== null && note.sourceTitle !== undefined))),
    { message: 'Una tarjeta generada cita su fuente', path: ['sourceQuote'] },
  );
export type Note = z.infer<typeof NoteSchema>;

export const CardSchema = z.strictObject({
  id: IdSchema,
  noteId: IdSchema,
  deckId: IdSchema,
  /** Número de hueco en cloze, 0 en básicas y 0 o 1 en las inversas (1 pregunta el reverso) */
  ordinal: z.int().min(0).max(100),
  createdAt: UtcDateTimeSchema,
  ...SyncShape,
});
export type Card = z.infer<typeof CardSchema>;

/** Si un registro sigue vivo, es decir, no tiene marca de borrado */
export function isLive(entity: { deletedAt?: string | null }): boolean {
  return entity.deletedAt === undefined || entity.deletedAt === null;
}

/** Cuándo cambió por última vez. Sin fecha de modificación vale la de creación */
export function modifiedAt(entity: { createdAt: string; updatedAt?: string | undefined }): string {
  return entity.updatedAt ?? entity.createdAt;
}

/**
 * Un mazo que el alumno puede cambiar, el que creó a mano o el que importó de otra app. Lo precargado
 * y los mazos que arma la app, como Mis errores, no se cambian (D-093)
 */
export function isEditableDeck(
  deck: { ownerId: string | null; origin: z.infer<typeof ContentOriginSchema> },
  userId: string,
): boolean {
  return deck.ownerId === userId && (deck.origin === 'manual' || deck.origin === 'imported');
}

/** Una tarjeta que la IA propuso a partir de un texto o PDF del alumno. Siempre es borrador (D-085) */
export function isAiNote(note: {
  origin: z.infer<typeof ContentOriginSchema>;
  sourceTitle?: string | null | undefined;
}): boolean {
  return note.origin === 'generated' && note.sourceTitle !== null && note.sourceTitle !== undefined;
}
