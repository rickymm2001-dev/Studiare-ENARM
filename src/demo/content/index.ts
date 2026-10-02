// Contenido de datos en src/demo/content, validado con sus esquemas al cargarse.
// Todo es borrador escrito por Claude y pendiente de revisión médica (11.1, 13).
import {
  BiasTaxonomySchema,
  BiasTipsSchema,
  StructureDictionarySchema,
  TopicTaxonomySchema,
} from '@/data/schemas/content';
import rawBiasTaxonomy from './bias-taxonomy.json';
import rawBiasTips from './bias-tips.json';
import rawStructureDictionary from './structure-dict.json';
import rawTopicTaxonomy from './topic-taxonomy.json';

export const topicTaxonomy = TopicTaxonomySchema.parse(rawTopicTaxonomy);
export const biasTaxonomy = BiasTaxonomySchema.parse(rawBiasTaxonomy);
export const biasTips = BiasTipsSchema.parse(rawBiasTips);
export const structureDictionary = StructureDictionarySchema.parse(rawStructureDictionary);

/** Claves de sesgo que se pueden usar como etiqueta de un distractor */
export const taggableBiasKeys: ReadonlySet<string> = new Set(
  biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key),
);
