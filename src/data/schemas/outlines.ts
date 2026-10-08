// Apuntes en esquema (Fase C2, Etapa 3, D-085 fila 2 y D-092). Un apunte es un árbol de líneas, como
// en RemNote. Escribir una marca en una línea la vuelve tarjeta del modelo de notas y tarjetas, y la
// nota guarda el ID del apunte y de la línea para seguir unida a ella. El apunte lleva fecha de
// modificación y marca de borrado como mazos, notas y tarjetas, para sincronizar entre dispositivos.
import { z } from 'zod';
import { countNodes, OUTLINE_LIMITS, outlineDepth, type OutlineNode } from '../../engines/outline';
import { IdSchema, UtcDateTimeSchema } from './common';
import { SyncShape } from './decks';

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
  /** Mazo propio donde viven las tarjetas del apunte */
  deckId: IdSchema,
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
