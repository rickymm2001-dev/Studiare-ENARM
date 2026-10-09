// Contenido de datos en src/demo/content, validado con sus esquemas al cargarse.
// Todo es borrador escrito por Claude y pendiente de revisión médica (11.1, 13).
import {
  BiasTaxonomySchema,
  BiasTipsSchema,
  StructureDictionarySchema,
  TopicTaxonomySchema,
} from '@/data/schemas/content';
import { readStoredOverrides } from '@/config/overridesStore';
import rawBiasTaxonomy from './bias-taxonomy.json';
import rawBiasTips from './bias-tips.json';
import rawStructureDictionary from './structure-dict.json';
import rawTopicTaxonomy from './topic-taxonomy.json';

export const topicTaxonomy = TopicTaxonomySchema.parse(rawTopicTaxonomy);

/**
 * Pesos del ENARM con los cambios que el admin guardó en este navegador. Los de fábrica son
 * provisionales (D-013). Una clave que ya no existe en la taxonomía se ignora
 */
export function applyWeightOverrides(
  taxonomy: typeof topicTaxonomy,
  weights: { branches: Readonly<Record<string, number>>; topics: Readonly<Record<string, number>> },
): void {
  for (const branch of taxonomy.branches) {
    branch.weight = weights.branches[branch.key] ?? branch.weight;
    for (const topic of branch.topics) {
      topic.weight = weights.topics[`${branch.key}/${topic.key}`] ?? topic.weight;
    }
  }
}

/** Los pesos de fábrica, para que el admin pueda mostrarlos y restablecerlos */
export const factoryWeights = {
  branches: Object.fromEntries(topicTaxonomy.branches.map((branch) => [branch.key, branch.weight])),
  topics: Object.fromEntries(
    topicTaxonomy.branches.flatMap((branch) =>
      branch.topics.map((topic) => [`${branch.key}/${topic.key}`, topic.weight] as const),
    ),
  ),
};

const storedWeights = readStoredOverrides()?.weights;
if (storedWeights) applyWeightOverrides(topicTaxonomy, storedWeights);
export const biasTaxonomy = BiasTaxonomySchema.parse(rawBiasTaxonomy);
export const biasTips = BiasTipsSchema.parse(rawBiasTips);
export const structureDictionary = StructureDictionarySchema.parse(rawStructureDictionary);

/** Claves de sesgo que se pueden usar como etiqueta de un distractor */
export const taggableBiasKeys: ReadonlySet<string> = new Set(
  biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key),
);
