// Etiquetado a ciegas de distractores en la base local (7.11 y B11, 4.4 del plan de B11). El revisor de
// una pregunta en revisión etiqueta el sesgo de cada distractor sin ver lo que puso el autor. Una
// etiqueta por médico y opción, y etiquetar de nuevo la reemplaza mientras no termine. El acuerdo sale
// de comparar estas etiquetas con las del autor. Lo usa el repositorio editorial local.
import { stableUlid } from '@/demo/stableId';
import { biasTaxonomy } from '@/demo/content';
import type { DataApi } from '../context';
import type { BiasLabel, Option } from '../schemas/bank';
import type { User } from '../schemas/people';

type Api = Pick<DataApi, 'repos'>;

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
