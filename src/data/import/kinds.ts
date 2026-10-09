// Qué tipo de nota de Studiare sale de una nota de otra app (D-009). Los tipos con nombre o
// estructura de cloze se importan como cloze. Una nota con las dos primeras cartas, la que pregunta
// el frente y la que pregunta el reverso, se importa como básica con inversa. Cualquier otro tipo
// se importa como básica, con el primer campo al frente y los demás al reverso.
import type { ImportNoteKind } from './types';

const CLOZE_HOLE = /\{\{c\d+::/;

export interface KindInput {
  /** El tipo de nota de origen es cloze según el archivo */
  declaredCloze: boolean;
  modelName: string;
  firstField: string;
  /** Números de carta que la nota tiene en el archivo */
  ordinals: ReadonlySet<number>;
  templateCount: number;
}

export function detectKind(input: KindInput): ImportNoteKind {
  if (
    input.declaredCloze ||
    /cloze|hueco/i.test(input.modelName) ||
    CLOZE_HOLE.test(input.firstField)
  )
    return 'cloze';
  if (input.templateCount >= 2 && input.ordinals.has(0) && input.ordinals.has(1))
    return 'basic_reverse';
  return 'basic';
}

/** Los campos de una nota de origen como frente y reverso. Los campos de más van al reverso */
export function splitFields(
  fields: readonly string[],
  separator: string,
): { front: string; back: string; extra: number } {
  const [front = '', ...rest] = fields;
  const filled = rest.filter((field) => field.trim() !== '');
  return { front, back: filled.join(separator), extra: Math.max(0, fields.length - 2) };
}
