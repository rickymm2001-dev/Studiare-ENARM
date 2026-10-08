// Apuntes en esquema (D-092). Un apunte es una lista de líneas con sangría. Cada línea que lleva una
// marca (::, ;; o un hueco) genera una nota en el mazo del apunte y guarda su ID para que, al
// editar la línea, la tarjeta conserve su historial de repaso. Lleva fecha de modificación y marca
// de borrado como los mazos, las notas y las tarjetas, para sincronizar entre dispositivos.
import { z } from 'zod';
import { OUTLINE_LINE_MAX, OUTLINE_LINES_MAX, OUTLINE_MAX_DEPTH } from '../../engines/outline';
import { IdSchema, UtcDateTimeSchema } from './common';
import { NoteTagSchema, SyncShape } from './decks';

export const OutlineLineSchema = z.strictObject({
  id: IdSchema,
  /** Nivel de sangría. 0 es el de arriba */
  depth: z.int().min(0).max(OUTLINE_MAX_DEPTH),
  /** Lo que escribió el alumno, con sus marcas, etiquetas y enlaces */
  text: z.string().max(OUTLINE_LINE_MAX),
  /** La nota que esta línea generó, o null si todavía no genera ninguna */
  noteId: IdSchema.nullable(),
});
export type OutlineLine = z.infer<typeof OutlineLineSchema>;

export const OutlinePageSchema = z.strictObject({
  id: IdSchema,
  ownerId: IdSchema,
  title: z.string().trim().min(1).max(120),
  /** Mazo propio donde viven las tarjetas de este apunte */
  deckId: IdSchema,
  /** Etiquetas que heredan todas las tarjetas del apunte */
  tags: z.array(NoteTagSchema).max(50).default([]),
  lines: z.array(OutlineLineSchema).max(OUTLINE_LINES_MAX),
  createdAt: UtcDateTimeSchema,
  ...SyncShape,
});
export type OutlinePage = z.infer<typeof OutlinePageSchema>;
