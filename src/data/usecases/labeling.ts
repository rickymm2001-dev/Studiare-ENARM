// Doble etiquetado de distractores (7.11, pantalla 19). Cada médico etiqueta a ciegas, sin ver lo que
// puso el autor ni lo que puso otro médico, el sesgo de cada distractor de las preguntas de la
// muestra. Una etiqueta por médico y opción: etiquetar de nuevo la reemplaza. El acuerdo entre dos
// médicos sale de estas etiquetas.
import { stableUlid } from '@/demo/stableId';
import { biasTaxonomy } from '@/demo/content';
import type { DataApi } from '../context';
import type { BiasLabel, Option } from '../schemas/bank';
import type { User } from '../schemas/people';

type Api = Pick<DataApi, 'repos'>;

/** Semilla de la muestra, fija para que todos los médicos etiqueten las mismas preguntas */
export const DOUBLE_LABEL_SEED = 'doble-etiquetado-v1';
const ID_TIME = Date.UTC(2026, 0, 1);

/** Las etiquetas que se pueden poner a un distractor, con su definición a la vista (10.2) */
export const TAGGABLE_BIASES = biasTaxonomy.biases.filter((bias) => bias.taggable);

export const labelId = (physicianId: string, optionId: string) =>
  stableUlid(`bias-label|${physicianId}|${optionId}`, ID_TIME);

export class InvalidLabelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLabelError';
  }
}

/** Guarda la etiqueta de un médico para una opción. La correcta no se etiqueta */
export async function saveLabel(
  api: Api,
  physician: Pick<User, 'id' | 'role'>,
  option: Pick<Option, 'optionId' | 'isCorrect'>,
  tag: string,
  now: Date = new Date(),
): Promise<BiasLabel> {
  if (physician.role !== 'physician') {
    throw new InvalidLabelError('Solo un médico etiqueta distractores');
  }
  if (option.isCorrect) throw new InvalidLabelError('La opción correcta no lleva etiqueta');
  if (!TAGGABLE_BIASES.some((bias) => bias.key === tag)) {
    throw new InvalidLabelError('Esa etiqueta no existe o no se puede usar en un distractor');
  }
  const label: BiasLabel = {
    id: labelId(physician.id, option.optionId),
    optionId: option.optionId,
    physicianId: physician.id,
    biasTag: tag,
    labeledAt: now.toISOString(),
  };
  return api.repos.biasLabels.put(label);
}

/** Quita la etiqueta que el médico puso a una opción, por si se equivocó de opción */
export async function removeLabel(api: Api, physicianId: string, optionId: string): Promise<void> {
  await api.repos.biasLabels.remove(labelId(physicianId, optionId));
}
