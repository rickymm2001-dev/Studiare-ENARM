// Apuntes en esquema (Fase C2, Etapa 3, D-085 fila 2 y D-092). Un apunte es un árbol de líneas, como
// en RemNote. Escribir una marca en una línea la vuelve tarjeta del modelo de notas y tarjetas, y la
// nota guarda el ID del apunte y de la línea para seguir unida a ella. El apunte lleva fecha de
// modificación y marca de borrado como mazos, notas y tarjetas, para sincronizar entre dispositivos.
import { z } from 'zod';
import type { OutlineSubject } from '../../engines/outline';
import {
  countNodes,
  FREE_SUBJECT_MAX_LENGTH,
  OUTLINE_LIMITS,
  outlineDepth,
  type OutlineNode,
} from '../../engines/outlineLimits';
import { IdSchema, TaxonomyKeySchema, UtcDateTimeSchema } from './common';
import { SyncShape } from './decks';

/**
 * De qué es el apunte (B6 del plan del cambio). Un tema del ENARM con su rama y su clave, que cuenta
 * en las estadísticas del ENARM, o una materia libre de la carrera, que nunca cuenta
 */
export const OutlineSubjectSchema: z.ZodType<OutlineSubject> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('enarm'), branch: TaxonomyKeySchema, topic: TaxonomyKeySchema }),
  z.strictObject({
    kind: z.literal('free'),
    name: z
      .string()
      .trim()
      .min(1, 'Escribe el nombre de la materia')
      .max(FREE_SUBJECT_MAX_LENGTH, `La materia pasa de ${FREE_SUBJECT_MAX_LENGTH} caracteres`),
  }),
]);

/** Una línea del apunte con las que cuelgan de ella. El ID de la línea es estable entre ediciones */
export const OutlineNodeSchema: z.ZodType<OutlineNode> = z.lazy(() =>
  z.strictObject({
    id: IdSchema,
    text: z
      .string()
      .max(
        OUTLINE_LIMITS.maxFieldLength,
        `Una línea pasa de ${OUTLINE_LIMITS.maxFieldLength.toLocaleString('en-US')} caracteres`,
      ),
    children: z.array(OutlineNodeSchema),
  }),
);

/** Si dos líneas del árbol traen el mismo ID, la nota de una pisaría a la otra */
function hasDuplicateIds(nodes: readonly OutlineNode[]): boolean {
  const seen = new Set<string>();
  const pending = [...nodes];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (seen.has(node.id)) return true;
    seen.add(node.id);
    pending.push(...node.children);
  }
  return false;
}

export const OutlineSchema = z.strictObject({
  id: IdSchema,
  /** Quien lo escribe. Solo él lo puede editar */
  ownerId: IdSchema,
  title: z
    .string()
    .trim()
    .min(1, 'El título del apunte no puede quedar vacío')
    .max(
      OUTLINE_LIMITS.maxTitleLength,
      `El título del apunte pasa de ${OUTLINE_LIMITS.maxTitleLength} caracteres`,
    ),
  /** Mazo propio donde viven las tarjetas del apunte. El alumno lo elige (B6) */
  deckId: IdSchema,
  /**
   * Tema del ENARM o materia libre del apunte (B6). Ausente o null en un apunte sin tema, como todos
   * los de antes. Sus tarjetas llevan la etiqueta que le toca (subjectTags)
   */
  subject: OutlineSubjectSchema.nullable().optional(),
  /** Las líneas de primer nivel. Un apunte nuevo todavía no tiene ninguna */
  nodes: z
    .array(OutlineNodeSchema)
    .refine((nodes) => countNodes(nodes) <= OUTLINE_LIMITS.maxNodes, {
      message: `Un apunte llega a ${OUTLINE_LIMITS.maxNodes.toLocaleString('en-US')} líneas como máximo`,
    })
    .refine((nodes) => outlineDepth(nodes) <= OUTLINE_LIMITS.maxDepth, {
      message: `Un apunte llega a ${OUTLINE_LIMITS.maxDepth} niveles como máximo`,
    })
    .refine((nodes) => !hasDuplicateIds(nodes), {
      message: 'Dos líneas del apunte no pueden tener el mismo ID',
    }),
  createdAt: UtcDateTimeSchema,
  ...SyncShape,
});
export type Outline = z.infer<typeof OutlineSchema>;
